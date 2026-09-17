import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PageCatalogueEntry } from '../../../core/auth/page-keys';
import { AccessPerson, AccessProfile } from './access-profiles.service';
import { AccessPeopleGrid } from './access-people-grid';

const PAGES: PageCatalogueEntry[] = [
  { key: 'jobs', label: 'Source Jobs', section: 'Pipelines', route: '/jobs' },
  { key: 'queue', label: 'Queue', section: 'Pipelines', route: '/queue' },
  { key: 'reports', label: 'Reports', section: 'Pipelines', route: '/reports' },
  { key: 'objects', label: 'Browse files', section: 'Object Browser', route: '/objects' },
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

  it('offers, per cell, exactly the profiles that would change it', () => {
    const g = grid([person(44, 'Olivia Bennett', 1, 'Operator', ['jobs', 'queue'])]);
    const cells = g.groups()[0].rows[0].cells;
    expect(cells[2].open).toBe(false);
    expect(cells[2].alternatives.map(p => p.profileName)).toEqual(['Analyst', 'Compliance']); // reports
    expect(cells[1].alternatives.map(p => p.profileName)).toEqual(['Compliance']);            // queue
    expect(cells[0].alternatives).toEqual([]);                                                // jobs: everyone has it
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
