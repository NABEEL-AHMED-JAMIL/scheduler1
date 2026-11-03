import { Component, DestroyRef, ElementRef, LOCALE_ID, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { instantOf } from '../../../core/instant';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatSize } from '../../../shared/ui/format-size';
import { languageName, timeLeft } from '../tools-shared';
import { TranscriptApi } from './transcript.api';
import { TranscriptActions } from './transcript-actions';
import { Playback } from './playback';
import { SpeakerTrack } from './speaker-track';
import {
  Advice, ExportFormat, RecordingDetail, RecordingSummary, TranscriptLimits, adviceFor, clock, isActive, lengthText, metaLine,
  speakerName, stagesOf, statusPill,
} from './transcript.model';

const POLL_MS = 2000;
/** The transcript's first lines the panel shows; the rest are on the transcript's page. */
const FIRST_LINES = 4;

type PanelTab = 'transcript' | 'speakers' | 'details';

/** The exports a Download menu offers, in its order. */
export const EXPORTS: { format: ExportFormat; label: string; icon: string }[] = [
  { format: 'txt', label: 'Text with speakers and times', icon: 'file' },
  { format: 'pdf', label: 'Printable transcript', icon: 'file' },
  { format: 'vtt', label: 'Subtitles', icon: 'file' },
  { format: 'srt', label: 'Subtitles', icon: 'file' },
  { format: 'json', label: 'Segments and speakers', icon: 'code' },
];

/**
 * The selected recording, in the list's side panel (tools Option A, owner 2026-11-02; design transcript-a.html): its status
 * and "18:42 · English · 3 speakers", a compact player with one speaker-coloured track, Transcript / Speakers / Details with
 * the transcript's first lines, and Next steps -- Open transcript, Download, Send to Documents, ⋮. A recording on its way
 * shows its progress and Stop; a failure says what happened and the one thing that helps.
 */
