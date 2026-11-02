import { formatSize } from '../../../shared/ui/format-size';
import { ordinal } from '../tools-shared';

/**
 * Audio Transcript's shapes and rules (tools redesign, owner-approved 2026-11-02): recordings kept with their transcripts,
 * transcribed on the server while the reader may leave, a player synced to the segments, and every failure in plain words
 * with what to do next. Pure, so the page and its specs read the same rules.
 */

/** What the transcriber takes (audioTranscript.json/limits). */
export interface TranscriptLimits {
  formats: string[];
  uploadMaxMb: number;
  bucketMaxMb: number;
  timeoutMinutes: number;
  retryAfterSeconds: number;
  maxMinutes?: number;
  keepRecordingDays?: number;
  model?: string;
  realTimeFactor?: number;
  languages?: { code: string; label: string }[];
  languageNote?: string;
  speakers?: { available: boolean; reason?: string | null };
  running?: number;
  waiting?: number;
}

/** Until the limits are read (or if they cannot be), the numbers the service ships with; the server still checks. */
export const DEFAULT_TRANSCRIPT_LIMITS: TranscriptLimits = {
  formats: ['mp3', 'm4a', 'wav', 'ogg'], uploadMaxMb: 250, bucketMaxMb: 500, timeoutMinutes: 30, retryAfterSeconds: 30,
  maxMinutes: 30, keepRecordingDays: 30, realTimeFactor: 0.2, languages: [{ code: 'auto', label: 'Detect automatically' }],
  languageNote: 'English, Spanish and 97 other languages, detected in each part of the recording',
  speakers: { available: false, reason: "Speaker labels aren't installed on this platform." },
};

export type RecordingStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'STOPPED';
export type RecordingStage = 'queued' | 'uploaded' | 'speech' | 'transcribing' | 'speakers' | 'done';
export type RecordingError = 'TOO_LONG' | 'NO_SPEECH' | 'SILENT' | 'UNREADABLE' | 'TOO_SHORT' | 'DISTORTED' | 'BUSY' | 'FAILED';

export interface RecordingSummary {
  recordingId: number;
  name: string;
  fileName: string;
  fileSize?: number | null;
  durationSeconds?: number | null;
  status: RecordingStatus;
  stage?: RecordingStage | null;
  progressPct?: number | null;
  heardSeconds?: number | null;
  speechSeconds?: number | null;
  etaSeconds?: number | null;
  queuePosition?: number | null;
  errorCode?: RecordingError | null;
  errorMessage?: string | null;
  speakerCount?: number | null;
  createdBy?: number | null;
  createdByName?: string | null;
  createdAt?: string | null;
  finishedAt?: string | null;
  partOf?: number | null;
  partIndex?: number | null;
  partCount?: number | null;
  offsetSeconds?: number | null;
}

export interface Speaker {
  key: number;
  label: string;
  name?: string | null;
  talkSeconds?: number | null;
  talkPct?: number | null;
}

export interface Segment {
  i: number;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: number | null;
  edited?: boolean;
  original?: string | null;
}

export interface RecordingDetail extends RecordingSummary {
  language?: string | null;
  model?: string | null;
  processingSeconds?: number | null;
  billedMinutes?: number | null;
  speakersAsked?: 'auto' | 'one' | null;
  speakersAvailable?: boolean | null;
  speakers?: Speaker[] | null;
  segments?: Segment[] | null;
  peaks?: number[] | null;
  keepRecording?: boolean | null;
  recordingKept?: boolean | null;
  recordingExpiresAt?: string | null;
  maskExports?: boolean | null;
  sendToDocuments?: boolean | null;
  documents?: { ocrDocumentId?: number | null; outcome?: string | null } | null;
  version?: number | null;
  personal?: { names?: number; datesOfBirth?: number; phones?: number } | null;
}

export interface RecordingList {
  rows: RecordingSummary[];
  failedCount: number;
  total: number;
}

export type RailView = 'everyone' | 'mine' | 'failed';
export type ExportFormat = 'txt' | 'vtt' | 'srt' | 'json' | 'pdf';

