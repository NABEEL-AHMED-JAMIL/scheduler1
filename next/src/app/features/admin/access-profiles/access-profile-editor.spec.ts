import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { PageCatalogueEntry, PageKey } from '../../../core/auth/page-keys';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccessProfile, AccessProfileDraft, AccessProfilesService } from './access-profiles.service';
import { AccessProfileEditor } from './access-profile-editor';
import { groupPages, menuPreview } from './page-groups';

/**
 * Owner 2026-10-19 #3: New access profile is a page, built for a long catalogue -- grouped by the menu's groups and hubs,
 * searchable and filterable, "select all" per group, "N of M pages", a read/edit pair as one row, and the menu the person
 * will see. Exercised with the real catalogue's keys and with a synthetic one of 64 pages.
 */
const REAL: PageCatalogueEntry[] = [
  { key: 'jobs', label: 'Schedules', section: 'Pipelines', route: '/pipelines/schedules' },
  { key: 'tasks', label: 'Pipelines', section: 'Pipelines', route: '/pipelines' },
  { key: 'queue', label: 'Queue', section: 'Pipelines', route: '/pipelines/queue' },
  { key: 'sources', label: 'Sources', section: 'Integration', route: '/integration/sources' },
  { key: 'analytics-dashboards', label: 'Saved Analyses', section: 'Data', route: '/data/analytics/dashboards' },
  { key: 'dashboards-edit', label: 'Edit dashboards', section: 'Data', route: '/data/analytics/dashboards' },
  { key: 'objects', label: 'Browse files', section: 'Documents', route: '/documents/files' },
];

/** Sixty-four pages in eight sections, every eighth the editing half of the one before. */
const MANY: PageCatalogueEntry[] = Array.from({ length: 64 }, (_, i) => ({
  key: `synthetic-${i}` as PageKey, label: `Synthetic page ${i}`, section: `Section ${Math.floor(i / 8)}`, route: `/s/${i}`,
  ...(i % 8 === 7 ? { editOf: `synthetic-${i - 1}` as PageKey } : {}),
}));

