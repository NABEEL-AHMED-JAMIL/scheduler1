import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, NEVER, of } from 'rxjs';
import { Transcript } from './transcript';
import { TranscriptPage } from './transcript-page';
import { TranscriptList } from './transcript-list';
import { TranscribeSheet } from './transcribe-sheet';
import { TranscriptApi } from './transcript.api';
import { ToastService } from '../../../shared/ui/toast.service';
import { StorageService } from '../../objects/storage.service';
import { DEFAULT_TRANSCRIPT_LIMITS, RecordingDetail, RecordingQuery } from './transcript.model';

const DONE: RecordingDetail = {
  recordingId: 41, name: 'Ward round · bay 3', fileName: 'ward-round-note.m4a', fileSize: 120_000, durationSeconds: 13, status: 'DONE',
  stage: 'done', language: 'en', model: 'whisper-small', processingSeconds: 2.1, billedMinutes: 1, speakers: [], speakersAsked: 'auto',
  speakersAvailable: false, recordingKept: true, keepRecording: true, maskExports: false, version: 1, createdBy: 1015,
  createdAt: '2026-11-02T09:02:00', speakerCount: 1,
  segments: [{ i: 0, startMs: 0, endMs: 6000, text: 'Blood pressure is stable this morning.' },
    { i: 1, startMs: 6500, endMs: 12000, text: 'Check the blood sugar again at noon.' }],
  personal: { names: 1, datesOfBirth: 0, phones: 0 },
};
const TWO: RecordingDetail = { ...DONE, recordingId: 42, name: 'Home visit · two voices', speakerCount: 2, durationSeconds: 30,
  speakers: [{ key: 0, label: 'Speaker 1', name: 'Alex Morgan, RN', talkPct: 60 }, { key: 1, label: 'Speaker 2', talkPct: 40 }],
  segments: [{ i: 0, startMs: 0, endMs: 8000, text: 'How is the dressing?', speaker: 0 },
    { i: 1, startMs: 9000, endMs: 17000, text: 'The dressing was changed on Saturday.', speaker: 1 },
    { i: 2, startMs: 18000, endMs: 30000, text: 'Keep the same dressing.', speaker: 0 }] };
const FACETS = { status: { done: 7, transcribing: 1, failed: 1 }, by: { me: 5, others: 4 }, speakers: { one: 3, two: 3, many: 2 },
  language: { en: 8, es: 1 } };