/** Still being worked on: the page polls it. */
export function isActive(r: Pick<RecordingSummary, 'status'>): boolean {
  return r.status === 'QUEUED' || r.status === 'RUNNING';
}

/** 0:05, 07:15, 1:02:03 -- a recording's length or a moment in it. */
export function clock(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

/** "18 min 42 s", "47 s", "1 h 2 min": a length in words for Details. */
export function lengthText(seconds: number | null | undefined): string {
  const s = Math.round(seconds ?? 0);
  if (s < 60) return `${s} s`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

/** Billed by the minute of audio, each recording rounded up to a whole minute. */
export function billedMinutes(seconds: number): number {
  return seconds > 0 ? Math.ceil(seconds / 60) : 0;
}

/** Seconds to transcribe a recording this long, at the model's real-time factor (0.2: a minute of audio in 12 s). */
export function estimateSeconds(seconds: number, realTimeFactor: number | null | undefined): number {
  return Math.max(5, seconds * (realTimeFactor && realTimeFactor > 0 ? realTimeFactor : 0.2) + 5);
}

/** Why a file cannot be sent, before it is: not a recording this takes, or over the size. Empty when it can. */
export function audioProblem(name: string, bytes: number | null | undefined, limits: TranscriptLimits, maxMb = limits.uploadMaxMb): string {
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!limits.formats.includes(extension)) return 'not-audio';
  if (bytes != null && bytes > maxMb * 1024 * 1024) return `This file is ${formatSize(bytes)}; a recording can be up to ${maxMb} MB.`;
  return '';
}

/** The formats as the screen says them: ".mp3, .m4a, .wav, .ogg". */
export function formatsText(limits: TranscriptLimits): string {
  return limits.formats.map(f => '.' + f).join(', ');
}

/** The status pill of a recording in the rail. */
export function statusPill(r: RecordingSummary): { label: string; tone: 'ok' | 'info' | 'warn' | 'crit' | 'neutral' } {
  switch (r.status) {
    case 'DONE': return { label: 'Done', tone: 'ok' };
    case 'RUNNING': return { label: r.progressPct != null ? `Transcribing ${Math.round(r.progressPct)}%` : 'Transcribing', tone: 'info' };
    case 'QUEUED': return { label: r.queuePosition ? `Queued · ${ordinal(r.queuePosition)}` : 'Queued', tone: 'warn' };
    case 'STOPPED': return { label: 'Stopped', tone: 'neutral' };
    default: {
      const labels: Partial<Record<RecordingError, string>> = { TOO_LONG: 'Too long', NO_SPEECH: 'No speech', SILENT: 'No speech',
        UNREADABLE: 'Unreadable', TOO_SHORT: 'Too short', DISTORTED: 'Distorted' };
      return { label: labels[r.errorCode ?? 'FAILED'] ?? 'Failed', tone: 'crit' };
    }
  }
}

/** The rail's second line after the pill: "3 speakers · You · 2 Nov, 08:52", "limit is 30 min · You · 31 Oct". */
export function railNote(r: RecordingSummary, by: string, when: string, limits: TranscriptLimits): string {
  const parts: string[] = [];
  if (r.status === 'DONE' && r.speakerCount) parts.push(`${r.speakerCount} ${r.speakerCount === 1 ? 'speaker' : 'speakers'}`);
  if (r.status === 'FAILED' && r.errorCode === 'TOO_LONG') parts.push(`limit is ${limits.maxMinutes ?? 30} min`);
  if (r.partCount && r.partIndex) parts.push(`part ${r.partIndex} of ${r.partCount}`);
  parts.push(by);
  if (when) parts.push(when);
  return parts.join(' · ');
}

/** A failure in plain words with what to do next, and the one action that helps. */
export interface Advice {
  title: string;
  text: string;
  icon: 'clock' | 'volumeOff' | 'file' | 'alert';
  action: 'split' | 'choose' | 'converter' | 'retry' | null;
  actionLabel: string;
}

export function adviceFor(r: RecordingSummary, limits: TranscriptLimits): Advice | null {
  const max = limits.maxMinutes ?? 30;
  if (r.status === 'QUEUED' && (r.queuePosition ?? 0) > 1) {
    return { title: 'The transcriber is busy', icon: 'clock', action: null, actionLabel: '',
      text: `${(r.queuePosition ?? 1) - 1} ${(r.queuePosition ?? 1) - 1 === 1 ? 'recording is' : 'recordings are'} ahead of yours. Yours starts by itself; nothing is lost if you close this page.` };
  }
  if (r.status === 'STOPPED') {
    return { title: `${r.name} was stopped`, icon: 'alert', action: 'retry', actionLabel: 'Start again',
      text: 'Nothing was billed. Start it again while its recording is kept, or choose another.' };
  }
  if (r.status !== 'FAILED') return null;
  const minutes = Math.round((r.durationSeconds ?? 0) / 60);
  switch (r.errorCode) {
    case 'TOO_LONG':
      return { title: `${r.name} is ${minutes || 'over ' + max} minutes long`, icon: 'clock', action: 'split', actionLabel: `Split at ${max} min`,
        text: `A recording can be up to ${max} minutes. Split it into parts (any audio editor, or Split at ${max} min here), or ask your administrator to raise the limit.` };
    case 'NO_SPEECH':
    case 'SILENT':
      return { title: `No speech heard in ${r.name}`, icon: 'volumeOff', action: 'choose', actionLabel: 'Choose another',
        text: `${r.durationSeconds ? lengthText(r.durationSeconds) + ' of ' : ''}silence or background noise. Check that the right file was chosen and the microphone was on.` };
    case 'TOO_SHORT':
      return { title: `${r.name} is too short`, icon: 'clock', action: 'choose', actionLabel: 'Choose another',
        text: 'At least half a second of audio is needed.' };
    case 'DISTORTED':
      return { title: `${r.name} is distorted`, icon: 'volumeOff', action: 'choose', actionLabel: 'Choose another',
        text: 'Most of it is clipped, so it cannot be transcribed reliably. Record it again further from the microphone.' };
    case 'UNREADABLE':
      return { title: `${r.name} could not be read as audio`, icon: 'file', action: 'choose', actionLabel: 'Choose another',
        text: 'It may be damaged, or not really the type its name says. Export it again from the recorder and try once more.' };
    default:
      return { title: `${r.name} could not be transcribed`, icon: 'alert', action: 'retry', actionLabel: 'Try again',
        text: r.errorMessage || 'Try again; if it keeps failing, ask your administrator.' };
  }
}

/** A file that is not a recording, said before upload with a link to the converter. */
export function notARecording(name: string, limits: TranscriptLimits): Advice {
  return { title: `${name} is not a recording`, icon: 'file', action: 'converter', actionLabel: 'Open converter',
    text: `Audio Transcript takes ${formatsText(limits)}. To make a PDF from a Word file, use the Document Converter.` };
}

export interface StageStep { key: RecordingStage; label: string; state: 'done' | 'now' | 'next'; }

/** The stages a recording goes through, with where it is now; Speakers only when they were asked for and can be told. */
export function stagesOf(r: RecordingDetail): StageStep[] {
  const speakers = r.speakersAsked !== 'one' && !!r.speakersAvailable;
  const keys: RecordingStage[] = ['uploaded', 'speech', 'transcribing', ...(speakers ? ['speakers' as RecordingStage] : []), 'done'];
  const order: RecordingStage[] = ['queued', 'uploaded', 'speech', 'transcribing', 'speakers', 'done'];
  const now = r.status === 'DONE' ? 'done' : (r.stage ?? 'queued');
  const at = order.indexOf(now);
  return keys.map(key => {
    const label = key === 'uploaded' ? 'Uploaded' : key === 'speech' ? (r.speechSeconds != null ? `Speech found · ${lengthText(r.speechSeconds)}` : 'Speech found')
      : key === 'transcribing' ? 'Transcribing' : key === 'speakers' ? 'Speakers' : 'Ready';
    const i = order.indexOf(key);
    return { key, label, state: r.status === 'DONE' || i < at ? 'done' : i === at ? 'now' : 'next' };
  });
}

/** The segment playing at this moment (ms into the recording), or -1. */
export function segmentAt(segments: Segment[], ms: number): number {
  let lo = 0, hi = segments.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].startMs <= ms) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (found >= 0 && ms > segments[found].endMs + 1500) return -1;
  return found;
}

