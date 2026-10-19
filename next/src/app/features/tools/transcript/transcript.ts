import { Component, LOCALE_ID, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { Dialog } from '@angular/cdk/dialog';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../../shared/ui/object-picker';
import { Icon } from '../../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { FileDropzone } from '../../../shared/ui/file-dropzone';
import { ReadAloudService } from '../../../shared/ui/read-aloud.service';
import { ReadAlongText } from '../../../shared/ui/read-along-text';
import { PageHeader } from '../../../shared/ui/page-header';
import { ActionsBar } from '../../../shared/ui/actions-bar';
import { Section } from '../../../shared/ui/section';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatSize } from '../../../shared/ui/format-size';

const AUDIO_EXTENSIONS = ['mp3', 'm4a'];

/** What the transcriber takes (media-service audioTranscript.json/limits, owner #27). */
export interface TranscriptLimits {
  formats: string[];
  uploadMaxMb: number;
  bucketMaxMb: number;
  timeoutMinutes: number;
  retryAfterSeconds: number;
}

/** Until the limits are read (or if they cannot be), the numbers the service ships with -- the server still checks. */
export const DEFAULT_TRANSCRIPT_LIMITS: TranscriptLimits = {
  formats: AUDIO_EXTENSIONS, uploadMaxMb: 250, bucketMaxMb: 500, timeoutMinutes: 30, retryAfterSeconds: 30,
};

/** Why a file cannot be sent, said before it is: the wrong kind, or over the size this path takes. Empty when it can. */
export function audioProblem(name: string, bytes: number | undefined, maxMb: number): string {
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!AUDIO_EXTENSIONS.includes(extension)) return `"${name}" is not an .mp3 or .m4a file.`;
  if (bytes != null && bytes > maxMb * 1024 * 1024) {
    return `This file is ${formatSize(bytes)}; this way takes up to ${maxMb} MB.`;
  }
  return '';
}