function editor(pages: PageCatalogueEntry[], profiles: AccessProfile[] = [], id: number | null = null,
  save = vi.fn((_draft: AccessProfileDraft) => of({ status: 'SUCCESS', message: 'Saved.', data: {} as AccessProfile }))) {
  TestBed.resetTestingModule();
  const navigate = vi.fn(() => Promise.resolve(true));
  TestBed.configureTestingModule({
    providers: [
      { provide: AccessProfilesService, useValue: { pages: () => of({ status: 'SUCCESS', message: '', data: pages }),
        list: () => of({ status: 'SUCCESS', message: '', data: profiles }), save } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false } },
      { provide: Router, useValue: { navigate } },
      { provide: ActivatedRoute, useValue: { snapshot: {
        paramMap: { get: (k: string) => (k === 'pageAccessProfileId' && id ? String(id) : null) },
        queryParamMap: { get: () => null } } } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new AccessProfileEditor());
  page.ngOnInit();
  return { page, save, navigate };
}

describe('groupPages', () => {
  it('groups the real catalogue by the menu: groups, hubs, and where each page opens', () => {
    const groups = groupPages(REAL);
    expect(groups.map(g => g.label)).toEqual(['Get data in', 'Build', 'Run & review', 'See results']);
    const build = groups.find(g => g.label === 'Build')!;
    expect(build.hubs[0].label).toBe('Pipelines');
    expect(build.hubs[0].rows.map(r => r.key)).toEqual(['jobs', 'tasks']);
    const sources = groups[0].hubs.find(h => h.label === 'Connections')!.rows.find(r => r.key === 'sources')!;
    expect(sources.places).toEqual(['Connections › Databases', 'Connections › Sources', 'Connections › Data contracts']);
  });

  it('joins a read/edit split into one row: Dashboards with an Edit box', () => {
    const results = groupPages(REAL).find(g => g.label === 'See results')!;
    const dashboards = results.hubs.flatMap(h => h.rows).find(r => r.key === 'analytics-dashboards')!;
    expect(dashboards.label).toBe('Dashboards');
    expect(dashboards.edit).toEqual({ key: 'dashboards-edit', label: 'Edit dashboards' });
    expect(results.hubs.flatMap(h => h.rows).some(r => r.key === 'dashboards-edit')).toBe(false);
  });

  it('keeps a catalogue of sixty-four pages whole, by its sections when the menu does not carry them', () => {
    const groups = groupPages(MANY);
    expect(groups).toHaveLength(8);
    expect(groups.flatMap(g => g.hubs.flatMap(h => h.rows))).toHaveLength(56);
    expect(groups[0].hubs[0].rows[6].edit?.key).toBe('synthetic-7');
  });
});

describe('AccessProfileEditor', () => {
  it('counts "N of M pages" and selects a whole group, or clears it, with its box', () => {
    const { page } = editor(MANY);
    expect(page.total()).toBe(64);
    expect(page.chosen()).toBe(0);
    const third = page.groups()[2];
    page.toggleAll(page.rowsOf(third));
    expect(page.chosen()).toBe(8);
    expect(page.stateOf(page.rowsOf(third))).toBe('all');
    page.toggleView(third.hubs[0].rows[0]);
    expect(page.stateOf(page.rowsOf(third))).toBe('some');
    page.toggleAll(page.rowsOf(third));
    expect(page.stateOf(page.rowsOf(third))).toBe('all');
    page.toggleAll(page.rowsOf(third));
    expect(page.chosen()).toBe(0);
  });

  it('finds pages by name, hub or group, and shows only the chosen or the rest', () => {
    const { page } = editor(MANY);
    page.search.set('page 17');
    expect(page.shownCount()).toBe(1);
    page.search.set('Section 3');
    expect(page.shownCount()).toBe(7);
    page.search.set('');
    page.toggleView(page.groups()[0].hubs[0].rows[0]);
    page.filter.set('on');
    expect(page.shownCount()).toBe(1);
    page.filter.set('off');
    expect(page.shownCount()).toBe(55);
  });

  it('brings View with Edit, and takes Edit away with View', () => {
    const { page } = editor(REAL);
    const row = page.groups().flatMap(g => g.hubs.flatMap(h => h.rows)).find(r => r.edit)!;
    page.toggleEdit(row);
    expect([...page.selected()].sort()).toEqual(['analytics-dashboards', 'dashboards-edit']);
    page.toggleView(row);
    expect(page.selected().size).toBe(0);
  });

  it('previews the menu a member on the profile will see', () => {
    const { page } = editor(REAL);
    page.toggleView(page.groups().find(g => g.label === 'Build')!.hubs[0].rows[0]);
    const groups = page.preview().map(g => g.label);
    expect(groups).toContain('Build');
    expect(groups).not.toContain('Administration & billing');
    expect(page.preview().find(g => g.label === 'Build')!.entries).toEqual([{ label: 'Pipelines', icon: 'list', tabs: ['Schedules & triggers'] }]);
  });

  it('refuses to save without a name, and saves the pages in catalogue order, the first profile as default', () => {
    const { page, save, navigate } = editor(REAL);
    page.save();
    expect(save).not.toHaveBeenCalled();
    page.form.patchValue({ profileName: '  Analyst ', description: ' Reads reports ' });
    page.toggleView(page.groups().flatMap(g => g.hubs.flatMap(h => h.rows)).find(r => r.key === 'objects')!);
    page.toggleView(page.groups().flatMap(g => g.hubs.flatMap(h => h.rows)).find(r => r.key === 'jobs')!);
    page.save();
    const draft = save.mock.calls[0][0];
    expect(draft).toEqual(expect.objectContaining({ profileName: 'Analyst', description: 'Reads reports', defaultProfile: true,
      pageKeys: ['jobs', 'objects'] }));
    expect(draft.pageAccessProfileId).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith(['/administration/access-profiles'], { queryParams: {} });
  });

  it('is the same page for an existing profile: its pages, name and id', () => {
    const viewer: AccessProfile = { pageAccessProfileId: 7, profileName: 'Viewer', description: 'Reads', defaultProfile: false,
      pageKeys: ['queue', 'analytics-dashboards'], userCount: 1 };
    const { page, save } = editor(REAL, [viewer], 7);
    expect(page.isEdit()).toBe(true);
    expect(page.chosen()).toBe(2);
    expect(page.form.get('profileName')!.value).toBe('Viewer');
    expect(page.form.get('defaultProfile')!.enabled).toBe(true);
    page.save();
    expect(save.mock.calls[0][0]).toEqual(expect.objectContaining({ pageAccessProfileId: 7, defaultProfile: false,
      pageKeys: ['queue', 'analytics-dashboards'] }));
  });

  it('says so when the profile is not in the workspace', () => {
    const { page } = editor(REAL, [], 99);
    expect(page.error()).toContain('not in this workspace');
  });
});

describe('menuPreview', () => {
  it('shows an administrator every workspace page and never the platform\'s', () => {
    const admin = menuPreview(() => false, true).map(g => g.label);
    expect(admin).toContain('Administration & billing');
    expect(admin).not.toContain('Platform');
  });
});

/** F3 (MIG-400): a page's tabs chosen apart, kept as tab keys after the page keys. */
describe('AccessProfileEditor: tabs', () => {
  const WITH_TABS: PageCatalogueEntry[] = [
    { key: 'jobs', label: 'Schedules', section: 'Pipelines', route: '/pipelines/schedules', tabs: [
      { key: 'jobs:schedules', label: 'Schedules & triggers', route: '/pipelines/schedules', apiGated: false },
      { key: 'jobs:backfills', label: 'Backfills', route: '/runs/backfills', apiGated: true }] },
    { key: 'queue', label: 'Queue', section: 'Pipelines', route: '/pipelines/queue' },
  ];

  it('opens every tab of a chosen page, restricts it tab by tab, and saves the tab keys', () => {
    const { page, save } = editor(WITH_TABS);
    page.form.patchValue({ profileName: 'Schedulers' });
    page.toggleView({ key: 'jobs', label: 'Schedules', places: [] });
    expect(page.tabOn('jobs', 'jobs:backfills')).toBe(true);
    expect(page.tabSummary('jobs')).toBe('Every tab');
    page.toggleTab('jobs', 'jobs:backfills');
    expect(page.tabOn('jobs', 'jobs:backfills')).toBe(false);
    expect(page.tabSummary('jobs')).toBe('1 of 2 tabs');
    page.save();
    expect(save.mock.calls[0][0].pageKeys).toEqual(['jobs', 'jobs:schedules']);
    // Both back on: every tab again, no tab key kept.
    page.toggleTab('jobs', 'jobs:backfills');
    expect([...page.selected()]).toEqual(['jobs']);
    // The last tab off takes the page with it.
    page.toggleTab('jobs', 'jobs:backfills');
    page.toggleTab('jobs', 'jobs:schedules');
    expect(page.isOn('jobs')).toBe(false);
  });
});
