import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Combobox } from '../../../shared/ui/combobox';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { BucketSummary, ObjectSummary, StorageService } from '../../objects/storage.service';
import { Icon } from '../../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { FileDropzone } from '../../../shared/ui/file-dropzone';
import { ReadAloudService } from '../../../shared/ui/read-aloud.service';
import { ReadAlongText } from '../../../shared/ui/read-along-text';

const AUDIO_EXTENSIONS = ['mp3', 'm4a'];

@Component({
  selector: 'app-transcript',
  imports: [Icon, Segmented, FileDropzone, ReadAlongText, Combobox],
  templateUrl: './transcript.html',
})
export class Transcript implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  readonly reader = inject(ReadAloudService);

  readonly mode = signal<'upload' | 'bucket'>('upload');
  readonly modeOptions: SegmentOption<'upload' | 'bucket'>[] = [
    { id: 'upload', label: 'Upload a file', icon: 'upload' },
    { id: 'bucket', label: 'From a bucket', icon: 'folder' },
  ];
  readonly timestamps = signal(false);
  readonly file = signal<File | null>(null);

  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly objects = signal<ObjectSummary[]>([]);
  readonly loadingObjects = signal(false);
  readonly selectedKey = signal('');

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

  /** Where in the bucket the picker is looking. Empty is the root. */
  readonly prefix = signal('');

  /** Set when a level has more entries than one page returned; the token to fetch the rest.
      Undefined means either the level is fully loaded or hasn't loaded yet. Without this, a
      folder holding more than 200 entries (an "ETL Avatars"-style bucket with hundreds of
      per-user folders is a real example) silently truncated at 200 with no way to reach
      anything past it -- the audio being looked for could be sitting just past the cut. */
  readonly nextToken = signal<string | undefined>(undefined);

  /** Folders at this level, so audio nested inside them can be reached. */
  readonly folders = computed(() => this.objects().filter(o => o.folder));

  readonly bucketOptions = computed(() => this.buckets().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));
  readonly fileOptions = computed(() => this.audioObjects().map(o => ({ value: o.key, label: o.name, hint: o.key })));
  readonly audioObjects = computed(() =>
    this.objects().filter(o => !o.folder && AUDIO_EXTENSIONS.some(e => o.name.toLowerCase().endsWith('.' + e))));

  /** Breadcrumb segments for the current prefix, each with the prefix to jump back to. */
  readonly crumbs = computed(() => {
    const parts = this.prefix().split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, prefix: parts.slice(0, i + 1).join('/') + '/' }));
  });

  /** True when this level holds neither audio nor anywhere further to look. */
  readonly nothingHere = computed(() =>
    !this.loadingObjects() && !this.browseError() && !this.audioObjects().length && !this.folders().length);

  readonly canExtract = computed(() =>
    this.mode() === 'upload' ? !!this.file() : !!this.selectedKey());

  ngOnInit(): void {
    this.storage.buckets().subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.buckets.set(response.data ?? []);
      },
      error: () => { /* upload mode still works without a bucket list */ },
    });
  }

  onBucketChange(value: string): void {
    this.bucket.set(value);
    this.selectedKey.set('');
    this.objects.set([]);
    this.nextToken.set(undefined);
    this.prefix.set('');
    if (!value) return;
    this.browse('');
  }

  /** Descend into a folder. */
  openFolder(key: string): void { this.browse(key); }

  /** Jump to a breadcrumb, or to the bucket root when given nothing. */
  goTo(prefix: string): void { this.browse(prefix); }

  /** Fetches the next page of the level currently open, appending rather than replacing. */
  loadMore(): void { this.browse(this.prefix(), true); }

  /**
   * Lists one level of the bucket.
   *
   * The audio this tool is for is rarely at the root -- ours sits two levels down, under
   * audio_text/input -- and listing only the root showed an empty picker on a bucket holding
   * forty files. Folders are listed alongside the audio so there is somewhere to go, rather
   * than being filtered out and leaving the tool looking broken.
   */
  /**
   * Why the folder in the breadcrumb could not be read. A refusal or a failed request was
   * dropped, which left the previous level's folders and files under the new breadcrumb -- or
   * "Nothing here" for a folder that had not been read at all.
   */
  readonly browseError = signal('');

  /** Reads the level in the breadcrumb again, after a failure. */
  retryBrowse(): void { this.browse(this.prefix()); }

  private browse(prefix: string, append = false): void {
    this.prefix.set(prefix);
    this.selectedKey.set('');
    this.browseError.set('');
    this.loadingObjects.set(true);
    // Only the newest listing may write: clicking through folders quickly would otherwise let
    // a slow response for an abandoned one replace the level actually being viewed.
    const ticket = ++this.browseTicket;
    this.storage.listObjects(this.bucket(), prefix, append ? this.nextToken() : undefined, 200)
      .subscribe({
        next: response => {
          if (ticket !== this.browseTicket) return;
          this.loadingObjects.set(false);
          if (response.status !== API_SUCCESS) {
            this.failBrowse(response.message || 'This folder could not be read.', append);
            return;
          }
          const page = response.data?.objects ?? [];
          this.objects.update(current => (append ? [...current, ...page] : page));
          this.nextToken.set(response.data?.nextContinuationToken);
        },
        error: err => {
          if (ticket !== this.browseTicket) return;
          this.loadingObjects.set(false);
          this.failBrowse(err?.error?.message || 'This folder could not be read.', append);
        },
      });
  }

  /** A failed "load more" keeps what is listed; a failed level shows nothing it has not read. */
  private failBrowse(message: string, append: boolean): void {
    this.browseError.set(message);
    if (!append) {
      this.objects.set([]);
      this.nextToken.set(undefined);
    }
  }

  private browseTicket = 0;

  onFile(file: File | null): void {
    this.file.set(file);
    this.transcript.set('');
  }

  extract(): void {
    this.extracting.set(true);
    this.error.set('');
    this.transcript.set('');

    const done = {
      next: (response: ApiResponse<string>) => {
        this.extracting.set(false);
        if (response.status === API_SUCCESS) this.transcript.set(String(response.data ?? ''));
        else this.error.set(response.message);
      },
      error: (err: any) => {
        this.extracting.set(false);
        this.error.set(err?.error?.message || 'The extraction failed.');
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
