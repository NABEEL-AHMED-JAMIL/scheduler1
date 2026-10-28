import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { Analytics } from './analytics';
import { AnalyticsService } from './analytics.service';
import { BucketSummary, StorageService } from '../objects/storage.service';
import { API_SUCCESS } from '../../core/api/api.config';

/**
 * Owner 2026-10-27: Analytics Studio's storage connections and folder listing say they are loading, that there is
 * nothing, or why they could not be read -- and the SQL result and Compact tables sort by any column.
 */
const MINIO: BucketSummary = { label: 'MinIO Main', bucket: 'minio-main', provider: 'MINIO' };
const OK = <T>(data: T) => ({ status: API_SUCCESS, message: '', data });

function studio(buckets: () => Observable<unknown>, listObjects: () => Observable<unknown> = () => of(OK({ objects: [] }))) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: StorageService, useValue: { buckets: vi.fn(buckets), listObjects: vi.fn(listObjects) } },
      { provide: AnalyticsService, useValue: { schema: () => NEVER, preview: () => NEVER, profile: () => NEVER,
        overview: () => of(OK({ profile: { totalRows: 0, columns: [] }, charts: [], durationMs: 0 })) } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Analytics());
  screen.ngOnInit();
  return screen;
}

describe('Analytics Studio -- the storage connections load, are empty, or failed (owner 2026-10-27)', () => {
  it('is loading until the connections answer', () => {
    const s = studio(() => NEVER);
    expect(s.bucketsLoading()).toBe(true);
    expect(s.bucketsError()).toBe('');
  });

  it('has no connection once an empty list answers', () => {
    const s = studio(() => of(OK([])));
    expect(s.bucketsLoading()).toBe(false);
    expect(s.connectionOptions()).toEqual([]);
  });

  it('says the connections could not be read, in plain words', () => {
    const s = studio(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(s.bucketsLoading()).toBe(false);
    expect(s.bucketsError()).toBe('Your storage connections could not be read.');
  });

  it('says a folder could not be listed, in place of the old folder\'s files', () => {
    const s = studio(() => of(OK([MINIO])), () => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(s.browsing()).toBe(false);
    expect(s.entries()).toEqual([]);
    expect(s.listError()).toBe('This folder could not be listed.');
  });
});

describe('Analytics Studio -- the SQL result sorts by any column (owner 2026-10-27)', () => {
  it('keeps the statement\'s order, then sorts a number column as numbers both ways', () => {
    const s = studio(() => of(OK([])));
    s.result.set({ columns: ['region', 'amount'], rows: [['north', '9'], ['south', '10'], ['east', null]], rowCount: 3, truncated: false });
    expect(s.sortedResultRows().map(r => r[0])).toEqual(['north', 'south', 'east']);
    s.resultSort.toggle('amount');
    expect(s.sortedResultRows().map(r => r[1])).toEqual(['9', '10', null]);
    s.resultSort.toggle('amount');
    expect(s.sortedResultRows().map(r => r[1])).toEqual(['10', '9', null]);
  });

  it('forgets a column the next result does not have', () => {
    const s = studio(() => of(OK([])));
    s.result.set({ columns: ['region'], rows: [['b'], ['a']], rowCount: 2, truncated: false });
    s.resultSort.toggle('region');
    expect(s.sortedResultRows().map(r => r[0])).toEqual(['a', 'b']);
    s.result.set({ columns: ['other'], rows: [['y'], ['x']], rowCount: 2, truncated: false });
    expect(s.sortedResultRows().map(r => r[0])).toEqual(['y', 'x']);
  });
});
