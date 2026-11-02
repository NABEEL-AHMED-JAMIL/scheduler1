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
 * Reports redesign (owner 2026-11-02): the gallery reads every template once -- the live ones and the archived ones, 200
 * at a time -- and sorts, groups and filters them in the browser. One order for the cards and the table: Most used first,
 * Name or Recently changed from the switch, any table heading too. Mark as test hides a card at once.
 */
const tpl = (n: number, over: Partial<TemplateRow> = {}): TemplateRow => ({ templateId: `T${n}`, tenantId: 2960, name: `Template ${n}`, status: 'PUBLISHED',
  currentPublishedVersion: 1, hasDraft: false, origin: 'BLANK', tags: [], rowVersion: 3, updatedAt: `2026-10-${10 + n}T10:00:00Z`, reportCount: n,
  category: 'Clinical quality', test: false, ...over } as TemplateRow);
const STARTERS: StarterRow[] = [{ key: 'a', name: 'Wound care', category: 'Clinical quality', components: 4 }];
const lib = (rows: TemplateRow[], total = rows.length): TemplateLibrary =>
  ({ templates: rows, starters: STARTERS, total, counts: { templates: total }, categories: [] });

function screenWith(live: (q: TemplateQuery) => TemplateLibrary, archived: TemplateRow[] = []) {
  const api = {
    list: vi.fn((q: TemplateQuery, _t?: number | null) => of(q.archived ? lib(archived) : live(q))),
    templateThumbnail: vi.fn(() => of({ body: null, headers: { get: () => '' } })),
    brandProfiles: vi.fn(() => of([])),
    setTags: vi.fn((templateId: string, tags: string[]) => of({ templateId, tags, test: tags.includes('test'), rowVersion: 4 })),
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

describe('Templates gallery -- reading every template', () => {
  it('reads the live and the archived templates, 200 at a time, and pages on past 200', () => {
    const all = Array.from({ length: 230 }, (_, i) => tpl(i + 1));
    const { api, screen } = screenWith(q => lib(all.slice(q.offset!, q.offset! + q.limit!), 230), [tpl(900, { status: 'ARCHIVED' })]);
    expect(api.list.mock.calls.map(c => `${c[0].archived}:${c[0].limit}:${c[0].offset}`).sort()).toEqual(['false:200:0', 'false:200:200', 'true:200:0']);
    expect(screen.rows().length).toBe(231);
    expect(screen.visible().length).toBe(230);
    expect(screen.capped()).toBe(false);
    expect(screen.counts().status.find(s => s.value === 'archived')!.count).toBe(1);
  });

  it('the cards and the table share one order: Most used first, then the switch or a heading', () => {
    const { screen } = screenWith(() => lib([tpl(1, { name: 'Bravo' }), tpl(3, { name: 'alpha', category: 'Imaging' }), tpl(2, { name: 'Charlie' })]));
    expect(screen.sortPick()).toBe('used');
    expect(screen.visible().map(t => t.templateId)).toEqual(['T3', 'T2', 'T1']);
    screen.setSort('name');
    expect(screen.visible().map(t => t.name)).toEqual(['alpha', 'Bravo', 'Charlie']);
    screen.setSort('changed');
    expect(screen.visible().map(t => t.templateId)).toEqual(['T3', 'T2', 'T1']);
    screen.sort.toggle('category');
    expect(screen.visible().map(t => t.name)).toEqual(['Bravo', 'Charlie', 'alpha']);
    // The cards: the biggest category first, each in the order picked.
    expect(screen.groups().map(g => [g.label, g.templates.map(t => t.templateId)])).toEqual([['Clinical quality', ['T1', 'T2']], ['Imaging', ['T3']]]);
  });

  it('hides the test templates and says how many; "Show them" brings them back', () => {
    const { screen } = screenWith(() => lib([tpl(1), tpl(2, { test: true, tags: ['test'] }), tpl(3, { tags: ['test'] })]));
    expect(screen.visible().map(t => t.templateId)).toEqual(['T1']);
    expect(screen.hiddenTests()).toBe(2);
    screen.setHidden('tests', true);
    expect(screen.visible().length).toBe(3);
    expect(screen.hiddenTests()).toBe(0);
  });

  it('Mark as test sends the tags with "test" added and hides the card; Not a test brings it back', () => {
    const { api, screen } = screenWith(() => lib([tpl(1, { tags: ['wound'] }), tpl(2)]));
    screen.markTest(screen.visible().find(t => t.templateId === 'T1')!, true);
    expect(api.setTags).toHaveBeenCalledWith('T1', ['wound', 'test'], 3);
    expect(screen.visible().map(t => t.templateId)).toEqual(['T2']);
    expect(screen.rows().find(t => t.templateId === 'T1')!.rowVersion).toBe(4);
    screen.setHidden('tests', true);
    screen.markTest(screen.rows().find(t => t.templateId === 'T1')!, false);
    expect(api.setTags).toHaveBeenLastCalledWith('T1', ['wound'], 4);
    screen.setHidden('tests', false);
    expect(screen.visible().map(t => t.templateId).sort()).toEqual(['T1', 'T2']);
  });

  it('facets narrow the cards; Clear keeps what Hidden shows; an empty workspace is told apart from no match', () => {
    const { screen } = screenWith(() => lib([tpl(1), tpl(2, { category: 'Imaging', status: 'DRAFT', currentPublishedVersion: null, hasDraft: true })]));
    screen.toggle('status', 'draftOnly');
    expect(screen.visible().map(t => t.templateId)).toEqual(['T2']);
    screen.toggle('category', 'Clinical quality');
    expect(screen.visible()).toEqual([]);
    expect(screen.noTemplates()).toBe(false);
    screen.setHidden('starters', true);
    screen.clearFilters();
    expect(screen.filtering()).toBe(false);
    expect(screen.filters().starters).toBe(true);
    expect(screen.shownStarters().map(s => s.key)).toEqual(['a']);
    const empty = screenWith(() => lib([]));
    expect(empty.screen.noTemplates()).toBe(true);
  });
});
