import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PageCatalogueEntry } from '../../../core/auth/page-keys';
import { AccessPerson, AccessProfile } from './access-profiles.service';
import { AccessPeopleGrid } from './access-people-grid';

const PAGES: PageCatalogueEntry[] = [
  { key: 'jobs', label: 'Source Jobs', section: 'Pipelines', route: '/operations/jobs' },
  { key: 'queue', label: 'Queue', section: 'Pipelines', route: '/operations/queue' },
  { key: 'reports', label: 'Reports', section: 'Pipelines', route: '/operations/reports' },
  { key: 'objects', label: 'Browse files', section: 'Object Browser', route: '/objects/files' },
  { key: 'tools-converter', label: 'Document Converter', section: 'Tools', route: '/tools/converter' },
];
const profile = (id: number, name: string, keys: string[], isDefault = false): AccessProfile =>
  ({ pageAccessProfileId: id, profileName: name, defaultProfile: isDefault, pageKeys: keys as any, userCount: 0, userNames: [] });
const person = (id: number, name: string, profileId: number | null, profileName: string | null, keys: string[], position = ''): AccessPerson =>
  ({ appUserId: id, fullName: name, username: name.toLowerCase().replace(' ', '.') + '@a.example', position, status: 'Active',
     pageAccessProfileId: profileId, pageAccessProfileName: profileName, pageKeys: keys as any });

const OPERATOR = profile(1, 'Operator', ['jobs', 'queue'], true);
const ANALYST = profile(2, 'Analyst', ['jobs', 'queue', 'reports']);
const COMPLIANCE = profile(3, 'Compliance', ['jobs', 'reports']);

function grid(people: AccessPerson[], search = '') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(AccessPeopleGrid);
  fixture.componentRef.setInput('people', people);
  fixture.componentRef.setInput('profiles', [OPERATOR, ANALYST, COMPLIANCE]);
  fixture.componentRef.setInput('pages', PAGES);
  fixture.componentRef.setInput('search', search);
  return fixture.componentInstance;
}

/**
 * The grid's two groupings -- columns under their menu section, rows under the profile they
 * share -- and the cell menu's offer, all computed once rather than per cell per render.
 */
describe('AccessPeopleGrid', () => {
  it('groups the columns under their menu section, in catalogue order', () => {
    const g = grid([]);
    expect(g.groupsOfColumns().map(c => [c.section, c.pages.length])).toEqual([['Pipelines', 3], ['Object Browser', 1], ['Tools', 1]]);
    expect([0, 1, 2, 3, 4].map(i => g.isFirstOfSection(i))).toEqual([false, false, false, true, true]);
  });

  // The live catalogue interleaves sections (Documents, Data, Documents, AI, Integration, Documents...): each section is
  // one header over all its pages, in the order sections first appear, and every row's cells follow the same order.
  it('keeps each section in one group when the catalogue interleaves them', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AccessPeopleGrid);
    const mixed: PageCatalogueEntry[] = [
      { key: 'jobs', label: 'Schedules', section: 'Pipelines', route: '/a' },
      { key: 'objects', label: 'Browse files', section: 'Documents', route: '/b' },
      { key: 'analytics', label: 'Analytics Studio', section: 'Data', route: '/c' },
      { key: 'tools-converter', label: 'Document Converter', section: 'Documents', route: '/d' },
      { key: 'queue', label: 'Queue', section: 'Pipelines', route: '/e' },
    ];
    fixture.componentRef.setInput('people', [person(45, 'Ava Patel', null, null, ['jobs', 'tools-converter'])]);
    fixture.componentRef.setInput('profiles', [OPERATOR]);
    fixture.componentRef.setInput('pages', mixed);
    fixture.componentRef.setInput('search', '');
    const g = fixture.componentInstance;

    expect(g.groupsOfColumns().map(c => [c.section, c.pages.map(p => p.key)])).toEqual([
      ['Pipelines', ['jobs', 'queue']], ['Documents', ['objects', 'tools-converter']], ['Data', ['analytics']]]);
    expect(g.columns().map(p => p.key)).toEqual(['jobs', 'queue', 'objects', 'tools-converter', 'analytics']);
    expect(g.groups()[0].rows[0].cells.map(c => c.page.key)).toEqual(['jobs', 'queue', 'objects', 'tools-converter', 'analytics']);
    expect(g.groups()[0].rows[0].cells.map(c => c.open)).toEqual([true, false, false, true, false]);
    fixture.detectChanges();
    const headers = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.access-grid-page')).map(th => th.textContent!.trim());
    expect(headers).toEqual(['Schedules', 'Queue', 'Browse files', 'Document Converter', 'Analytics Studio']);
  });

  it('groups people under their profile, default group first, with the profile\'s own pattern on the header', () => {
    const g = grid([
      person(44, 'Olivia Bennett', 2, 'Analyst', ['jobs', 'queue', 'reports']),
      person(45, 'Ava Patel', null, null, ['jobs', 'queue']),
      person(46, 'Noah Kim', 1, 'Operator', ['jobs', 'queue']),
    ]);
    const groups = g.groups();
    expect(groups.map(x => x.title)).toEqual(['Default · Operator', 'Analyst', 'Operator']);
    expect(groups[0].rows.map(r => r.person.fullName)).toEqual(['Ava Patel']);
    expect(groups[0].opens).toEqual([true, true, false, false, false]);
    expect(groups[1].opens).toEqual([true, true, true, false, false]);
  });

  it('marks a cell as an exception when the person differs from their profile', () => {
    // Olivia is on Operator (jobs, queue) but has reports opened and queue withheld for her alone.
    const g = grid([person(44, 'Olivia Bennett', 1, 'Operator', ['jobs', 'reports'])]);
    const row = g.groups()[0].rows[0];
    expect(row.cells.map(c => [c.page.key, c.open, c.exception])).toEqual([
      ['jobs', true, false], ['queue', false, true], ['reports', true, true], ['objects', false, false], ['tools-converter', false, false],
    ]);
    expect(row.exceptions).toBe(2);
  });

  it('emits a toggle with what the checkbox now says, and a reset for the row', () => {
    const g = grid([person(44, 'Olivia Bennett', 1, 'Operator', ['jobs', 'queue'])]);
    const toggles: unknown[] = []; const resets: unknown[] = [];
    g.toggle.subscribe(e => toggles.push(e)); g.reset.subscribe(e => resets.push(e));
    const olivia = g.groups()[0].rows[0].person;
    g.onToggle(olivia, PAGES[2], true);
    expect(toggles).toEqual([{ person: olivia, page: PAGES[2], allowed: true }]);
    g.reset.emit(olivia);
    expect(resets).toEqual([olivia]);
  });

  it('filters people by name, email or position without losing the grouping', () => {
    const g = grid([
      person(44, 'Olivia Bennett', 1, 'Operator', ['jobs'], 'Data Analyst'),
      person(45, 'Ava Patel', 1, 'Operator', ['jobs'], 'Operations Analyst'),
      person(46, 'Noah Kim', 2, 'Analyst', ['jobs'], 'QA Engineer'),
    ], 'analyst');
    // Server order is kept (it sorts by name); the filter only removes rows.
    expect(g.groups().flatMap(x => x.rows.map(r => r.person.fullName))).toEqual(['Olivia Bennett', 'Ava Patel']);
    expect(g.shown()).toBe(2);
  });

  it('emits an assignment from the row picker and ignores a no-op', () => {
    const g = grid([person(44, 'Olivia Bennett', 1, 'Operator', ['jobs'])]);
    const emitted: unknown[] = [];
    g.assign.subscribe(e => emitted.push(e));
    const olivia = g.groups()[0].rows[0].person;
    g.pick(olivia, '2');
    expect(emitted).toEqual([{ person: olivia, profile: ANALYST }]);
    g.pick(olivia, '');
    expect(emitted[1]).toEqual({ person: olivia, profile: null });
    g.pick(olivia, '1');
    expect(emitted.length).toBe(2);
  });
});

