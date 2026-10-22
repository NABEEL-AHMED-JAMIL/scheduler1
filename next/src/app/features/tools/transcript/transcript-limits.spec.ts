import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { NEVER, of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { Transcript, audioProblem } from './transcript';
import { StorageService } from '../../objects/storage.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReadAloudService } from '../../../shared/ui/read-aloud.service';

/** Owner #27 (2026-10-19): what the tool takes said up front, the wrong file refused before it is sent, busy said as busy. */
function page(post: () => unknown = () => NEVER, limits: unknown = { status: 'SUCCESS', data: {
  formats: ['mp3', 'm4a'], uploadMaxMb: 1, bucketMaxMb: 2, timeoutMinutes: 30, retryAfterSeconds: 45 } }) {
  TestBed.resetTestingModule();
  const open = vi.fn(() => ({ closed: of({ bucket: 'audio', key: 'dictation/2026/ward-round.mp3', name: 'ward-round.mp3', size: 3 * 1024 * 1024, lastModified: '2026-10-18T09:30:00Z' }) }));
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: vi.fn(() => of(limits)), post: vi.fn(post) } },
    { provide: Dialog, useValue: { open } },
    { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', data: [] }), listObjects: () => NEVER } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: ReadAloudService, useValue: { supported: false, state: signal('idle'), stop: vi.fn(), progress: signal(null), rate: signal(1) } },
  ] });
  const fixture = TestBed.createComponent(Transcript);
  fixture.detectChanges();
  return { fixture, t: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, open };
}

describe('audioProblem', () => {
  it('names the wrong kind of file and an oversize one, and passes a good one', () => {
    expect(audioProblem('ward-round.wav', 10, 250)).toBe('"ward-round.wav" is not an .mp3 or .m4a file.');
    expect(audioProblem('ward-round.MP3', 300 * 1024 * 1024, 250)).toContain('up to 250 MB');
    expect(audioProblem('ward-round.m4a', 10, 250)).toBe('');
  });
});

describe('Transcript, what it takes', () => {
  it('states the server\'s limits beside the work', () => {
    const { el } = page();
    const aside = el.querySelector('[data-test="transcript-limits"]')!.textContent!.replace(/\s+/g, ' ');
    expect(aside).toContain('mp3, m4a');
    expect(aside).toContain('up to 1 MB');
    expect(aside).toContain('up to 2 MB');
    expect(aside).toContain('about 45 seconds');
  });

  it('keeps the shipped limits when the server cannot say', () => {
    const { t } = page(() => NEVER, { status: 'ERROR', message: 'no' });
    expect(t.limits().uploadMaxMb).toBe(250);
  });

  it('refuses an oversize upload before it is sent, and says why', () => {
    const { t, fixture, el } = page();
    t.onFile(new File([new Uint8Array(2 * 1024 * 1024)], 'clinic-call.mp3'));
    fixture.detectChanges();
    expect(t.canExtract()).toBe(false);
    expect(el.querySelector('[data-test="audio-problem"]')!.textContent).toContain('up to 1 MB');
  });

  it('shows the picked bucket file with its folder, size and date, and clears it', () => {
    const { t, fixture, el } = page();
    t.setMode('bucket');
    t.chooseFile();
    fixture.detectChanges();
    const card = el.querySelector('[data-test="picked-file"]')!.textContent!.replace(/\s+/g, ' ');
    expect(card).toContain('ward-round.mp3');
    expect(card).toContain('audio/dictation/2026/');
    expect(card).toContain('3.0 MB');
    // Over the bucket limit of 2 MB: said, and Transcribe stays off.
    expect(t.problem()).toContain('up to 2 MB');
    t.clearPick();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="picked-file"]')).toBeNull();
    expect(t.picked()).toBeNull();
  });

  it('says a busy transcriber (429) as busy, not as a fault, with Try again', () => {
    const { t, fixture, el } = page(() => throwError(() => ({ status: 429, error: {} })));
    t.onFile(new File(['x'], 'clinic-call.mp3'));
    t.extract();
    fixture.detectChanges();
    expect(t.busy()).toBe(true);
    const alert = el.querySelector('[data-test="transcript-error"]')!;
    expect(alert.getAttribute('data-busy')).toBe('true');
    expect(alert.textContent).toContain('busy');
    expect(alert.textContent).toContain('about 45 seconds');
    expect(alert.querySelector('app-icon[name="clock"]')).not.toBeNull();
  });

  it('keeps the transcriber\'s own sentence for any other refusal', () => {
    const { t } = page(() => throwError(() => ({ status: 400, error: { message: 'That recording has no audio track.' } })));
    t.onFile(new File(['x'], 'clinic-call.m4a'));
    t.extract();
    expect(t.busy()).toBe(false);
    expect(t.error()).toBe('That recording has no audio track.');
  });
});