@Component({
  selector: 'app-transcript',
  imports: [PageHeader, ActionsBar, Icon, Segmented, FileDropzone, ReadAlongText, Section, ServerTimePipe],
  templateUrl: './transcript.html',
  styles: `
    /* Owner #27: the work on the left, what the tool takes on the right; one column below a wide screen. */
    .limits-strip { display: flex; flex-wrap: wrap; gap: 0.375rem 1.25rem; font-size: 0.8125rem; color: var(--text-secondary);
                    padding: 0.625rem 0.875rem; margin-bottom: 1rem; border-radius: var(--radius-lg); background: var(--surface-inset);
                    border: 1px solid var(--border-subtle); font-variant-numeric: tabular-nums; }
    .limits-strip b { font-weight: 500; color: var(--text-muted); margin-right: 0.25rem; }
    .limits-note { color: var(--text-muted); flex-basis: 100%; }
    .picked-file { display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border: 1px solid var(--border-subtle);
                   border-radius: var(--radius-lg); background: var(--surface-sunken); }
    .picked-empty { border-style: dashed; background: transparent; }
  `,
})
export class Transcript implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly reader = inject(ReadAloudService);

  readonly mode = signal<'upload' | 'bucket'>('upload');
  readonly modeOptions: SegmentOption<'upload' | 'bucket'>[] = [
    { id: 'upload', label: 'Upload a file', icon: 'upload' },
    { id: 'bucket', label: 'From a bucket', icon: 'folder' },
  ];
  readonly timestamps = signal(false);
  readonly file = signal<File | null>(null);

  readonly bucket = signal('');
  readonly selectedKey = signal('');
  /** The bucket file picked, with its size and date for the card (the picker's answer). */
  readonly picked = signal<PickedObject | null>(null);

  /** What the transcriber takes; the defaults until the server's limits are read. */
  readonly limits = signal<TranscriptLimits>(DEFAULT_TRANSCRIPT_LIMITS);
  /** The last try was turned away because every transcriber slot and its waiting line were full (429). */
  readonly busy = signal(false);
  readonly size = formatSize;

  /** The chosen file cannot go: the wrong kind or too big for this path, said before Transcribe. */
  readonly problem = computed(() => {
    if (this.mode() === 'upload') {
      const file = this.file();
      return file ? audioProblem(file.name, file.size, this.limits().uploadMaxMb) : '';
    }
    const picked = this.picked();
    return picked ? audioProblem(picked.name, picked.size, this.limits().bucketMaxMb) : '';
  });

  readonly extracting = signal(false);
  readonly transcript = signal('');

  /**
   * Splits the transcript on its [HH:MM:SS.mmm] markers so the timestamp can be set apart
   * from the words. As one flat block the markers competed with the speech for attention,
   * which is the opposite of what they are for -- they are an index, not content.
   */
  readonly segments = computed(() => {
    const text = this.transcript();
    if (!text) return [];
    const pattern = /\[(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]/g;

    const found: { time: string; at: number; length: number }[] = [];
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      found.push({ time: match[1], at: match.index, length: match[0].length });
    }
    // No markers means timestamps were switched off. Splitting on line breaks still gives
    // the table and timeline something to number -- one wall of text would make both views
    // pointless, and a transcript without stamps is exactly when they are chosen.
    if (!found.length) {
      const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
      return (lines.length ? lines : [text.trim()]).map(line => ({ time: '', text: line }));
    }

    const segments: { time: string; text: string }[] = [];
    const lead = text.slice(0, found[0].at).trim();
    if (lead) segments.push({ time: '', text: lead });

    found.forEach((marker, index) => {
      const from = marker.at + marker.length;
      const to = index + 1 < found.length ? found[index + 1].at : text.length;
      segments.push({ time: marker.time, text: text.slice(from, to).trim() });
    });
    return segments;
  });
  readonly error = signal('');

  /**
   * The same three readings the run-logs screen offers, and for the same reason: a timeline
   * to follow it, a table to scan it, and the raw stream when you want the file as it is.
   * All three work whether or not timestamps were asked for -- without them a segment is a
   * line and the time column simply stays empty.
   */
  readonly view = signal<'timeline' | 'table' | 'console'>('timeline');
  readonly views: SegmentOption<'timeline' | 'table' | 'console'>[] = [
    { id: 'timeline', label: 'Timeline', icon: 'clock' },
    { id: 'table',    label: 'Table',    icon: 'list' },
    { id: 'console',  label: 'Console',  icon: 'terminal' },
  ];

  readonly hasTimes = computed(() => this.segments().some(s => !!s.time));

  /** Plain text for the clipboard, matching whichever reading is on screen. */
  consoleText(): string {
    return this.segments()
      .map(s => (s.time ? `[${s.time}] ${s.text}` : s.text))
      .join('\n');
  }

  readonly canExtract = computed(() =>
    (this.mode() === 'upload' ? !!this.file() : !!this.selectedKey()) && !this.problem());

  /**
   * Chooses the audio in the console's one ObjectPicker, which offers only mp3 and m4a and
   * reopens in the folder of the last pick; dismissing it keeps that pick.
   */
  chooseFile(): void {
    const key = this.selectedKey();
    this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({
      heading: 'Pick an audio file',
      bucket: this.bucket() || undefined,
      selectedKey: key || undefined,
      extensions: AUDIO_EXTENSIONS,
    })).closed.subscribe(picked => {
      if (!picked) return;
      this.bucket.set(picked.bucket);
      this.selectedKey.set(picked.key);
      this.picked.set(picked);
    });
  }

  /** Forgets the bucket file; the next Choose opens at the bucket's root. */
  clearPick(): void {
    this.selectedKey.set('');
    this.picked.set(null);
  }

  /** "77.0 KB · modified 19 Oct 2026, 18:07" for the picked file's card; empty when the picker said neither. */
  readonly pickedMeta = computed(() => {
    const picked = this.picked();
    if (!picked) return '';
    const parts: string[] = [];
    if (picked.size != null) parts.push(formatSize(picked.size));
    const at = picked.lastModified ? this.when.transform(picked.lastModified, 'dateTime') : null;
    if (at) parts.push(`modified ${at}`);
    return parts.join(' · ');
  });
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));

  /** The folder a picked key sits in, for the card. */
  folderOf(key: string): string {
    const cut = key.lastIndexOf('/');
    return cut > 0 ? key.slice(0, cut + 1) : '/';
  }

  setMode(mode: 'upload' | 'bucket'): void {
    this.mode.set(mode);
    this.transcript.set('');
    this.error.set('');
    this.busy.set(false);
  }

  onFile(file: File | null): void {
    this.file.set(file);
    this.transcript.set('');
  }

  extract(): void {
    if (!this.canExtract()) return;
    this.extracting.set(true);
    this.error.set('');
    this.busy.set(false);
    this.transcript.set('');

    const done = {
      next: (response: ApiResponse<string>) => {
        this.extracting.set(false);
        if (response.status === API_SUCCESS) this.transcript.set(String(response.data ?? ''));
        else this.error.set(response.message);
      },
      error: (err: any) => {
        this.extracting.set(false);
        // 429: every transcriber slot is busy and its waiting line is full -- nothing is wrong with the file.
        this.busy.set(err?.status === 429);
        this.error.set(err?.error?.message || (err?.status === 429
          ? `The transcriber is busy with other recordings. Try again in about ${this.limits().retryAfterSeconds} seconds.`
          : err?.status === 413 ? 'The file is too big to upload.' : 'The extraction failed.'));
      },
    };

    if (this.mode() === 'upload') {
      const file = this.file()!;
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('timestamps', String(this.timestamps()));
      this.http.post<ApiResponse<string>>(`${API_BASE}/audioTranscript.json/extractFromUpload`, form)
        .subscribe(done);
    } else {
      this.http.post<ApiResponse<string>>(`${API_BASE}/audioTranscript.json/extractFromBucket`, {
        bucket: this.bucket(), key: this.selectedKey(), timestamps: this.timestamps(),
      }).subscribe(done);
    }
  }

  // ---- Read along -------------------------------------------------------------------------
  //
  // A transcript is usually read to check it against the audio, and doing that by eye means
  // holding your place in a wall of text while listening. Reading it back with the word being
  // spoken marked lets the text keep your place for you.

  /** What the voice reads: one passage per segment, so the highlight lands on the right one. */
  readonly passages = computed(() => this.segments().map(segment => segment.text));

  /** Which segment is being spoken, or -1. Compared against $index to mark just that one. */
  readonly readingIndex = computed(() => this.reader.progress()?.passage ?? -1);

  /**
   * The word being spoken, as an offset into its own segment.
   *
   * Handed to the one segment that is active rather than to all of them, so a word boundary
   * re-renders a single passage instead of every passage on screen.
   */
  readonly readingAt = computed(() => {
    const progress = this.reader.progress();
    return progress ? { charIndex: progress.charIndex, charLength: progress.charLength } : null;
  });

  /** Ids are strings because that is what app-segmented is keyed on; parsed back in setSpeed. */
  readonly speeds: SegmentOption<string>[] = [
    { id: '0.75', label: '0.75x' },
    { id: '1',    label: '1x' },
    { id: '1.5',  label: '1.5x' },
  ];

  /** The chosen speed as the segmented control's own id, so the right segment reads as active. */
  readonly speedId = computed(() => String(this.reader.rate()));

  constructor() {
    this.http.get<ApiResponse<TranscriptLimits>>(`${API_BASE}/audioTranscript.json/limits`).subscribe({
      next: r => { if (r?.status === API_SUCCESS && typeof r.data?.uploadMaxMb === 'number') this.limits.set(r.data); },
      error: () => { /* the limits are a hint; the server still checks */ },
    });

    // Follows the voice down the page. Keyed on the segment, not the word, so the container is
    // not fighting the reader for the scroll position several times a second.
    effect(() => {
      const index = this.readingIndex();
      if (index < 0) return;
      // Deferred a frame: on the first passage the highlight is being rendered by this same
      // change, and the element is not yet in the document to scroll to.
      requestAnimationFrame(() => {
        // Smooth only where motion is welcome. Following a reading scrolls once per passage,
        // which for anyone who has asked for less movement is exactly the kind of repeated
        // animated scroll that setting exists to turn off.
        const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        document.querySelector(`[data-read-index="${index}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
      });
    });

    // A reading is about this transcript. Extracting another one, or clearing it, leaves the
    // voice reading text that is no longer on screen -- with nothing on screen to stop it by,
    // since the controls only appear when there is a transcript.
    effect(() => {
      if (!this.transcript()) this.reader.stop();
    });

    // A transcript belongs to the file it came from. Picking another bucket file left the
    // previous one's text (or its error) under the new selection, as a new upload never did.
    // Only on a change of file: the first run is the component starting, not a new pick.
    let lastKey = this.selectedKey();
    effect(() => {
      const key = this.selectedKey();
      if (key === lastKey) return;
      lastKey = key;
      untracked(() => { this.transcript.set(''); this.error.set(''); this.busy.set(false); });
    });
  }

  /**
   * Stops the voice on the way out.
   *
   * The reader is provided at the root, so it outlives this screen: without this, navigating
   * away mid-reading leaves a disembodied voice reading a transcript that is no longer anywhere
   * on screen, and nothing left to stop it with.
   */
  ngOnDestroy(): void {
    this.reader.stop();
  }

  /** Play, pause or resume, depending on where the reading has got to. */
  toggleReading(): void {
    if (this.reader.state() === 'playing') { this.reader.pause(); return; }
    if (this.reader.state() === 'paused') { this.reader.resume(); return; }
    this.reader.play(this.passages());
  }

  /** Start reading from a chosen segment, so a passage can be re-heard without replaying all. */
  readFrom(index: number): void {
    this.reader.play(this.passages(), index);
  }

  setSpeed(id: string): void {
    const rate = Number(id);
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.reader.rate.set(rate);
    // Applied to the passage being spoken rather than only to the next one: a speed control
    // that does nothing until the current sentence ends reads as a broken control.
    this.reader.restartCurrentPassage();
  }

  /** A timestamp is worth copying on its own -- it is how you cite a moment in the audio. */
  async copyStamp(time: string): Promise<void> {
    if (await copyText(time)) this.toast.success(`${time} copied.`);
    else this.toast.error('Could not copy the timestamp.');
  }

  async copy(): Promise<void> {
    if (await copyText(this.transcript())) this.toast.success('Transcript copied.');
    else this.toast.error('Could not copy the transcript.');
  }
}
