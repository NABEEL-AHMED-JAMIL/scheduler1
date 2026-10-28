import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { Objects } from './objects';
import { AuthService } from '../../core/auth/auth.service';
import { BucketSummary, BrowseResponse, ObjectSummary, StorageService } from './storage.service';

/**
 * Owner 2026-10-27 ("add a sort on each table"): Browse files sorts on the server. A header click asks for the folder
 * again from its first page with sort/dir; Load more then pages by offset; nothing is sent before a choice; a folder
 * the server cannot sort (over 10,000 entries) goes back to the store's order and its headers say why.
 */
const MINIO: BucketSummary = { label: 'MinIO Main', bucket: 'minio-main', provider: 'MINIO' };
const A: ObjectSummary = { name: 'a.csv', key: 'a.csv', folder: false, size: 10, lastModified: '2026-09-01T10:00:00Z' };
const B: ObjectSummary = { name: 'b.csv', key: 'b.csv', folder: false, size: 20, lastModified: '2026-09-02T10:00:00Z' };
const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });

function view(answer: (...args: unknown[]) => BrowseResponse) {
  const listObjects = vi.fn((...args: unknown[]) => of(OK(answer(...args))));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: { get: vi.fn(() => of(OK(null))), post: vi.fn(() => of(OK(null))) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: StorageService, useValue: { buckets: () => of(OK([MINIO])), listObjects } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester', isTenantAdmin: () => true } },
    ],
  });
  const fixture = TestBed.createComponent(Objects);
  fixture.detectChanges();
  const objects = fixture.componentInstance;
  objects.onBucketChange(MINIO.bucket);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const header = (label: string) => [...el.querySelectorAll('th')].find(th => th.textContent!.trim().startsWith(label))!;
  return { fixture, el, objects, listObjects, header };
}

describe('Browse files: server sort', () => {
  beforeEach(() => localStorage.clear());

  it('sends no sort before a choice, and pages by the token as before', () => {
    const { objects, listObjects, fixture } = view(() => ({ objects: [A], nextContinuationToken: 't1' }));
    expect(listObjects).toHaveBeenCalledTimes(1);
    expect(listObjects.mock.calls[0]).toEqual(['minio-main', '', undefined]);
    objects.load(true);
    fixture.detectChanges();
    expect(listObjects.mock.calls[1]).toEqual(['minio-main', '', 't1']);
  });

  it('a click on Size asks again from the first page, largest first, then smallest first', () => {
    const { listObjects, header, fixture } = view(() => ({ objects: [B, A] }));
    header('Size').querySelector('button')!.click();
    fixture.detectChanges();
    expect(listObjects.mock.calls.at(-1)).toEqual(['minio-main', '', undefined, 100, { sort: 'size', dir: 'desc', offset: 0 }]);
    expect(header('Size').getAttribute('aria-sort')).toBe('descending');

    header('Size').querySelector('button')!.click();
    fixture.detectChanges();
    expect(listObjects.mock.calls.at(-1)).toEqual(['minio-main', '', undefined, 100, { sort: 'size', dir: 'asc', offset: 0 }]);
  });

  it('Name sorts A to Z first and Modified newest first, with the allow-listed names', () => {
    const { objects, listObjects } = view(() => ({ objects: [A, B] }));
    objects.sort.toggle('name');
    expect(listObjects.mock.calls.at(-1)![4]).toEqual({ sort: 'name', dir: 'asc', offset: 0 });
    objects.sort.toggle('modified');
    expect(listObjects.mock.calls.at(-1)![4]).toEqual({ sort: 'modified', dir: 'desc', offset: 0 });
  });

  it('a new sort drops the loaded pages; Load more then asks for the next offset with the same sort', () => {
    let call = 0;
    const { objects, listObjects, fixture, el } = view(() => {
      call++;
      if (call === 1) return { objects: [A], nextContinuationToken: 't1' };
      if (call === 2) return { objects: [B], nextOffset: 1, total: 2 };
      return { objects: [A], total: 2 };
    });
    objects.sort.toggle('size');
    fixture.detectChanges();
    expect(objects.objects()).toEqual([B]);
    expect(objects.nextToken()).toBeUndefined();
    expect(objects.nextOffset()).toBe(1);
    expect(el.textContent).toContain('Load more');

    objects.load(true);
    fixture.detectChanges();
    expect(listObjects.mock.calls.at(-1)).toEqual(['minio-main', '', undefined, 100, { sort: 'size', dir: 'desc', offset: 1 }]);
    expect(objects.objects()).toEqual([B, A]);
    expect(objects.hasMore()).toBe(false);
  });

  it('a folder too big to sort goes back to the store order and the headers say why', () => {
    let call = 0;
    const { objects, listObjects, header, fixture } = view(() => (++call === 2
      ? { objects: [A, B], nextContinuationToken: 't9', sortBlocked: 'Over 10,000 files here: sorting by size needs a smaller folder' }
      : { objects: [A, B], nextContinuationToken: 't9' }));
    objects.sort.toggle('size');
    fixture.detectChanges();
    expect(listObjects).toHaveBeenCalledTimes(2);   // no extra read when the order goes back
    expect(objects.sort.key()).toBe('');
    expect(objects.sortBlockedFor('size')).toBe('Over 10,000 files here: sorting by size needs a smaller folder');
    expect(objects.sortBlockedFor('modified')).toContain('Over 10,000 files here');
    expect(header('Size').querySelector('button')!.getAttribute('aria-disabled')).toBe('true');
    expect(header('Size').querySelector('button')!.getAttribute('title')).toContain('needs a smaller folder');

    objects.sort.toggle('size');   // blocked: nothing is asked
    expect(listObjects).toHaveBeenCalledTimes(2);
    objects.load(true);            // Load more keeps the token path
    expect(listObjects.mock.calls.at(-1)).toEqual(['minio-main', '', 't9']);
  });

  it('another folder may be small enough: the block is only for the folder it was said about', () => {
    let call = 0;
    const { objects } = view(() => (++call === 2
      ? { objects: [A], sortBlocked: 'Over 10,000 files here: sorting by size needs a smaller folder' }
      : { objects: [A] }));
    objects.sort.toggle('size');
    expect(objects.sortBlockedFor('size')).not.toBe('');
    objects.openFolder({ name: 'q3', key: 'q3/', folder: true });
    expect(objects.sortBlockedFor('size')).toBe('');
  });
});
