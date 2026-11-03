import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { formatSize } from '../../../shared/ui/format-size';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { aboutTime } from '../tools-shared';
import { TranscribeOptions, TranscriptApi } from './transcript.api';
import {
  Advice, RecordingDetail, SPEAKER_CHOICES, SpeakerChoice, TranscriptLimits, audioProblem, billedMinutes, clock, estimateSeconds,
  formatsText, notARecording,
} from './transcript.model';

/** A recording waiting to be sent: from this computer (its length read before upload) or from a bucket. */
export interface Pending {
  id: number;
  name: string;
  size: number | null;
  file: File | null;
  source: { bucket: string; key: string } | null;
  /** Seconds, read from the file by the browser before upload; null until read (or when it cannot be). */
  seconds: number | null;
  progress: number | null;
  error: string;
}

/** The length of a recording, read by the browser from its header, before a byte is uploaded; null when it cannot tell. */
export function readDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') { resolve(null); return; }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (seconds: number | null) => { URL.revokeObjectURL(url); resolve(seconds); };
    const timer = setTimeout(() => done(null), 8000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => { clearTimeout(timer); done(isFinite(audio.duration) ? audio.duration : null); };
    audio.onerror = () => { clearTimeout(timer); done(null); };
    audio.src = url;
  });
}

/** "About 50 seconds to transcribe · billed as 6 audio minutes" for the recordings waiting, from their lengths. */
export function costLine(pending: Pick<Pending, 'seconds'>[], limits: TranscriptLimits): string {
  const known = pending.filter(p => p.seconds != null);
  if (!pending.length) return '';
  if (!known.length) return 'Billed by the minute of audio; the length is read once it is uploaded.';
  const minutes = known.reduce((sum, p) => sum + billedMinutes(p.seconds ?? 0), 0);
  const work = known.reduce((sum, p) => sum + estimateSeconds(p.seconds ?? 0, limits.realTimeFactor), 0);
  const more = known.length < pending.length ? ' (for the ones whose length could be read)' : '';
  const time = aboutTime(work);
  return `${time[0].toUpperCase()}${time.slice(1)} to transcribe · billed as ${minutes} audio ${minutes === 1 ? 'minute' : 'minutes'}${more}`;
}

/**
 * New transcript (tools redesign): several recordings at once, each's length read before upload; the name, language and
 * speakers (found, one, or exactly 2 to 6); whether the recording is kept 30 days for playback, personal details masked in exports, and the transcript
 * sent to Documents when done; the time and billed minutes before anything starts.
 */
@Component({
  selector: 'app-new-transcript',
  imports: [Icon],
  templateUrl: './new-transcript.html',
  styleUrl: './new-transcript.css',
})
export class NewTranscript {
  private readonly api = inject(TranscriptApi);
  private readonly dialog = inject(Dialog);

  readonly limits = input.required<TranscriptLimits>();
  /** The reader may open Documents: "Send to Documents when done" is offered. */
  readonly canSend = input(false);
  /** A bucket may be used (not the platform administrator's own sign-in). */
  readonly bucketAllowed = input(true);
  /** In a card of its own (with its heading), or bare inside a side panel that names it. */
  readonly framed = input(true);
  readonly created = output<RecordingDetail[]>();
  readonly rejected = output<Advice>();

  readonly pending = signal<Pending[]>([]);
  private nextId = 1;
  readonly dragging = signal(false);
  readonly name = signal('');
  readonly language = signal('auto');
  readonly speakers = signal<SpeakerChoice>('auto');
  readonly speakerChoices = SPEAKER_CHOICES;
  readonly keepRecording = signal(true);
  readonly maskExports = signal(false);
  readonly sendToDocuments = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  private uploads: Subscription[] = [];

