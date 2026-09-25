import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { ObjectPicker } from './object-picker';
import { StorageService } from '../../features/objects/storage.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** One picker for every "which file?" in the app: buckets, folders, a filter, a pick. */
function picker(data: object) {
  const listObjects = vi.fn((bucket: string, prefix: string) => of({ status: API_SUCCESS, data: { objects: prefix === '' ? [
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
  it('lists folders first, then files, filtered, and answers with the pick', () => {
    const { component, close } = picker({ heading: 'Pick' });
    expect(component.bucketOptions()).toEqual([{ value: 'b1', label: 'Bucket one', hint: 'S3' }]);
    component.openBucket('b1');
    expect(component.rows().map(r => r.name)).toEqual(['docs', 'archive', 'zeta.csv', 'alpha.pdf']);
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

  it('greys out files a caller cannot use, without hiding them', () => {
    const { component } = picker({ bucket: 'b1', extensions: ['pdf', 'DOCX'] });
    const byName = Object.fromEntries(component.rows().map(r => [r.name, r]));
    expect(component.offered(byName['alpha.pdf'])).toBe(true);
    expect(component.offered(byName['zeta.csv'])).toBe(false);
    expect(component.rows().length).toBe(4);
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
        { provide: StorageService, useValue: { buckets, listObjects: vi.fn() } },
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
