import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_LIMITS, RecordingDetail, RecordingSummary, Segment, adviceFor, audioProblem, barsOf, billedMinutes, clock, estimateSeconds,
  exportName, isActive, lanesOf, lengthText, markParts, notARecording, personalText, plainText, railNote, searchHits, segmentAt, speakerName,
  stagesOf, statusPill,
} from './transcript.model';
import { aboutTime, ordinal, timeLeft } from '../tools-shared';
import { costLine } from './new-transcript';

const L = DEFAULT_TRANSCRIPT_LIMITS;
const rec = (over: Partial<RecordingDetail> = {}): RecordingDetail => ({ recordingId: 9, name: 'Home visit · P-1077', fileName: 'P-1077_homevisit.m4a',
  status: 'DONE', durationSeconds: 1122, ...over });
const SEGS: Segment[] = [
  { i: 0, startMs: 0, endMs: 8000, text: 'Good morning. How is the dressing?', speaker: 0 },
  { i: 1, startMs: 9000, endMs: 17000, text: 'The dressing was changed on Saturday.', speaker: 1 },
  { i: 2, startMs: 18000, endMs: 30000, text: 'Keep the same dressing.', speaker: 0 },
];

describe('Audio Transcript rules (tools redesign)', () => {
  it('writes times as the player does', () => {
    expect(clock(372)).toBe('06:12');
    expect(clock(3723)).toBe('1:02:03');
    expect(clock(null)).toBe('00:00');
    expect(lengthText(1122)).toBe('18 min 42 s');
    expect(lengthText(47)).toBe('47 s');
    expect(lengthText(300)).toBe('5 min');
    expect(timeLeft(50)).toBe('about 50 s left');
    expect(timeLeft(190)).toBe('about 3 min left');
    expect(timeLeft(null)).toBe('');
    expect(aboutTime(48)).toBe('about 50 seconds');
    expect(aboutTime(200)).toBe('about 3 minutes');
  });

  it('places a recording in the queue in words', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
    expect(statusPill({ ...rec(), status: 'QUEUED', queuePosition: 3 })).toEqual({ label: 'Queued · 3rd', tone: 'warn' });
    expect(statusPill({ ...rec(), status: 'RUNNING', progressPct: 46.4 }).label).toBe('Transcribing 46%');
    expect(statusPill({ ...rec(), status: 'FAILED', errorCode: 'TOO_LONG' }).label).toBe('Too long');
    expect(statusPill({ ...rec(), status: 'FAILED', errorCode: 'SILENT' }).label).toBe('No speech');
    expect(isActive({ status: 'RUNNING' })).toBe(true);
    expect(isActive({ status: 'STOPPED' })).toBe(false);
  });

  it('bills whole minutes and estimates the time from the model\'s speed', () => {
    expect(billedMinutes(312)).toBe(6);
    expect(billedMinutes(60)).toBe(1);
    expect(billedMinutes(0)).toBe(0);
    expect(estimateSeconds(312, 0.15)).toBeCloseTo(51.8, 1);
    expect(costLine([{ seconds: 312 }], { ...L, realTimeFactor: 0.15 })).toBe('About 50 seconds to transcribe · billed as 6 audio minutes');
    expect(costLine([{ seconds: 312 }, { seconds: null }], { ...L, realTimeFactor: 0.15 })).toContain('(for the ones whose length could be read)');
    expect(costLine([], L)).toBe('');
  });

  it('takes .wav and .ogg as well, and says when a file is not a recording or too big', () => {
    expect(audioProblem('memo.wav', 10, L)).toBe('');
    expect(audioProblem('memo.OGG', 10, L)).toBe('');
    expect(audioProblem('visit_notes.docx', 10, L)).toBe('not-audio');
    expect(audioProblem('long.mp3', 300 * 1024 * 1024, L)).toBe('This file is 300.0 MB; a recording can be up to 250 MB.');
    expect(notARecording('visit_notes.docx', L)).toMatchObject({ action: 'converter', actionLabel: 'Open converter',
      text: 'Audio Transcript takes .mp3, .m4a, .wav, .ogg. To make a PDF from a Word file, use the Document Converter.' });
  });

  it('says each failure with its next step', () => {
    const long = adviceFor({ ...rec(), status: 'FAILED', errorCode: 'TOO_LONG', name: 'Case conference · P-1118', durationSeconds: 2830 }, L)!;
    expect(long.title).toBe('Case conference · P-1118 is 47 minutes long');
    expect(long).toMatchObject({ action: 'split', actionLabel: 'Split at 30 min' });
    expect(adviceFor({ ...rec(), status: 'FAILED', errorCode: 'NO_SPEECH', name: 'Room 4B recording', durationSeconds: 300 }, L))
      .toMatchObject({ title: 'No speech heard in Room 4B recording', action: 'choose' });
    expect(adviceFor({ ...rec(), status: 'QUEUED', queuePosition: 3 }, L)!.text).toBe('2 recordings are ahead of yours. Yours starts by itself; nothing is lost if you close this page.');
    expect(adviceFor({ ...rec(), status: 'QUEUED', queuePosition: 1 }, L)).toBeNull();
    expect(adviceFor({ ...rec(), status: 'STOPPED' }, L)!.action).toBe('retry');
    expect(adviceFor(rec(), L)).toBeNull();
  });

  it('lists the stages, Speakers only when asked for and installed', () => {
    const running = rec({ status: 'RUNNING', stage: 'transcribing', speechSeconds: 400, speakersAsked: 'auto', speakersAvailable: false });
    expect(stagesOf(running).map(s => `${s.label}:${s.state}`)).toEqual(['Uploaded:done', 'Speech found · 6 min 40 s:done', 'Transcribing:now', 'Ready:next']);
    expect(stagesOf({ ...running, speakersAvailable: true }).map(s => s.key)).toContain('speakers');
    expect(stagesOf({ ...running, speakersAvailable: true, speakersAsked: 'one' }).map(s => s.key)).not.toContain('speakers');
    expect(stagesOf(rec()).every(s => s.state === 'done')).toBe(true);
  });

  it('finds the playing segment, and none in a long pause', () => {
    expect(segmentAt(SEGS, 0)).toBe(0);
    expect(segmentAt(SEGS, 9500)).toBe(1);
    expect(segmentAt(SEGS, 8500)).toBe(0);
    expect(segmentAt(SEGS, 60_000)).toBe(-1);
    expect(segmentAt([], 100)).toBe(-1);
  });

  it('counts every place a word was said and marks it in its segment', () => {
    const hits = searchHits(SEGS, 'Dressing');
    expect(hits).toHaveLength(3);
    expect(searchHits(SEGS, '  ')).toEqual([]);
    const parts = markParts(SEGS[1].text, hits, 1, hits);
    expect(parts.map(p => p.text).join('')).toBe(SEGS[1].text);
    expect(parts.filter(p => p.hit >= 0)).toEqual([{ text: 'dressing', hit: 1 }]);
  });

  it('names speakers once and draws their lanes', () => {
    const speakers = [{ key: 0, label: 'Speaker 1', name: 'Alex Morgan, RN' }, { key: 1, label: 'Speaker 2' }];
    expect(speakerName(speakers, 0)).toBe('Alex Morgan, RN');
    expect(speakerName(speakers, 1)).toBe('Speaker 2');
    expect(speakerName(speakers, null)).toBe('');
    const lanes = lanesOf(SEGS, speakers, 30_000);
    expect(lanes[0].spans.map(s => Math.round(s.left))).toEqual([0, 60]);
    expect(lanes[1].spans).toHaveLength(1);
  });

  it('copies plain text with times and speakers, and names exports safely', () => {
    const text = plainText(rec({ segments: SEGS.slice(0, 2), speakers: [{ key: 0, label: 'Speaker 1', name: 'Alex Morgan, RN' }, { key: 1, label: 'Speaker 2' }] }));
    expect(text.split('\n')[0]).toBe('[00:00] Alex Morgan, RN: Good morning. How is the dressing?');
    expect(plainText(rec({ segments: [{ i: 0, startMs: 65000, endMs: 70000, text: 'Hello.' }] }))).toBe('[01:05] Hello.');
    expect(exportName('Home visit · P-1077 / wound', 'vtt')).toBe('Home visit - P-1077 wound.vtt');
  });

  it('says what personal details were heard', () => {
    expect(personalText({ names: 1, datesOfBirth: 1, phones: 1 })).toBe('1 name, 1 date of birth, 1 phone number');
    expect(personalText({ names: 2 })).toBe('2 names');
    expect(personalText(null)).toBe('');
  });

  it('draws at most the bars asked, keeping each run\'s loudest', () => {
    expect(barsOf([0.1, 0.9, 0.2, 0.4], 2)).toEqual([0.9, 0.4]);
    expect(barsOf([2, -1], 10)).toEqual([1, 0]);
    expect(barsOf(null, 10)).toEqual([]);
  });

  it('notes a recording in the rail as the design does', () => {
    const r: RecordingSummary = { ...rec(), speakerCount: 3 };
    expect(railNote(r, 'You', '2 Nov, 08:52', L)).toBe('3 speakers · You · 2 Nov, 08:52');
    expect(railNote({ ...r, status: 'FAILED', errorCode: 'TOO_LONG' }, 'You', '31 Oct', L)).toBe('limit is 30 min · You · 31 Oct');
  });
});
