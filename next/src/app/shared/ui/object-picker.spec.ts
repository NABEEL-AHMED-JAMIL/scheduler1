import { beforeEach, describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NEVER, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ObjectPicker } from './object-picker';
import { StorageService } from '../../features/objects/storage.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** One picker for every "which file?" in the app: buckets, folders, a filter, a search, types, paging, a kept selection. */
function picker(data: object) {
  const listObjects = vi.fn((_bucket: string, prefix: string) => of({ status: API_SUCCESS, data: { objects: prefix === '' ? [
    { name: 'zeta.csv', key: 'zeta.csv', folder: false, size: 1200 },
    { name: 'docs', key: 'docs/', folder: true },
    { name: 'alpha.pdf', key: 'alpha.pdf', folder: false, size: 2048 },
    { name: 'archive', key: 'archive/', folder: true },
  ] : [{ name: 'inner.txt', key: prefix + 'inner.txt', folder: false, size: 10 }] } }));
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: StorageService, useValue: { buckets: () => of({ status: API_SUCCESS, data: [{ bucket: 'b1', label: 'Bucket one', provider: 'S3' }] }), listObjects } },
    { provide: DialogRef, useValue: { close } },
    { provide: DIALOG_DATA, useValue: data },
  ] });
  const component = TestBed.runInInjectionContext(() => new ObjectPicker());
  return { component, close, listObjects };
}

