import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { Transcript } from './transcript';
import { StorageService } from '../../objects/storage.service';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * Exercises the real `segments` computed on the real component, constructed in an injection
 * context rather than rendered -- the rules under test are the parsing logic, not the markup.
 *
 * A previous version of this file re-implemented segments() as a standalone `parse()` function
 * and tested that copy instead of the component. It had already drifted from the real behaviour
 * (it collapsed a no-timestamp, multi-line transcript into a single segment; the component splits
 * one per non-empty line) and gave zero protection against a regression in transcript.ts itself.
 * `ngOnInit` is never invoked here (constructing via runInInjectionContext skips Angular's
 * lifecycle), so the mocked HttpClient/StorageService below only need to satisfy the injector,
 * not answer a real request.
 */
function transcriptFor() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {} },
      { provide: StorageService, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Transcript());
}

describe('Transcript segments', () => {
  it('splits on the [HH:MM:SS.mmm] markers the extractor emits', () => {
    const t = transcriptFor();
    t.transcript.set('[00:00:03.550] Hello there. [00:00:07.120] Second bit.');
    expect(t.segments()).toEqual([
      { time: '00:00:03.550', text: 'Hello there.' },
      { time: '00:00:07.120', text: 'Second bit.' },
    ]);
  });

  it('accepts a marker with no milliseconds', () => {
    const t = transcriptFor();
    t.transcript.set('[00:01:02] Words');
    expect(t.segments()).toEqual([{ time: '00:01:02', text: 'Words' }]);
  });

  it('splits an untimed transcript one segment per non-empty line', () => {
    // The real behaviour: a no-marker transcript is split on line breaks, not collapsed into a
    // single block -- otherwise the table/timeline views would have nothing to number.
    const t = transcriptFor();
    t.transcript.set('First line.\nSecond line.\n\nThird line after a blank one.');
    expect(t.segments()).toEqual([
      { time: '', text: 'First line.' },
      { time: '', text: 'Second line.' },
      { time: '', text: 'Third line after a blank one.' },
    ]);
  });

  it('returns one untimed block for a single-line transcript with no markers', () => {
    const t = transcriptFor();
    t.transcript.set('Just a merged block of speech.');
    expect(t.segments()).toEqual([{ time: '', text: 'Just a merged block of speech.' }]);
  });

  it('keeps text that appears before the first marker', () => {
    // Dropping it would silently lose the opening words.
    const t = transcriptFor();
    t.transcript.set('Preamble. [00:00:01.000] After');
    expect(t.segments()).toEqual([
      { time: '', text: 'Preamble.' },
      { time: '00:00:01.000', text: 'After' },
    ]);
  });

  it('keeps a marker with no speech after it rather than dropping the entry', () => {
    const t = transcriptFor();
    t.transcript.set('[00:00:01.000] [00:00:02.000] Second');
    expect(t.segments()).toEqual([
      { time: '00:00:01.000', text: '' },
      { time: '00:00:02.000', text: 'Second' },
    ]);
  });

  it('handles an empty transcript', () => {
    const t = transcriptFor();
    expect(t.segments()).toEqual([]);
  });

  it('does not treat a bracketed non-timestamp as a marker', () => {
    const t = transcriptFor();
    t.transcript.set('[inaudible] some words');
    expect(t.segments()).toEqual([{ time: '', text: '[inaudible] some words' }]);
  });

  it('reports hasTimes only when at least one segment carries a timestamp', () => {
    const t = transcriptFor();
    t.transcript.set('No markers here.');
    expect(t.hasTimes()).toBe(false);
    t.transcript.set('[00:00:01.000] Timed.');
    expect(t.hasTimes()).toBe(true);
  });

  it('onFile stores the picked file and clears any previous transcript', () => {
    const t = transcriptFor();
    t.transcript.set('Stale result from a previous file.');
    const file = new File(['audio'], 'clip.mp3', { type: 'audio/mpeg' });
    t.onFile(file);
    expect(t.file()).toBe(file);
    expect(t.transcript()).toBe('');
  });
});

function transcriptWithStorage(listObjects: ReturnType<typeof vi.fn>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {} },
      { provide: StorageService, useValue: { listObjects, buckets: () => new Subject() } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Transcript());
}

const page = (objects: any[], nextContinuationToken?: string) => ({
  status: 'SUCCESS', message: '', data: { objects, nextContinuationToken },
});

/**
 * Regression tests: a bucket level with more entries than one page returns (a real example:
 * an avatars-style bucket with hundreds of per-user folders) previously had no way to fetch the
 * rest -- listObjects's own continuation token was fetched but never read.
 */
describe('Transcript bucket pagination', () => {
  it('requests 200 at a time and exposes a continuation token when more remain', () => {
    const responses = new Subject<any>();
    const listObjects = vi.fn(() => responses.asObservable());
    const t = transcriptWithStorage(listObjects);

    t.onBucketChange('etl-avatar');
    expect(listObjects).toHaveBeenCalledWith('etl-avatar', '', undefined, 200);

    responses.next(page([{ name: '1000', key: '1000/', folder: true }], '2544/'));
    expect(t.nextToken()).toBe('2544/');
  });

  it('loadMore appends the next page rather than replacing the current one', () => {
    const responses = new Subject<any>();
    const listObjects = vi.fn(() => responses.asObservable());
    const t = transcriptWithStorage(listObjects);

    t.onBucketChange('etl-avatar');
    responses.next(page([{ name: '1000', key: '1000/', folder: true }], '2544/'));

    t.loadMore();
    expect(listObjects).toHaveBeenLastCalledWith('etl-avatar', '', '2544/', 200);
    responses.next(page([{ name: '2545', key: '2545/', folder: true }]));

    expect(t.folders().map(f => f.key)).toEqual(['1000/', '2545/']);
    expect(t.nextToken()).toBeUndefined();
  });

  it('switching buckets clears a stale continuation token from the previous one', () => {
    const responses = new Subject<any>();
    const listObjects = vi.fn(() => responses.asObservable());
    const t = transcriptWithStorage(listObjects);

    t.onBucketChange('etl-avatar');
    responses.next(page([], '2544/'));
    expect(t.nextToken()).toBe('2544/');

    t.onBucketChange('etl-bucket');
    expect(t.nextToken()).toBeUndefined();
  });
});
