import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Subject } from 'rxjs';
import { Converter } from './converter';
import { StorageService } from '../../objects/storage.service';
import { ToastService } from '../../../shared/ui/toast.service';

function converterFor(listObjects: ReturnType<typeof vi.fn>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {} },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: StorageService, useValue: { listObjects } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Converter());
}

const page = (objects: any[], nextContinuationToken?: string) => ({
  status: 'SUCCESS', message: '', data: { objects, nextContinuationToken },
});

/**
 * Regression tests for a real bug: onBucketChange() only ever listed the bucket root
 * (prefix hard-coded to '') with no way to navigate into a folder, and no pagination -- a
 * bucket whose documents live in a subfolder, or whose root has more entries than one page
 * returns, showed "Nothing convertible in this bucket" regardless of what it actually held.
 */
describe('Converter bucket browsing', () => {
  it('lists the bucket root on bucket change', () => {
    const listObjects = vi.fn(() => new Subject());
    const converter = converterFor(listObjects);
    converter.onBucketChange('etl-avatar');
    expect(listObjects).toHaveBeenCalledWith('etl-avatar', '', undefined, 200);
  });

  it('exposes folders separately from convertible files, and can navigate into one', () => {
    const responses = new Subject<any>();
    const listObjects = vi.fn(() => responses.asObservable());
    const converter = converterFor(listObjects);

    converter.onBucketChange('etl-avatar');
    responses.next(page([
      { name: '1000', key: '1000/', folder: true },
      { name: 'report.pdf', key: 'report.pdf', folder: false },
    ]));

    expect(converter.folders().map(f => f.key)).toEqual(['1000/']);

    converter.openFolder('1000/');
    expect(listObjects).toHaveBeenLastCalledWith('etl-avatar', '1000/', undefined, 200);
    expect(converter.prefix()).toBe('1000/');
  });

  it('breadcrumbs reflect the current prefix and goTo("") returns to the root', () => {
    const listObjects = vi.fn(() => new Subject());
    const converter = converterFor(listObjects);
    converter.onBucketChange('etl-avatar');
    converter.openFolder('a/b/');
    expect(converter.crumbs()).toEqual([
      { name: 'a', prefix: 'a/' },
      { name: 'b', prefix: 'a/b/' },
    ]);
    converter.goTo('');
    expect(converter.prefix()).toBe('');
  });

  it('exposes a continuation token when a level has more entries, and loadMore appends rather than replaces', () => {
    const responses = new Subject<any>();
    const listObjects = vi.fn(() => responses.asObservable());
    const converter = converterFor(listObjects);

    converter.onBucketChange('etl-avatar');
    responses.next(page(
      [{ name: '1000', key: '1000/', folder: true }], '2544/'));
    expect(converter.nextToken()).toBe('2544/');

    converter.loadMore();
    expect(listObjects).toHaveBeenLastCalledWith('etl-avatar', '', '2544/', 200);
    responses.next(page([{ name: '2545', key: '2545/', folder: true }]));

    expect(converter.folders().map(f => f.key)).toEqual(['1000/', '2545/']);
    expect(converter.nextToken()).toBeUndefined();
  });

  it('reports nothingHere only once loading has finished and the level has neither files nor folders', () => {
    const responses = new Subject<any>();
    const listObjects = vi.fn(() => responses.asObservable());
    const converter = converterFor(listObjects);

    converter.onBucketChange('etl-avatar');
    expect(converter.nothingHere()).toBe(false); // still loading

    responses.next(page([]));
    expect(converter.nothingHere()).toBe(true);
  });

  it('a stale response from an abandoned folder does not overwrite the level being viewed', () => {
    // Regression: clicking through folders quickly used to let a slow response for a folder
    // already left behind land after a faster one and silently replace what's on screen.
    const first = new Subject<any>();
    const second = new Subject<any>();
    const listObjects = vi.fn()
      .mockReturnValueOnce(first.asObservable())
      .mockReturnValueOnce(second.asObservable());
    const converter = converterFor(listObjects);

    converter.onBucketChange('etl-avatar'); // ticket 1
    converter.openFolder('b/'); // ticket 2, abandons ticket 1

    first.next(page([{ name: 'stale', key: 'stale.docx', folder: false }]));
    expect(converter.objects().length).toBe(0); // stale response ignored

    second.next(page([{ name: 'fresh', key: 'b/fresh.docx', folder: false }]));
    expect(converter.objects().map(o => o.key)).toEqual(['b/fresh.docx']);
  });
});
