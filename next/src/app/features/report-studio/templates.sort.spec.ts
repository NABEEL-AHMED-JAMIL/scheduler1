import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ToastService } from '../../shared/ui/toast.service';
import { ReportStudioApi, TemplateQuery } from './report-studio.api';
import { StarterRow, TemplateLibrary, TemplateRow } from './report-studio.model';
import { RsTabCounts } from './rs-tab-counts';
import { ReportTemplates } from './templates';

/**
 * Owner 2026-10-27 ("add a sort on each table"): the Templates table's headings sort the workspace's templates on the
 * server; the starters, which come whole with every answer, stay in their block after them and are sorted here by the
 * same column (by name or category; by From or Updated they keep their order). No read names a sort before a pick;
 * a pick goes back to page 1.
 */
const tpl = (n: number): TemplateRow => ({ templateId: `T${n}`, tenantId: 2960, name: `Template ${n}`, status: 'PUBLISHED',
  currentPublishedVersion: 1, hasDraft: false, origin: 'BLANK', tags: [], updatedAt: '2026-10-20T10:00:00Z' } as unknown as TemplateRow);
const starter = (key: string, name: string, category: string | null): StarterRow => ({ key, name, category, components: 4 });
const STARTERS = [starter('b', 'Lab results', 'Clinical'), starter('a', 'Wound care', 'Billing'), starter('c', 'Discharge', null)];
const lib = (rows: TemplateRow[], total: number): TemplateLibrary =>
  ({ templates: rows, starters: STARTERS, total, counts: { templates: total }, categories: [] });

function screenWith() {
  const api = {
    list: vi.fn((_q: TemplateQuery, _t?: number | null) => of(lib([tpl(1), tpl(2)], 2))),
    templateThumbnail: vi.fn(() => of({ body: null, headers: { get: () => '' } })),
    brandProfiles: vi.fn(() => of([])),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      { provide: ReportStudioApi, useValue: api },
      { provide: RsTabCounts, useValue: { refresh: vi.fn() } },
      { provide: Dialog, useValue: { open: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: WorkspaceDirectory, useValue: { remembered: () => null } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, canOpen: () => true, role: () => 'TENANT_USER',
        user: signal({ appUserId: 4640 }) } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new ReportTemplates());
  screen.ngOnInit();
  return { api, screen };
}

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('Templates -- server-side sort (owner 2026-10-27)', () => {
  it('names no sort before a heading is picked; Updated, newest first, is the table\'s own order', () => {
    const { api, screen } = screenWith();
    expect(api.list.mock.calls[0][0].sort).toBeUndefined();
    expect(screen.sort.ariaSort('updated')).toBe('descending');
    expect(screen.filtered().map(i => i.id)).toEqual(['T1', 'T2', 'starter:b', 'starter:a', 'starter:c']);
  });

  it('a heading sends its column both ways from page 1', () => {
    const { api, screen } = screenWith();
    screen.goTo(2);
    screen.sort.toggle('template');
    expect(screen.page()).toBe(1);
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name', dir: 'asc', offset: 0 }), null);
    screen.sort.toggle('template');
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name', dir: 'desc', offset: 0 }), null);
    screen.sort.toggle('from');
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'from', dir: 'asc' }), null);
    screen.sort.toggle('category');
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'category', dir: 'asc' }), null);
    screen.sort.toggle('updated');
    expect(api.list.mock.calls.at(-1)![0].sort).toBeUndefined();
  });

  it('the starters keep their block after the templates and sort by the same column there', () => {
    const { screen } = screenWith();
    screen.sort.toggle('template');
    // The service sorted the templates (the fake answers them as they are); the starters A to Z by name after them.
    expect(screen.filtered().map(i => i.id)).toEqual(['T1', 'T2', 'starter:c', 'starter:b', 'starter:a']);
    screen.sort.toggle('template');
    expect(screen.filtered().map(i => i.id)).toEqual(['T1', 'T2', 'starter:a', 'starter:b', 'starter:c']);
    // By category: the one with none goes last, both ways.
    screen.sort.toggle('category');
    expect(screen.filtered().map(i => i.id)).toEqual(['T1', 'T2', 'starter:a', 'starter:b', 'starter:c']);
    screen.sort.toggle('category');
    expect(screen.filtered().map(i => i.id)).toEqual(['T1', 'T2', 'starter:b', 'starter:a', 'starter:c']);
    // By From: they have no maker of their own, so they keep their order.
    screen.sort.toggle('from');
    expect(screen.filtered().map(i => i.id)).toEqual(['T1', 'T2', 'starter:b', 'starter:a', 'starter:c']);
  });
});