/**
 * A profile choice the server refused. The select showed what the person picked -- nothing in
 * the model had changed, so nothing redrew it -- and the grid claimed an assignment that never
 * happened. The select follows the model: back at once, and moved only by the server's answer.
 */
describe('AccessPeopleGrid profile select', () => {
  function rendered(people: AccessPerson[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AccessPeopleGrid);
    fixture.componentRef.setInput('people', people);
    fixture.componentRef.setInput('profiles', [OPERATOR, ANALYST, COMPLIANCE]);
    fixture.componentRef.setInput('pages', PAGES);
    fixture.componentRef.setInput('search', '');
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('.access-grid-profile select')!;
    return { fixture, select };
  }

  it('does not keep showing a choice until the server has accepted it', () => {
    const ada = person(5, 'Ada King', 2, 'Analyst', ['jobs', 'queue', 'reports']);
    const { fixture, select } = rendered([ada]);
    const emitted: unknown[] = [];
    fixture.componentInstance.assign.subscribe(e => emitted.push(e));

    select.value = '3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(select.value).toBe('2');
  });

  it('moves once the row comes back with the new profile', () => {
    const ada = person(5, 'Ada King', 2, 'Analyst', ['jobs', 'queue', 'reports']);
    const { fixture, select } = rendered([ada]);
    select.value = '3';
    select.dispatchEvent(new Event('change'));

    fixture.componentRef.setInput('people', [{ ...ada, pageAccessProfileId: 3, pageAccessProfileName: 'Compliance' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.access-grid-profile select').value).toBe('3');
  });
});

describe('P2 #34: the people grid draws a page of people at a time', () => {
  it('pages the matching people, group by group, and a search starts again from the first page', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      person(1000 + i, `Person ${String(i).padStart(3, '0')}`, i % 2 ? 2 : null, i % 2 ? 'Analyst' : null, ['jobs']));
    const g = grid(many);
    expect(g.matchCount()).toBe(120);
    expect(g.shown()).toBe(50);
    // Default first: the 60 without a profile fill page one, then the Analysts.
    expect(g.groups().map(x => x.key)).toEqual(['default']);
    g.page.set(3);
    expect(g.shown()).toBe(20);
    expect(g.groups().map(x => x.key)).toEqual(['2']);
  });
});
