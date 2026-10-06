import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Tasks } from './tasks';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * MIG-296 (review tasks#24): a platform administrator's task list holds every workspace's tasks
 * with nothing to tell them apart. The server tags each row with its workspace; the table gets a
 * Workspace column, each card a line naming it, and the toolbar a Workspace filter. A tenant
 * administrator or user sees one workspace, so for them nothing changes.
 */
type Role = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

const task = (over: Record<string, unknown>) => ({
  taskDetailId: 1, taskName: 'Task', taskStatus: 'Active', pipelineId: 'F100',
  sourceTaskType: { sourceTaskTypeId: 5, serviceName: 'Scraper', queueTopicPartition: 'topic=scrape&partitions=[*]' },
  ...over,
});

const ROWS = [
  task({ taskDetailId: 21, taskName: 'Hurricanes ETL', tenantId: 1, tenantName: 'Acme Ops' }),
  task({ taskDetailId: 22, taskName: 'Storm feed', tenantId: 2, tenantName: 'Borealis', pipelineId: 'F200' }),
  // Identity could not be asked for this one's name.
  task({ taskDetailId: 23, taskName: 'Tide tables', tenantId: 3 }),
];

async function render(role: Role, view: 'table' | 'cards' = 'table') {
  TestBed.resetTestingModule();
  const admin = role !== 'TENANT_USER';
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: { get: () => of({}), post: () => of({ status: 'SUCCESS', data: ROWS }), put: () => of({}) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
      { provide: AuthService, useValue: {
        user: () => null, canManageTasks: () => admin, builderLocked: () => false, isPlatformAdmin: () => role === 'PLATFORM_ADMIN',
      } },
    ],
  });
  const fixture = TestBed.createComponent(Tasks);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.componentInstance.view.set(view);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const headings = () => Array.from(el.querySelectorAll('thead th')).map(th => (th.textContent ?? '').trim());
  const cards = () => Array.from(el.querySelectorAll('article')).map(a => (a.textContent ?? '').replace(/\s+/g, ' '));
  return { fixture, component: fixture.componentInstance, el, headings, cards, workspaceFilter: () => el.querySelector('#tasks-tenant') };
}

describe('Tasks workspace column, card line and filter', () => {
  // The layout choice is remembered in storage; each case starts from the one it asks for.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('for a platform administrator', () => {
    it('shows a Workspace column after Pipeline, with each row\'s workspace', async () => {
      const { el, headings } = await render('PLATFORM_ADMIN');
      const heads = headings();
      const at = heads.indexOf('Workspace');
      expect(at).toBe(heads.indexOf('Pipeline') + 1);
      const cells = Array.from(el.querySelectorAll('tbody > tr')).map(tr => (tr.children[at]?.textContent ?? '').trim());
      expect(cells).toEqual(['Acme Ops', 'Borealis', 'Workspace #3']);
    });

    it('names the workspace on each card', async () => {
      const { cards } = await render('PLATFORM_ADMIN', 'cards');
      const shown = cards();
      expect(shown[0]).toContain('Acme Ops');
      expect(shown[1]).toContain('Borealis');
      expect(shown[2]).toContain('Workspace #3');
    });

    it('filters by workspace alongside topic, pipeline and search, and Clear resets it', async () => {
      const { component, workspaceFilter } = await render('PLATFORM_ADMIN');
      expect(workspaceFilter()).not.toBeNull();
      expect(component.workspaceOptions().map(o => o.label)).toEqual(['Acme Ops', 'Borealis', 'Workspace #3']);

      component.workspaceFilter.set('2');
      expect(component.filtered().map(t => t.taskDetailId)).toEqual([22]);
      component.pipelineFilter.set('F100');
      expect(component.filtered()).toEqual([]);
      expect(component.hasFilters()).toBe(true);

      component.clearFilters();
      expect(component.workspaceFilter()).toBe('');
      expect(component.filtered()).toHaveLength(3);
    });

    it('finds a task by its workspace name, the fallback name included', async () => {
      const { component } = await render('PLATFORM_ADMIN');
      component.search.set('acme');
      expect(component.filtered().map(t => t.taskDetailId)).toEqual([21]);
      component.search.set('workspace #3');
      expect(component.filtered().map(t => t.taskDetailId)).toEqual([23]);
    });

    it('widens the payload row by one so it still spans the whole table', async () => {
      const { component, fixture, el, headings } = await render('PLATFORM_ADMIN');
      component.expanded.set(new Set([21]));
      fixture.detectChanges();
      // A leading empty cell, then the one that spans the rest.
      expect(Number(el.querySelector('tbody td[colspan]')!.getAttribute('colspan')) + 1).toBe(headings().length);
    });
  });

  for (const role of ['TENANT_ADMIN', 'TENANT_USER'] as const) {
    it(`leaves the ${role} table, cards and toolbar exactly as they were`, async () => {
      const table = await render(role);
      expect(table.headings()).not.toContain('Workspace');
      expect(table.workspaceFilter()).toBeNull();
      expect(table.el.textContent).not.toContain('Acme Ops');
      table.component.search.set('acme');
      expect(table.component.filtered()).toEqual([]);
      table.component.search.set('');
      table.component.expanded.set(new Set([21]));
      table.fixture.detectChanges();
      expect(table.el.querySelector('tbody td[colspan]')!.getAttribute('colspan')).toBe('9');

      const cards = await render(role, 'cards');
      expect(cards.cards().join(' ')).not.toMatch(/Acme Ops|Borealis|Workspace #3/);
    });
  }
});
