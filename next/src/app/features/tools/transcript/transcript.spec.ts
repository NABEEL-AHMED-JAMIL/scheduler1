import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { ObjectPicker, PickedObject } from '../../../shared/ui/object-picker';
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

/**
 * Audio from a bucket is chosen in the console's one ObjectPicker. Browsing, paging, stale answers
 * and read failures are the picker's, pinned in object-picker.spec.ts; the hand-rolled copy this
 * tool had (and its own tests of paging and failed folders) went with it.
 */
describe('Transcript source from a bucket', () => {
  function picking(picked: PickedObject | undefined) {
    const open = vi.fn((_component: unknown, _config: any) => ({ closed: of(picked) }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: HttpClient, useValue: {} },
      { provide: StorageService, useValue: {} },
      { provide: Dialog, useValue: { open } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    ] });
    return { t: TestBed.runInInjectionContext(() => new Transcript()), open };
  }

  it('opens the shared ObjectPicker for mp3 and m4a files', () => {
    const { t, open } = picking(undefined);
    t.chooseFile();
    expect(open.mock.calls[0][0]).toBe(ObjectPicker);
    expect(open.mock.calls[0][1].data.extensions).toEqual(['mp3', 'm4a']);
  });

  it('takes the picked bucket and key, and reopens in that folder next time', () => {
    const { t, open } = picking({ bucket: 'audio', key: 'calls/2026/one.mp3', name: 'one.mp3' });
    t.mode.set('bucket');
    t.chooseFile();
    expect(t.bucket()).toBe('audio');
    expect(t.selectedKey()).toBe('calls/2026/one.mp3');
    expect(t.canExtract()).toBe(true);
    t.chooseFile();
    expect(open.mock.calls[1][1].data).toMatchObject({ bucket: 'audio', prefix: 'calls/2026/' });
  });
});

/**
 * "Read aloud from here" was a double-click on the timestamp: no keyboard or touch route, and the
 * double-click fired the timestamp's copy twice before reading began.
 */
describe('Transcript timeline controls', () => {
  it('reads aloud from a line with its own button, without copying anything', () => {
    TestBed.resetTestingModule();
    const success = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: HttpClient, useValue: { get: () => new Subject(), post: () => new Subject() } },
      { provide: StorageService, useValue: { buckets: () => new Subject(), listObjects: () => new Subject() } },
      { provide: ToastService, useValue: { success, error: () => {}, info: () => {} } },
    ] });
    const fixture = TestBed.createComponent(Transcript);
    const t = fixture.componentInstance;
    t.transcript.set('[00:00:03.550] Hello there. [00:00:07.120] Second bit.');
    const readFrom = vi.spyOn(t, 'readFrom').mockImplementation(() => {});
    fixture.detectChanges();

    const read = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Read aloud from 00:00:07.120"]');
    expect(read).toBeTruthy();
    read!.click();

    expect(readFrom).toHaveBeenCalledWith(1);
    expect(success).not.toHaveBeenCalled();
  });
});