/** One place the search found: the segment, and where in its text. */
export interface Hit { segment: number; start: number; end: number; }

/** Every place the words appear, case aside, in order: what search's "3 of 7" counts and its timeline marks. */
export function searchHits(segments: Segment[], query: string): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: Hit[] = [];
  segments.forEach((s, segment) => {
    const text = s.text.toLowerCase();
    for (let at = text.indexOf(q); at >= 0; at = text.indexOf(q, at + q.length)) hits.push({ segment, start: at, end: at + q.length });
  });
  return hits;
}

/** A segment's text cut around its hits, for <mark>: [{text, hit index or -1}]. */
export function markParts(text: string, hits: Hit[], segment: number, all: Hit[]): { text: string; hit: number }[] {
  const mine = hits.filter(h => h.segment === segment);
  if (!mine.length) return [{ text, hit: -1 }];
  const parts: { text: string; hit: number }[] = [];
  let at = 0;
  for (const h of mine) {
    if (h.start > at) parts.push({ text: text.slice(at, h.start), hit: -1 });
    parts.push({ text: text.slice(h.start, h.end), hit: all.indexOf(h) });
    at = h.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: -1 });
  return parts;
}

/** A speaker's name as every view shows it: the name given, else "Speaker 1". */
export function speakerName(speakers: Speaker[] | null | undefined, key: number | null | undefined): string {
  if (key == null) return '';
  const s = (speakers ?? []).find(x => x.key === key);
  return s?.name || s?.label || `Speaker ${key + 1}`;
}

