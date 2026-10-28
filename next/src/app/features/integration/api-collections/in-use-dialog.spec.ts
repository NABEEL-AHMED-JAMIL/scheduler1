import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { InUseData, InUseDialog } from './in-use-dialog';

/** Owner 2026-10-27: "add a sort on each table" -- the refused delete's list of who still uses it sorts too. */
describe('InUseDialog -- sorting', () => {
  function dialog(data: InUseData) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close: vi.fn() } },
    ] });
    return TestBed.runInInjectionContext(() => new InUseDialog());
  }

  it('keeps the service\'s order, sorts by name both ways, and puts "Latest" after the pinned versions', () => {
    const d = dialog({ heading: 'Orders is still in use', message: 'Change these first.', users: [
      { userType: 'PIPELINE', userRef: '7', userName: 'Nightly orders', requestName: 'List', pinnedVersion: null },
      { userType: 'AI_TOOL', userRef: '3', userName: 'Agent lookup', requestName: 'Get', pinnedVersion: 4 },
    ] });
    expect(d.sorted().map(u => u.userName)).toEqual(['Nightly orders', 'Agent lookup']);
    d.sort.toggle('name');
    expect(d.sorted().map(u => u.userName)).toEqual(['Agent lookup', 'Nightly orders']);
    d.sort.toggle('name');
    expect(d.sorted().map(u => u.userName)).toEqual(['Nightly orders', 'Agent lookup']);
    d.sort.toggle('pinned');
    expect(d.sorted().map(u => u.pinnedVersion)).toEqual([4, null]);
  });
});