@Component({
  selector: 'app-recording-panel',
  imports: [Icon, RouterLink, SpeakerTrack, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './recording-panel.html',
  styleUrls: ['../tools-panel.css', './transcript-shared.css'],
  styles: `
    .rp-player { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.75rem; }
    .rp-segs { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    .rp-segs td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); vertical-align: top; }
    .rp-segs td:first-child { width: 4.25rem; padding-left: 1rem; padding-top: 0.75rem; }
    .rp-segs .spk { font-size: 0.75rem; }
    .rp-more { padding: 0.375rem 1rem 0; font-size: 0.75rem; color: var(--text-muted); }
    .rp-talk { height: 0.375rem; border-radius: var(--radius-full); background: var(--surface-sunken); overflow: hidden; margin-top: 0.375rem; }
    .rp-talk i { display: block; height: 100%; background: var(--spk); }
  `,
  host: { class: 'tx-panel', role: 'region', 'aria-label': 'The selected recording' },
})
export class RecordingPanel {
  private readonly api = inject(TranscriptApi);
  private readonly actions = inject(TranscriptActions);
  private readonly router = inject(Router, { optional: true });
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));

  readonly summary = input.required<RecordingSummary>();
  readonly limits = input.required<TranscriptLimits>();
  readonly canSend = input(false);
  /** The reader's id: "You" for their own. */
  readonly me = input<number | null>(null);
  readonly closed = output<void>();
  /** Something changed that the list shows (stopped, deleted, started again): it reads its rows again. */
  readonly changed = output<void>();
  /** "Choose another": the new transcript's panel. */
  readonly chooseAnother = output<void>();

  readonly audioEl = viewChild<ElementRef<HTMLAudioElement>>('audio');
  readonly playback = new Playback(() => this.audioEl()?.nativeElement);
  readonly detail = signal<RecordingDetail | null>(null);
  readonly error = signal('');
  readonly tab = signal<PanelTab>('transcript');
  private load: Subscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** The recording's id: a fresh summary of the same recording (the list polls) does not read it again. */
  readonly id = computed(() => this.summary().recordingId);
  /** The detail once read, the list's summary until then. */
  readonly r = computed<RecordingDetail>(() => this.detail() ?? (this.summary() as RecordingDetail));
  readonly pill = computed(() => statusPill(this.r()));
  readonly meta = computed(() => metaLine(this.r(), languageName));
  readonly segments = computed(() => this.detail()?.segments ?? []);
  readonly first = computed(() => this.segments().slice(0, FIRST_LINES));
  readonly speakers = computed(() => this.detail()?.speakers ?? []);
  readonly advice = computed<Advice | null>(() => adviceFor(this.r(), this.limits()));
  readonly active = computed(() => isActive(this.r()));
  readonly stages = computed(() => (this.detail() ? stagesOf(this.detail()!) : []));
  readonly canPlay = computed(() => this.r().status === 'DONE' && !!this.detail()?.recordingKept);
  readonly exports = EXPORTS;
  readonly clock = clock;
  readonly lengthText = lengthText;
  readonly size = formatSize;
  readonly timeLeft = timeLeft;
  readonly languageName = languageName;
  readonly speakerName = (key: number | null | undefined) => speakerName(this.speakers(), key);
  readonly tone = (key: number | null | undefined) => `spk-${(key ?? 0) % 6}`;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.open(id));
    });
    inject(DestroyRef).onDestroy(() => { this.stopReading(); this.playback.reset(); });
  }

  private stopReading(): void {
    this.load?.unsubscribe();
    this.load = null;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private open(id: number): void {
    this.stopReading();
    this.playback.reset();
    this.detail.set(null);
    this.error.set('');
    this.tab.set('transcript');
    this.read(id);
  }

  private read(id: number): void {
    this.load = this.api.one(id).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'This recording could not be read.'); return; }
        const was = this.detail();
        this.detail.set(r.data);
        if (isActive(r.data)) this.timer = setTimeout(() => this.read(id), POLL_MS);
        else {
          if (was && isActive(was)) this.changed.emit();
          if (r.data.status === 'DONE' && r.data.recordingKept) {
            this.playback.load(this.api, id, r.data.offsetSeconds ?? 0, r.data.durationSeconds ?? 0);
          }
        }
      },
      error: () => this.error.set('This recording could not be read.'),
    });
  }

  reload(): void {
    this.stopReading();
    this.read(this.summary().recordingId);
  }

  pageLink(): Record<string, number> {
    return { id: this.summary().recordingId };
  }

  byLine(r: RecordingSummary): string {
    const by = r.createdBy != null && r.createdBy === this.me() ? 'You' : (r.createdByName || '—');
    const at = instantOf(r.createdAt ?? '');
    return at ? `${by} · ${this.when.transform(at, 'recent')}` : by;
  }

  keptText(d: RecordingDetail): string {
    const at = instantOf(d.recordingExpiresAt ?? '');
    const recording = d.recordingKept ? (at ? `recording until ${this.when.transform(at, 'day')}` : 'recording kept for playback') : 'recording not kept';
    return `Transcript until you delete it · ${recording}`;
  }

  progressOf(d: RecordingDetail): number {
    if (d.progressPct != null) return Math.max(0, Math.min(100, d.progressPct));
    return d.durationSeconds ? Math.round(((d.heardSeconds ?? 0) / d.durationSeconds) * 100) : 0;
  }

  // ----------------------------------------------------------------------------------------------------------- actions

  download(format: ExportFormat): void {
    const d = this.detail();
    if (d) this.actions.download(d, format);
  }

  async send(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const fresh = await this.actions.sendToDocuments(d);
    if (fresh) this.detail.set(fresh);
  }

  pipeline(): void {
    const d = this.detail();
    if (d) this.actions.keep(d, true);
  }

  copy(): void {
    const d = this.detail();
    if (d) void this.actions.copy(d);
  }

  async again(): Promise<void> {
    const d = this.detail();
    if (d && await this.actions.again(d)) { this.changed.emit(); this.reload(); }
  }

  async stop(): Promise<void> {
    if (await this.actions.stop(this.r())) { this.changed.emit(); this.reload(); }
  }

  async remove(): Promise<void> {
    if (await this.actions.remove(this.r())) { this.changed.emit(); this.closed.emit(); }
  }

  async act(a: Advice): Promise<void> {
    if (a.action === 'choose') { this.chooseAnother.emit(); return; }
    if (a.action === 'converter') { void this.router?.navigate(['/tools/converter']); return; }
    const done = await this.actions.act(this.r(), a);
    if (!done) return;
    this.changed.emit();
    if (Array.isArray(done)) {
      if (done[0]) void this.router?.navigate(['/tools/transcript'], { queryParams: { id: done[0].recordingId } });
    } else this.reload();
  }
}
