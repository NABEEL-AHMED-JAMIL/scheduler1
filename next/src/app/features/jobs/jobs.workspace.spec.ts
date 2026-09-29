import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subject, of } from 'rxjs';
import { Jobs, SourceJob } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * MIG-296 (review jobs#18): a platform administrator's job list holds every workspace's jobs mixed
 * together. The server tags each row with its workspace; the list shows it in a Workspace column
 * and narrows by it. A tenant administrator or user only ever sees their own workspace, so for them the
 * screen must not change at all.
 */
type Role = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

const job = (over: Partial<SourceJob>): SourceJob => ({
  jobId: 1, jobName: 'Job', jobStatus: 'Active', jobRunningStatus: 'Completed', ...over,
});

const ROWS: SourceJob[] = [
  job({ jobId: 11, jobName: 'Nightly import', tenantId: 1, tenantName: 'Acme Ops' }),
  job({ jobId: 12, jobName: 'Hourly sync', tenantId: 2, tenantName: 'Borealis' }),
  // Identity could not be asked for this one's name.
  job({ jobId: 13, jobName: 'Weekly report', tenantId: 3 }),
];

async function render(role: Role, rows: SourceJob[] = ROWS) {
  TestBed.resetTestingModule();
  const admin = role !== 'TENANT_USER';
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: rows }), post: () => of({ status: 'SUCCESS', data: [] }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: AuthService, useValue: {
        user: signal(null), isTenantAdmin: signal(admin), canManageTasks: signal(admin), builderLocked: signal(false),
        isPlatformAdmin: signal(role === 'PLATFORM_ADMIN'),
      } },
      { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
    ],
  });
  const fixture = TestBed.createComponent(Jobs);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const headings = () => Array.from(el.querySelectorAll('thead th')).map(th => (th.textContent ?? '').trim());
  const bodyRows = () => Array.from(el.querySelectorAll('tbody > tr'));
  const workspaceFilter = () => el.querySelector('#jobs-tenant');
  return { fixture, component: fixture.componentInstance, el, headings, bodyRows, workspaceFilter };
}

describe('Jobs workspace column and filter (platform administrator)', () => {
  it('shows a Workspace column after Job, with each row\'s workspace', async () => {
    const { headings, bodyRows } = await render('PLATFORM_ADMIN');
    const heads = headings();
    expect(heads).toContain('Workspace');
    expect(heads.indexOf('Workspace')).toBe(heads.indexOf('Job') + 1);
    const at = heads.indexOf('Workspace');
    const cells = bodyRows().map(tr => (tr.children[at]?.textContent ?? '').trim());
    expect(cells).toEqual(['Acme Ops', 'Borealis', 'Workspace #3']);
  });

  it('offers a Workspace filter whose options are the workspaces in the list', async () => {
    const { component, workspaceFilter } = await render('PLATFORM_ADMIN');
    expect(workspaceFilter()).not.toBeNull();
    expect(component.workspaceOptions().map(o => o.label)).toEqual(['Acme Ops', 'Borealis', 'Workspace #3']);
  });

  it('narrows to one workspace, combines with the other filters, and Clear resets it', async () => {
    const { component, fixture } = await render('PLATFORM_ADMIN', [
      ...ROWS,
      job({ jobId: 14, jobName: 'Nightly export', tenantId: 1, tenantName: 'Acme Ops', jobRunningStatus: 'Failed' }),
    ]);
    component.workspaceFilter.set('1');
    expect(component.filtered().map(j => j.jobId)).toEqual([11, 14]);
    expect(component.hasFilters()).toBe(true);

    component.statusFilter.set('Failed');
    expect(component.filtered().map(j => j.jobId)).toEqual([14]);

    component.clearFilters();
    fixture.detectChanges();
    expect(component.workspaceFilter()).toBe('');
    expect(component.filtered()).toHaveLength(4);
  });

  it('finds a job by its workspace name in the search box, the fallback name included', async () => {
    const { component } = await render('PLATFORM_ADMIN');
    component.search.set('borealis');
    expect(component.filtered().map(j => j.jobId)).toEqual([12]);
    component.search.set('workspace #3');
    expect(component.filtered().map(j => j.jobId)).toEqual([13]);
  });

  it('widens the detail row by one so it still spans the whole table', async () => {
    const { component, fixture, el, headings } = await render('PLATFORM_ADMIN');
    component.expanded.set(new Set([11]));
    fixture.detectChanges();
    const detail = el.querySelector<HTMLTableCellElement>('tbody td[colspan]')!;
    expect(Number(detail.getAttribute('colspan'))).toBe(headings().length);
  });
});

describe('Jobs for everyone else: no workspace column, no filter', () => {
  for (const role of ['TENANT_ADMIN', 'TENANT_USER'] as const) {
    it(`leaves the ${role} list exactly as it was`, async () => {
      const { headings, workspaceFilter, component, fixture, el } = await render(role);
      expect(headings()).not.toContain('Workspace');
      expect(workspaceFilter()).toBeNull();
      expect(el.textContent).not.toContain('Acme Ops');
      // Nor does the workspace name reach the search, where it would match rows for no visible reason.
      component.search.set('acme');
      expect(component.filtered()).toHaveLength(0);
      component.search.set('');
      component.expanded.set(new Set([11]));
      fixture.detectChanges();
      expect(el.querySelector('tbody td[colspan]')!.getAttribute('colspan')).toBe('13');
    });
  }
});