describe('ObjectPicker', () => {
  // The sort is remembered per viewer: every case starts from the picker's own order (Name A to Z).
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it('lists folders first, then files, filtered, and answers with the pick', () => {
    const { component, close } = picker({ heading: 'Pick' });
    expect(component.bucketOptions()).toEqual([{ value: 'b1', label: 'Bucket one', hint: 'S3' }]);
    component.openBucket('b1');
    expect(component.rows().map(r => r.name)).toEqual(['archive', 'docs', 'alpha.pdf', 'zeta.csv']);
    component.filter.set('alp');
    expect(component.rows().map(r => r.name)).toEqual(['alpha.pdf']);
    component.pick(component.rows()[0]);
    expect(close).toHaveBeenCalledWith({ bucket: 'b1', key: 'alpha.pdf', name: 'alpha.pdf', size: 2048, contentType: undefined });
  });

  it('descends into a folder, keeps the crumbs, and drops the filter on the way', () => {
    const { component, listObjects } = picker({ bucket: 'b1', prefix: '' });
    component.filter.set('x');
    component.browse('docs/');
    expect(listObjects).toHaveBeenLastCalledWith('b1', 'docs/', undefined, 200);
    expect(component.crumbs()).toEqual([{ name: 'docs', prefix: 'docs/' }]);
    expect(component.filter()).toBe('');
    expect(component.rows().map(r => r.key)).toEqual(['docs/inner.txt']);
  });

  it('opens on the types a caller can use; All files shows the rest greyed rather than hiding them', () => {
    const { component } = picker({ bucket: 'b1', extensions: ['pdf', 'DOCX'] });
    expect(component.typeFilter()).toBe('offered');
    expect(component.typeOptions().map(o => o.label)).toEqual(['pdf, docx', 'pdf', 'docx', 'All files']);
    expect(component.rows().map(r => r.name)).toEqual(['archive', 'docs', 'alpha.pdf']);
    component.setType('all');
    const byName = Object.fromEntries(component.rows().map(r => [r.name, r]));
    expect(component.offered(byName['alpha.pdf'])).toBe(true);
    expect(component.offered(byName['zeta.csv'])).toBe(false);
    expect(component.rows().length).toBe(4);
    component.select(byName['zeta.csv']);
    expect(component.selected()).toBeNull();
  });

  it('says how many files the type filter hides, and offers to show them', () => {
    const { component } = picker({ bucket: 'b1', prefix: 'docs/', extensions: ['mp3'] });
    expect(component.rows()).toEqual([]);
    expect(component.hiddenByType()).toBe(1);
    expect(component.emptyText()).toBe('No mp3 files in this folder.');
    component.setType('all');
    expect(component.rows().map(r => r.name)).toEqual(['inner.txt']);
  });

  it('opens the only bucket there is rather than asking', () => {
    const { component, listObjects } = picker({});
    expect(component.bucket()).toBe('b1');
    expect(listObjects).toHaveBeenCalledWith('b1', '', undefined, 200);
  });

  it('sorts by size and by date, folders always first', () => {
    try { localStorage.clear(); } catch { /* none */ }
    const { component } = picker({ bucket: 'b1' });
    component.sort.toggle('size');
    expect(component.rows().map(r => r.name)).toEqual(['archive', 'docs', 'alpha.pdf', 'zeta.csv']);
    expect(component.sort.ariaSort('size')).toBe('descending');
    component.sort.toggle('size');
    expect(component.rows().map(r => r.name)).toEqual(['archive', 'docs', 'zeta.csv', 'alpha.pdf']);
    expect(component.sort.ariaSort('name')).toBeNull();
  });

  /** Owner 2026-10-27: the shared sort, Name A to Z by default, both ways, and Type sorts too. */
  it('sorts by name both ways and by type, folders still first', () => {
    try { localStorage.clear(); } catch { /* none */ }
    const { component } = picker({ bucket: 'b1' });
    expect(component.sort.ariaSort('name')).toBe('ascending');
    component.sort.toggle('name');
    expect(component.rows().map(r => r.name)).toEqual(['docs', 'archive', 'zeta.csv', 'alpha.pdf']);
    component.sort.toggle('type');
    expect(component.rows().map(r => r.name)).toEqual(['archive', 'docs', 'zeta.csv', 'alpha.pdf']);
  });

  /** Owner 2026-10-27: loading until the buckets answer, a line when there are none, and a failed next batch keeps the rows. */
  it('is loading the buckets until they answer, then says when there are none', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: StorageService, useValue: { buckets: () => NEVER, listObjects: vi.fn() } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: {} },
    ] });
    const waiting = TestBed.runInInjectionContext(() => new ObjectPicker());
    expect(waiting.bucketsLoading()).toBe(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: StorageService, useValue: { buckets: () => of({ status: API_SUCCESS, data: [] }), listObjects: vi.fn() } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: {} },
    ] });
    const none = TestBed.runInInjectionContext(() => new ObjectPicker());
    expect(none.bucketsLoading()).toBe(false);
    expect(none.buckets()).toEqual([]);
    expect(none.error()).toBe('');
  });

  it('keeps the rows when the next batch fails, and says why by the button', () => {
    const listObjects = vi.fn((_b: string, _p: string, token?: string) => token
      ? throwError(() => new HttpErrorResponse({ status: 500 }))
      : of({ status: API_SUCCESS, data: { objects: [{ name: 'a.txt', key: 'a.txt', folder: false }], nextContinuationToken: 'a.txt' } }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: StorageService, useValue: { buckets: () => of({ status: API_SUCCESS, data: [] }), listObjects } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { bucket: 'b1' } },
    ] });
    const component = TestBed.runInInjectionContext(() => new ObjectPicker());
    component.browse('', true);
    expect(component.loadingMore()).toBe(false);
    expect(component.error()).toBe('');
    expect(component.moreError()).toBe('This folder could not be read.');
    expect(component.rows().map(r => r.key)).toEqual(['a.txt']);
  });

  it('keeps the selection while the folder, filter and type change, and answers it with Use this file', () => {
    const { component, close } = picker({ bucket: 'b1' });
    component.select(component.rows().find(r => r.name === 'alpha.pdf')!);
    component.filter.set('zz');
    component.browse('docs/');
    component.setType('all');
    expect(component.selected()?.key).toBe('alpha.pdf');
    component.useSelected();
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'b1', key: 'alpha.pdf', size: 2048 }));
  });

  it('reopens in the folder of the last pick with that file marked', () => {
    const { component, listObjects } = picker({ bucket: 'b1', selectedKey: 'docs/inner.txt' });
    expect(listObjects).toHaveBeenCalledWith('b1', 'docs/', undefined, 200);
    expect(component.isSelected(component.rows()[0])).toBe(true);
    expect(component.selected()?.name).toBe('inner.txt');
  });

  it('pages a long folder fifty at a time and loads more from the store', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ name: `call-${i}.mp3`, key: `call-${i}.mp3`, folder: false, size: i }));
    const listObjects = vi.fn((_b: string, _p: string, token?: string) => of({ status: API_SUCCESS,
      data: token ? { objects: [{ name: 'late.mp3', key: 'late.mp3', folder: false }] } : { objects: many, nextContinuationToken: 'call-99.mp3' } }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: StorageService, useValue: { buckets: () => of({ status: API_SUCCESS, data: [] }), listObjects } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { bucket: 'b1', extensions: ['mp3'] } },
    ] });
    const component = TestBed.runInInjectionContext(() => new ObjectPicker());
    expect(component.pagedRows().length).toBe(50);
    component.pager.goTo(3, component.rows().length);
    expect(component.pagedRows().length).toBe(20);
    component.browse('', true);
    expect(listObjects).toHaveBeenLastCalledWith('b1', '', 'call-99.mp3', 200);
    expect(component.rows().length).toBe(121);
  });

  it('searches the whole bucket under the folder, names each match\'s folder, and goes back to the folder', () => {
    const findObjects = vi.fn(() => of({ status: API_SUCCESS, data: { scanned: 900, truncated: true, objects: [
      { name: 'ward-round.mp3', key: 'dictation/2026/ward-round.mp3', folder: false, size: 5, lastModified: '2026-10-01T09:00:00Z' },
      { name: 'ward-notes.pdf', key: 'ward-notes.pdf', folder: false, size: 7 },
    ] } }));
    const listObjects = vi.fn(() => of({ status: API_SUCCESS, data: { objects: [{ name: 'a.mp3', key: 'a.mp3', folder: false }] } }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: StorageService, useValue: { buckets: () => of({ status: API_SUCCESS, data: [] }), listObjects, findObjects } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { bucket: 'b1', extensions: ['mp3'] } },
    ] });
    const component = TestBed.runInInjectionContext(() => new ObjectPicker());
    component.onFilter('ward');
    expect(component.rows()).toEqual([]);
    component.search();
    expect(findObjects).toHaveBeenCalledWith('b1', '', 'ward');
    expect(component.searching()).toBe(true);
    expect(component.searchTruncated()).toBe(true);
    expect(component.rows().map(r => [r.name, r.folderPath])).toEqual([['ward-round.mp3', 'dictation/2026/']]);
    component.setType('all');
    expect(component.rows().map(r => r.folderPath)).toEqual(['/', 'dictation/2026/']);
    component.onFilter('');
    expect(component.searching()).toBe(false);
    expect(component.rows().map(r => r.key)).toEqual(['a.mp3']);
  });

  it('says a failed search as such, and Try again searches again', () => {
    const findObjects = vi.fn()
      .mockReturnValueOnce(of({ status: 'ERROR', message: 'This storage connection cannot be searched. Open its folders instead.' }))
      .mockReturnValueOnce(of({ status: API_SUCCESS, data: { scanned: 1, truncated: false, objects: [] } }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: StorageService, useValue: { buckets: () => of({ status: API_SUCCESS, data: [] }),
        listObjects: () => of({ status: API_SUCCESS, data: { objects: [] } }), findObjects } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { bucket: 'ftp-drop' } },
    ] });
    const component = TestBed.runInInjectionContext(() => new ObjectPicker());
    component.search('scan');
    expect(component.error()).toContain('cannot be searched');
    component.retry();
    expect(findObjects).toHaveBeenCalledTimes(2);
    expect(component.error()).toBe('');
  });
  /**
   * A folder that could not be read showed "Nothing in this folder." -- a statement about the
   * bucket that was not true. It now says it could not read it, with Try again.
   */
  describe('when a read fails', () => {
    function failing(answers: unknown[]) {
      const listObjects = vi.fn(() => answers.shift() as any);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [
        { provide: StorageService, useValue: { buckets: () => of({ status: API_SUCCESS, data: [] }), listObjects } },
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: DIALOG_DATA, useValue: { bucket: 'b1', prefix: 'docs/' } },
      ] });
      const component = TestBed.runInInjectionContext(() => new ObjectPicker());
      return { component, listObjects };
    }

    it('keeps the server\'s reason for a refusal', () => {
      const { component } = failing([of({ status: 'ERROR', message: 'Access denied to b1.' })]);
      expect(component.loading()).toBe(false);
      expect(component.error()).toBe('Access denied to b1.');
    });

    it('says so for a failed request too', () => {
      const { component } = failing([throwError(() => ({ error: {} }))]);
      expect(component.error()).toBeTruthy();
    });

    it('reads the same folder again on Try again, and clears the error when it can', () => {
      const { component, listObjects } = failing([
        of({ status: 'ERROR', message: 'Busy.' }),
        of({ status: API_SUCCESS, data: { objects: [{ name: 'a.txt', key: 'docs/a.txt', folder: false }] } }),
      ]);
      component.retry();
      expect(listObjects).toHaveBeenLastCalledWith('b1', 'docs/', undefined, 200);
      expect(component.error()).toBe('');
      expect(component.rows().map(r => r.key)).toEqual(['docs/a.txt']);
    });

    it('reads the bucket list again when that is what failed', () => {
      const buckets = vi.fn()
        .mockReturnValueOnce(of({ status: 'ERROR', message: 'No buckets for you.' }))
        .mockReturnValueOnce(of({ status: API_SUCCESS, data: [{ bucket: 'b2' }] }));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [
        { provide: StorageService, useValue: { buckets, listObjects: vi.fn(() => of({ status: API_SUCCESS, data: { objects: [] } })) } },
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: DIALOG_DATA, useValue: {} },
      ] });
      const component = TestBed.runInInjectionContext(() => new ObjectPicker());
      expect(component.error()).toBe('No buckets for you.');
      component.retry();
      expect(component.error()).toBe('');
      expect(component.buckets().map(b => b.bucket)).toEqual(['b2']);
    });
  });
});