/** Where each speaker talks, as fractions of the recording, for the lanes under the waveform. */
export function lanesOf(segments: Segment[], speakers: Speaker[], durationMs: number): { key: number; spans: { left: number; width: number }[] }[] {
  if (!durationMs) return [];
  return speakers.map(s => ({
    key: s.key,
    spans: segments.filter(seg => seg.speaker === s.key).map(seg => ({
      left: (seg.startMs / durationMs) * 100, width: Math.max(0.3, ((seg.endMs - seg.startMs) / durationMs) * 100) })),
  }));
}

/** The file name an export downloads as: the recording's name, made safe, with the format's extension. */
export function exportName(name: string, format: ExportFormat): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/ · /g, ' - ') || 'transcript';
  return `${safe}.${format}`;
}

/** The transcript as plain text, speakers and times included when they exist (Copy text). */
export function plainText(r: RecordingDetail): string {
  return (r.segments ?? []).map(s => {
    const who = speakerName(r.speakers, s.speaker);
    return `[${clock(s.startMs / 1000)}]${who ? ' ' + who + ':' : ''} ${s.text}`;
  }).join('\n');
}

/** "1 name, 1 date of birth, 1 phone number". Empty when nothing personal was heard. */
export function personalText(p: RecordingDetail['personal']): string {
  if (!p) return '';
  const parts: string[] = [];
  const add = (n: number | undefined, one: string, many: string) => { if (n) parts.push(`${n} ${n === 1 ? one : many}`); };
  add(p.names, 'name', 'names');
  add(p.datesOfBirth, 'date of birth', 'dates of birth');
  add(p.phones, 'phone number', 'phone numbers');
  return parts.join(', ');
}

/** The waveform's bars, at most `bars` of them: the loudest of each run of peaks. */
export function barsOf(peaks: number[] | null | undefined, bars: number): number[] {
  const p = peaks ?? [];
  if (!p.length || bars <= 0) return [];
  if (p.length <= bars) return p.map(v => Math.max(0, Math.min(1, v)));
  const out: number[] = [];
  const step = p.length / bars;
  for (let b = 0; b < bars; b++) {
    let max = 0;
    for (let i = Math.floor(b * step); i < Math.floor((b + 1) * step); i++) max = Math.max(max, p[i] ?? 0);
    out.push(Math.max(0, Math.min(1, max)));
  }
  return out;
}
