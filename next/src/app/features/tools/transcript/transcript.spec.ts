import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, NEVER, of } from 'rxjs';
import { Transcript } from './transcript';
import { TranscriptApi } from './transcript.api';
import { ToastService } from '../../../shared/ui/toast.service';
import { StorageService } from '../../objects/storage.service';
import { DEFAULT_TRANSCRIPT_LIMITS, RecordingDetail } from './transcript.model';

const DONE: RecordingDetail = {
  recordingId: 41, name: 'Ward round · bay 3', fileName: 'ward-round-note.m4a', fileSize: 120_000, durationSeconds: 13, status: 'DONE',
  stage: 'done', language: 'en', model: 'whisper-small', processingSeconds: 2.1, billedMinutes: 1, speakers: [], speakersAsked: 'auto',
  speakersAvailable: false, recordingKept: true, keepRecording: true, maskExports: false, version: 1, createdBy: 1015,
  createdAt: '2026-11-02T09:02:00', peaks: [0.1, 0.5, 0.3],
  segments: [{ i: 0, startMs: 0, endMs: 6000, text: 'Blood pressure is stable this morning.' },
    { i: 1, startMs: 6500, endMs: 12000, text: 'Check the blood sugar again at noon.' }],
  personal: { names: 1, datesOfBirth: 0, phones: 0 },
};

function page(query: Record<string, string>, detail: RecordingDetail | null = DONE) {
  TestBed.resetTestingModule();
  const params = new BehaviorSubject(convertToParamMap(query));
  const api = {
    limits: () => of({ status: 'SUCCESS', data: DEFAULT_TRANSCRIPT_LIMITS }),
    list: vi.fn(() => of({ status: 'SUCCESS', data: { rows: detail ? [detail] : [], failedCount: 0, total: detail ? 1 : 0 } })),
    one: vi.fn(() => (detail ? of({ status: 'SUCCESS', data: detail }) : NEVER)),
    audio: vi.fn(() => NEVER),
    change: vi.fn(() => of({ status: 'SUCCESS', data: { ...DONE, maskExports: true } })),
  };
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: TranscriptApi, useValue: api },
    { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
    { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', data: [] }) } },
    { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
  ] });
  const fixture = TestBed.createComponent(Transcript);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, t: fixture.componentInstance, el, api, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

describe('Audio Transcript page (tools redesign)', () => {
  it('opens on a new transcript, with what it takes and the speakers note when they are not installed', () => {
    const { el, text } = page({ new: '1' });
    expect(el.querySelector('[data-test=new-transcript]')).not.toBeNull();
    expect(text()).toContain('.mp3, .m4a, .wav, .ogg');
    expect(el.querySelector('[data-test=speakers-note]')!.textContent).toContain("Speaker labels aren't installed on this platform.");
    expect((el.querySelector('#nt-spk') as HTMLSelectElement).disabled).toBe(true);
    expect(el.querySelector('[data-test=recordings-rail]')!.textContent).toContain('Ward round · bay 3');
  });

  it('shows a finished recording: its segments, the player, details, and no speaker lanes', () => {
    const { el, text } = page({ id: '41' });
    expect(el.querySelector('[data-test=player]')).not.toBeNull();
    expect(el.querySelectorAll('[data-test=segments] .seg-l')).toHaveLength(2);
    expect(el.querySelector('.lanes')).toBeNull();
    expect(el.querySelector('[data-test=speakers-unavailable]')!.textContent).toContain("Speaker labels aren't installed");
    expect(text()).toContain('Whisper small, on this platform');
    expect(text()).toContain('1 audio minute');
    expect(text()).toContain('Personal details heard: 1 name');
  });

  it('searches what was said: n of N, and the next match', () => {
    const { t, fixture, el } = page({ id: '41' });
    t.setQuery('blood');
    fixture.detectChanges();
    expect(el.querySelector('[data-test=hit-count]')!.textContent).toContain('1 of 2');
    expect(el.querySelectorAll('mark')).toHaveLength(2);
    t.goToHit(1);
    fixture.detectChanges();
    expect(el.querySelector('[data-test=hit-count]')!.textContent).toContain('2 of 2');
    expect(t.current()).toBe(6.5);
  });

  it('turns masking on for exports from the personal details card', () => {
    const { t, api } = page({ id: '41' });
    t.setMask(true);
    expect(api.change).toHaveBeenCalledWith(41, { maskExports: true });
    expect(t.detail()!.maskExports).toBe(true);
  });

  it('polls a recording while it is being transcribed', () => {
    const { api } = page({ id: '41' }, { ...DONE, status: 'RUNNING', stage: 'transcribing', heardSeconds: 6, progressPct: 46 });
    expect(api.one).toHaveBeenCalledTimes(1);
  });

  it('collects a file that is not a recording under Could not be transcribed, with the converter', () => {
    const { t, fixture, el } = page({ new: '1' });
    t.onRejected({ title: 'visit_notes.docx is not a recording', text: 'Use the converter.', icon: 'file', action: 'converter', actionLabel: 'Open converter' });
    fixture.detectChanges();
    const box = el.querySelector('[data-test=could-not]')!;
    expect(box.textContent).toContain('visit_notes.docx is not a recording');
    expect(box.querySelector('a')!.getAttribute('href')).toBe('/tools/converter');
  });
});