  readonly speakersAvailable = computed(() => !!this.limits().speakers?.available);
  readonly accept = computed(() => this.limits().formats.map(f => '.' + f).join(','));
  readonly hint = computed(() => `${formatsText(this.limits())} · up to ${this.limits().uploadMaxMb} MB and ${this.limits().maxMinutes ?? 30} minutes each · several at once`);
  readonly cost = computed(() => costLine(this.pending(), this.limits()));
  readonly count = computed(() => this.pending().filter(p => !p.error).length);
  readonly size = formatSize;
  readonly clock = clock;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.uploads.forEach(s => s.unsubscribe()));
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.add([...(event.dataTransfer?.files ?? [])]);
  }

  onPick(event: Event): void {
    const el = event.target as HTMLInputElement;
    void this.add([...(el.files ?? [])]);
    el.value = '';
  }

  /** Recordings join the list with their length read; anything else is said as "not a recording", with the converter. */
  async add(files: File[]): Promise<void> {
    this.error.set('');
    for (const file of files) {
      const problem = audioProblem(file.name, file.size, this.limits());
      if (problem === 'not-audio') { this.rejected.emit(notARecording(file.name, this.limits())); continue; }
      const item: Pending = { id: this.nextId++, name: file.name, size: file.size, file, source: null, seconds: null, progress: null,
        error: problem ? `${problem} Put it in a bucket and choose it From a bucket (up to ${this.limits().bucketMaxMb} MB).` : '' };
      this.pending.update(list => [...list, item]);
      if (!problem) {
        const seconds = await readDuration(file);
        this.pending.update(list => list.map(p => p.id === item.id ? { ...p, seconds } : p));
      }
    }
    if (this.pending().length === 1 && !this.name()) this.name.set(this.pending()[0].name.replace(/\.[^.]+$/, ''));
  }

  fromBucket(): void {
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({
      heading: 'Pick a recording to transcribe', extensions: this.limits().formats,
    })).closed.subscribe(picked => {
      if (!picked) return;
      const problem = audioProblem(picked.name, picked.size, this.limits(), this.limits().bucketMaxMb);
      if (problem === 'not-audio') { this.rejected.emit(notARecording(picked.name, this.limits())); return; }
      this.pending.update(list => [...list, { id: this.nextId++, name: picked.name, size: picked.size ?? null, file: null,
        source: { bucket: picked.bucket, key: picked.key }, seconds: null, progress: null, error: problem }]);
      if (this.pending().length === 1 && !this.name()) this.name.set(picked.name.replace(/\.[^.]+$/, ''));
    });
  }

  remove(id: number): void {
    this.pending.update(list => list.filter(p => p.id !== id));
    if (!this.pending().length) this.name.set('');
  }

  overLength(p: Pending): boolean {
    return p.seconds != null && p.seconds > (this.limits().maxMinutes ?? 30) * 60;
  }

  /** Sends each recording in turn; the server transcribes them while the reader may leave. */
  async transcribe(): Promise<void> {
    const list = this.pending().filter(p => !p.error);
    if (!list.length || this.sending()) return;
    this.sending.set(true);
    this.error.set('');
    const made: RecordingDetail[] = [];
    const one = list.length === 1;
    for (const p of list) {
      const options: TranscribeOptions = {
        name: one ? this.name() : undefined, speakers: this.speakersAvailable() ? this.speakers() : 'one',
        keepRecording: this.keepRecording(), maskExports: this.maskExports(), sendToDocuments: this.canSend() && this.sendToDocuments(),
      };
      const answer = await this.sendOne(p, options);
      if (answer) {
        made.push(answer);
        this.pending.update(all => all.filter(x => x.id !== p.id));
      }
    }
    this.sending.set(false);
    if (made.length) {
      this.name.set('');
      this.created.emit(made);
    }
  }

  private sendOne(p: Pending, options: TranscribeOptions): Promise<RecordingDetail | null> {
    const fail = (message: string) => {
      this.pending.update(all => all.map(x => x.id === p.id ? { ...x, progress: null, error: message } : x));
      return null;
    };
    return new Promise(resolve => {
      if (p.source) {
        this.uploads.push(this.api.fromBucket(p.source.bucket, p.source.key, options).subscribe({
          next: r => resolve(r.status === API_SUCCESS && r.data ? r.data : fail(r.message || 'It could not be started.')),
          error: err => resolve(fail(err?.error?.message || 'It could not be started.')),
        }));
        return;
      }
      this.uploads.push(this.api.upload(p.file!, options).subscribe({
        next: event => {
          if (event.type === HttpEventType.UploadProgress) {
            const done = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            this.pending.update(all => all.map(x => x.id === p.id ? { ...x, progress: done } : x));
            return;
          }
          if (event.type !== HttpEventType.Response) return;
          const r = event.body;
          resolve(r?.status === API_SUCCESS && r.data ? r.data : fail(r?.message || 'It could not be uploaded.'));
        },
        error: err => resolve(fail(err?.error?.message || (err?.status === 413 ? 'The file is too big to upload.' : 'It could not be uploaded.'))),
      }));
    });
  }
}