function page(query: Record<string, string>, detail: RecordingDetail | null = DONE) {
  TestBed.resetTestingModule();
  const params = new BehaviorSubject(convertToParamMap(query));
  const api = {
    limits: () => of({ status: 'SUCCESS', data: DEFAULT_TRANSCRIPT_LIMITS }),
    list: vi.fn(() => of({ status: 'SUCCESS', data: { rows: detail ? [detail] : [], failedCount: 0, total: detail ? 1 : 0, all: 9, facets: FACETS } })),
    one: vi.fn(() => (detail ? of({ status: 'SUCCESS', data: detail }) : NEVER)),
    audio: vi.fn(() => NEVER),
    change: vi.fn(() => of({ status: 'SUCCESS', data: { ...DONE, maskExports: true } })),
  };
  const open = vi.fn(() => ({ closed: of(undefined), close: vi.fn(), componentInstance: null }));
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: TranscriptApi, useValue: api },
    { provide: Dialog, useValue: { open } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
    { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', data: [] }) } },
    { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
  ] });
  const fixture = TestBed.createComponent(Transcript);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const child = <T>(type: new (...args: never[]) => T) => fixture.debugElement.query(By.directive(type))?.componentInstance as T | undefined;
  return { fixture, el, api, open, params, child, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

describe('Audio Transcript list (tools Option A)', () => {
  it('lists recordings with facets and counts, language codes named, and the drop line', () => {
    const { el, api, child } = page({});
    expect(child(TranscriptList)).toBeDefined();
    expect(child(TranscriptPage)).toBeUndefined();
    expect((api.list.mock.lastCall as unknown as [RecordingQuery])[0]).toMatchObject({ days: 30, q: '', page: 1, status: [], language: [] });
    expect(el.querySelector('[data-facet=language] [data-option=en]')!.textContent).toContain('English');
    expect(el.querySelector('[data-facet=language] [data-option=en] b')!.textContent).toBe('8');
    expect(el.querySelector('[data-facet=language]')!.textContent).toContain('Spanish');
    expect(el.querySelector('[data-facet=speakers]')!.textContent).toContain('Three to six');
    expect(el.querySelector('tr[data-recording="41"]')!.textContent).toContain('ward-round-note.m4a');
    expect(el.querySelector('[data-test=recordings-foot]')!.textContent).toContain('1 recording · drop recordings anywhere on this page to transcribe them');
  });

  it('a facet reads the list again with its value', () => {
    const { el, api } = page({});
    (el.querySelector('[data-facet=speakers] [data-option=many] input') as HTMLInputElement).click();
    expect((api.list.mock.lastCall as unknown as [RecordingQuery])[0].speakers).toEqual(['many']);
  });

  it('opens the side panel only when a row is chosen, with the first lines and Open transcript', () => {
    const { fixture, el, api } = page({});
    expect(el.querySelector('app-recording-panel')).toBeNull();
    (el.querySelector('tr[data-recording="41"]') as HTMLElement).click();
    fixture.detectChanges();
    const panel = el.querySelector('app-recording-panel')!;
    expect(api.one).toHaveBeenCalledWith(41);
    expect(panel.querySelector('[data-test=panel-meta]')!.textContent).toContain('00:13 · English · 1 speaker');
    expect(panel.querySelector('[data-test=panel-transcript]')!.textContent).toContain('Blood pressure is stable');
    expect(panel.querySelector('[data-test=open-transcript]')!.getAttribute('href')).toBe('/tools/transcript?id=41');
    expect(panel.querySelector('[data-test=panel-player]')).not.toBeNull();
  });

  it('?new=1 opens the new transcript over the list', () => {
    const { open } = page({ new: '1' });
    expect((open.mock.calls[0] as unknown as [unknown])[0]).toBe(TranscribeSheet);
  });
});

describe('A transcript\'s own page (tools Option A)', () => {
  it('?id=N opens recording N\'s page: name, status, meta, tabs and the table', () => {
    const { el, child, text } = page({ id: '41' });
    expect(child(TranscriptPage)).toBeDefined();
    expect(child(TranscriptList)).toBeUndefined();
    expect(el.querySelector('h1')!.textContent).toContain('Ward round · bay 3');
    expect(el.querySelector('[data-test=page-status]')!.textContent).toContain('Done');
    expect(el.querySelector('[data-test=page-meta]')!.textContent).toContain('00:13 · English · 1 speaker · transcribed');
    expect([...el.querySelectorAll('[role=tab]')].map(t => t.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Transcript', 'Speakers 1', 'Details']);
    expect(el.querySelector('[data-test=player]')).not.toBeNull();
    expect(el.querySelectorAll('[data-test=segments] tbody tr[data-seg]')).toHaveLength(2);
    expect(text()).toContain('2 segments · click a time to play from there · Space plays and pauses');
  });

  it('searches what was said: n of N, the hits marked, and the next match plays from there', () => {
    const { fixture, el, child } = page({ id: '41' });
    const p = child(TranscriptPage)!;
    p.setQuery('blood');
    fixture.detectChanges();
    expect(el.querySelector('[data-test=hit-count]')!.textContent).toContain('1 of 2');
    expect(el.querySelectorAll('mark')).toHaveLength(2);
    expect(el.querySelectorAll('mark.cur')).toHaveLength(1);
    p.goToHit(1);
    fixture.detectChanges();
    expect(el.querySelector('[data-test=hit-count]')!.textContent).toContain('2 of 2');
    expect(p.playback.current()).toBe(6.5);
  });

  it('a click on a time plays from there', () => {
    const { el, child } = page({ id: '41' });
    (el.querySelector('tr[data-seg="1"] .tlink') as HTMLButtonElement).click();
    expect(child(TranscriptPage)!.playback.current()).toBe(6.5);
  });

  it('one "All speakers" filter shows one speaker\'s words, and search counts only theirs', () => {
    const { fixture, el, child } = page({ id: '42' }, TWO);
    const filter = el.querySelector('[data-test=speaker-filter]') as HTMLSelectElement;
    expect([...filter.options].map(o => o.textContent!.trim())).toEqual(['All speakers', 'Alex Morgan, RN', 'Speaker 2']);
    expect(el.querySelectorAll('tr[data-seg]')).toHaveLength(3);
    filter.value = '1';
    filter.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelectorAll('tr[data-seg]')).toHaveLength(1);
    child(TranscriptPage)!.setQuery('dressing');
    fixture.detectChanges();
    expect(el.querySelector('[data-test=hit-count]')!.textContent).toContain('1 of 1');
    expect(el.querySelector('[data-test=speaker-track]')).not.toBeNull();
  });

  it('Speakers and Details: talk time, the model, the minutes billed, and masking for exports', () => {
    const { fixture, el, api, child, text } = page({ id: '42' }, TWO);
    const p = child(TranscriptPage)!;
    p.tab.set('speakers');
    fixture.detectChanges();
    expect(el.querySelector('[data-test=speakers-card]')!.textContent).toContain('Alex Morgan, RN');
    expect(el.querySelector('[data-test=speakers-card]')!.textContent).toContain('60%');
    p.tab.set('details');
    fixture.detectChanges();
    expect(text()).toContain('Whisper small, on this platform');
    expect(text()).toContain('1 audio minute');
    expect(text()).toContain('Personal details heard: 1 name');
    p.setMask(true);
    expect(api.change).toHaveBeenCalledWith(42, { maskExports: true });
    expect(p.detail()!.maskExports).toBe(true);
  });

  it('polls a recording while it is being transcribed, and shows its progress', () => {
    const { api, el } = page({ id: '41' }, { ...DONE, status: 'RUNNING', stage: 'transcribing', heardSeconds: 6, progressPct: 46 });
    expect(api.one).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-test=progress-card]')!.textContent).toContain('Transcribing… 46%');
    expect(el.querySelector('[data-test=stop]')).not.toBeNull();
  });
});

describe('Transcribe recordings (the new transcript over the list)', () => {
  it('says a file that is not a recording, with the converter, and offers 2 to 6 speakers', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: TranscriptApi, useValue: {} },
      { provide: Dialog, useValue: { open: vi.fn() } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { limits: { ...DEFAULT_TRANSCRIPT_LIMITS, speakers: { available: true } }, canSend: true, bucketAllowed: true } },
    ] });
    const fixture = TestBed.createComponent(TranscribeSheet);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.onRejected({ title: 'visit_notes.docx is not a recording', text: 'Use the converter.', icon: 'file', action: 'converter', actionLabel: 'Open converter' });
    fixture.detectChanges();
    expect(el.querySelector('[data-test=could-not]')!.textContent).toContain('visit_notes.docx is not a recording');
    const speakers = [...(el.querySelector('#nt-spk') as HTMLSelectElement).options].map(o => o.textContent!.trim());
    expect(speakers).toEqual(['Detect speakers (2–6)', 'One speaker', 'Exactly 2 speakers', 'Exactly 3 speakers', 'Exactly 4 speakers',
      'Exactly 5 speakers', 'Exactly 6 speakers']);
  });
});
