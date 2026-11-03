import { Component, DestroyRef, ElementRef, HostListener, LOCALE_ID, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { instantOf } from '../../../core/instant';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { confirmWith } from '../../../shared/ui/confirm';
import { formatSize } from '../../../shared/ui/format-size';
import { languageName, timeLeft } from '../tools-shared';
import { TranscriptApi, RecordingChange } from './transcript.api';
import { TranscriptActions } from './transcript-actions';
import { EXPORTS } from './recording-panel';
import { Playback } from './playback';
import { SpeakerTrack } from './speaker-track';
import {
  Advice, DEFAULT_TRANSCRIPT_LIMITS, ExportFormat, RecordingDetail, Segment, TranscriptLimits, TranscriptLine, adviceFor, clock,
  isActive, lengthText, markParts, metaLine, personalText, plainText, searchHits, segmentAt, speakerName, stagesOf, statusPill,
  transcriptLines,
} from './transcript.model';

const POLL_MS = 2000;
export type PageTab = 'transcript' | 'speakers' | 'details';

/**
 * A transcript's own page (tools Option A, owner 2026-11-02; design transcript-a-detail.html), as a run's page: the name
 * with its status, "18:42 · English · 3 speakers · transcribed 2 Nov, 08:52 by you · file.m4a", Download, ⋮ and Send to
 * Documents; then Transcript / Speakers / Details. The transcript has one sticky player row (one track coloured by
 * speaker, the search's hits above it, speed), a search with "3 of 7", one "All speakers" filter, Follow playback, and a
 * table -- Time (click to play from there), Speaker, What was said -- with the playing row highlighted and, while a search
 * is on, long stretches folded away. Everything the earlier page did stays: corrections, speaker names and merges, masked
 * exports, keep, pipeline, transcribe again, stop, split, delete, and polling while it is transcribed.
 */
@Component({
  selector: 'app-transcript-page',
  imports: [PageHeader, Icon, RouterLink, ServerTimePipe, AppLoading, InlineStatus, SpeakerTrack, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './transcript-page.html',
  styleUrls: ['./transcript-shared.css', './transcript-page.css'],
})
export class TranscriptPage implements OnInit {
  private readonly api = inject(TranscriptApi);
  private readonly actions = inject(TranscriptActions);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));

  readonly id = input.required<number>();
  readonly me = computed(() => (typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null) ?? null);
  readonly canSend = computed(() => !!this.auth?.canOpen?.('document-intelligence'));
  readonly limits = signal<TranscriptLimits>(DEFAULT_TRANSCRIPT_LIMITS);

  readonly detail = signal<RecordingDetail | null>(null);
  readonly state = createLoadState();
  private load: Subscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly tab = signal<PageTab>('transcript');
  readonly audioEl = viewChild<ElementRef<HTMLAudioElement>>('audio');
  readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('search');
  readonly playback = new Playback(() => this.audioEl()?.nativeElement);
  readonly rates = [0.75, 1, 1.25, 1.5, 2];
  readonly follow = signal(true);
  readonly query = signal('');
  readonly hitAt = signal(0);
  /** "all", or the one speaker shown. */
  readonly speakerShown = signal<'all' | number>('all');
  readonly opened = signal<ReadonlySet<number>>(new Set());
  readonly plainView = signal(false);
  readonly editing = signal(false);
  readonly drafts = signal<Record<number, string>>({});
  readonly saving = signal(false);
  readonly renaming = signal<number | null>(null);

  readonly segments = computed<Segment[]>(() => this.detail()?.segments ?? []);
  readonly speakers = computed(() => this.detail()?.speakers ?? []);
  readonly duration = computed(() => this.detail()?.durationSeconds ?? 0);
  readonly pill = computed(() => { const d = this.detail(); return d ? statusPill(d) : null; });
  readonly advice = computed<Advice | null>(() => { const d = this.detail(); return d ? adviceFor(d, this.limits()) : null; });
  readonly stages = computed(() => { const d = this.detail(); return d ? stagesOf(d) : []; });
  readonly personal = computed(() => personalText(this.detail()?.personal));
  readonly plain = computed(() => { const d = this.detail(); return d ? plainText(d) : ''; });
  /** The segments the speaker filter shows, by their index. */
  readonly shown = computed(() => {
    const only = this.speakerShown();
    return this.segments().map((s, i) => (only === 'all' || s.speaker === only ? i : -1)).filter(i => i >= 0);
  });
  readonly hits = computed(() => {
    const only = this.speakerShown();
    return searchHits(this.segments(), this.query()).filter(h => only === 'all' || this.segments()[h.segment].speaker === only);
  });
  readonly hitMarks = computed(() => (this.duration() ? this.hits().map(h => this.segments()[h.segment].startMs / 1000 / this.duration()) : []));
  /** The part being played; none before playback has started. */
  readonly playingIndex = computed(() => (this.playback.playing() || this.playback.current() > 0
    ? segmentAt(this.segments(), this.playback.current() * 1000) : -1));
  readonly lines = computed<TranscriptLine[]>(() => {
    if (this.editing() || !this.hits().length) return this.shown().map(index => ({ kind: 'seg' as const, index }));
    const anchors = new Set(this.hits().map(h => h.segment));
    if (this.playingIndex() >= 0) anchors.add(this.playingIndex());
    return transcriptLines(this.shown(), this.segments(), anchors, this.opened());
  });

  readonly exports = EXPORTS;
  readonly clock = clock;
  readonly lengthText = lengthText;
  readonly size = formatSize;
  readonly timeLeft = timeLeft;
  readonly languageName = languageName;
  readonly speakerName = (key: number | null | undefined) => speakerName(this.speakers(), key);
  readonly tone = (key: number | null | undefined) => `spk-${(key ?? 0) % 6}`;

  constructor() {
    // Follow playback: the playing row is kept in view.
    effect(() => {
      const i = this.playingIndex();
      if (i < 0 || !this.follow() || !this.playback.playing()) return;
      untracked(() => document.querySelector(`[data-seg="${i}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
    });
    effect(() => {
      const id = this.id();
      untracked(() => this.open(id));
    });
    inject(DestroyRef).onDestroy(() => { this.stopReading(); this.playback.reset(); });
  }

  ngOnInit(): void {
    this.api.limits().subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data && Array.isArray(r.data.formats)) this.limits.set({ ...DEFAULT_TRANSCRIPT_LIMITS, ...r.data }); },
      error: () => this.limits.set(DEFAULT_TRANSCRIPT_LIMITS),
    });
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
    this.query.set('');
    this.speakerShown.set('all');
    this.opened.set(new Set());
    this.editing.set(false);
    this.read(id);
  }

  private read(id: number): void {
    if (!this.detail()) this.state.start();
    this.load = this.api.one(id).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.state.fail(r, 'This recording could not be read.'); return; }
        this.detail.set(r.data);
        this.state.done();
        if (isActive(r.data)) this.timer = setTimeout(() => this.read(id), POLL_MS);
        else if (r.data.status === 'DONE' && r.data.recordingKept) {
          this.playback.load(this.api, id, r.data.offsetSeconds ?? 0, r.data.durationSeconds ?? 0);
        }
      },
      error: err => this.state.fail(err, 'This recording could not be read.'),
    });
  }

  reload(): void {
    this.stopReading();
    this.read(this.id());
  }

  /** "18:42 · English · 3 speakers · transcribed 2 Nov, 08:52 by you". */
  metaText(d: RecordingDetail): string {
    const at = instantOf(d.finishedAt ?? d.createdAt ?? '');
    const by = d.createdBy == null || d.createdBy === this.me() ? 'you' : (d.createdByName || 'someone else');
    const verb = d.status === 'DONE' ? 'transcribed' : 'uploaded';
    return `${metaLine(d, languageName)} · ${verb}${at ? ' ' + this.when.transform(at, 'recent') : ''} by ${by}`;
  }

  keptText(d: RecordingDetail): string {
    const at = instantOf(d.recordingExpiresAt ?? '');
    const recording = d.recordingKept ? (at ? `Recording until ${this.when.transform(at, 'day')}, for playback.` : 'Recording kept for playback.')
      : 'Recording not kept.';
    return `Transcript until you delete it. ${recording}`;
  }

  tookText(d: RecordingDetail): string {
    if (d.processingSeconds == null) return '—';
    const speed = d.durationSeconds && d.processingSeconds > 0 ? ` (${(d.durationSeconds / d.processingSeconds).toFixed(1)}× real time)` : '';
    return `${lengthText(d.processingSeconds)}${speed}`;
  }

  progressOf(d: RecordingDetail): number {
    if (d.progressPct != null) return Math.max(0, Math.min(100, d.progressPct));
    return d.durationSeconds ? Math.round(((d.heardSeconds ?? 0) / d.durationSeconds) * 100) : 0;
  }

  /** "Whisper small, on this platform" for whisper-small. */
  modelLabel(model: string | null | undefined): string {
    if (!model) return '—';
    const words = model.replace(/-/g, ' ');
    return `${words[0].toUpperCase()}${words.slice(1)}, on this platform`;
  }

  // ------------------------------------------------------------------------------------------------------------- keys

  /** Space plays, J and L go back and forward 5 seconds, / searches -- unless the reader is typing. */
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (this.detail()?.status !== 'DONE' || this.tab() !== 'transcript') return;
    const target = event.target as HTMLElement | null;
    if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || target.getAttribute('role') === 'slider')) return;
    if (event.key === ' ' && !target?.closest('button, a')) { event.preventDefault(); this.playback.toggle(); }
    else if (event.key === 'j' || event.key === 'J') this.playback.skip(-5);
    else if (event.key === 'l' || event.key === 'L') this.playback.skip(5);
    else if (event.key === '/') { event.preventDefault(); this.searchBox()?.nativeElement.focus(); }
  }

  // ----------------------------------------------------------------------------------------------------------- search

  setQuery(value: string): void {
    this.query.set(value);
    this.hitAt.set(0);
    this.opened.set(new Set());
    this.goToHit(0, false);
  }

  goToHit(i: number, seek = true): void {
    const hits = this.hits();
    if (!hits.length) return;
    const at = (i + hits.length) % hits.length;
    this.hitAt.set(at);
    if (seek) this.playback.seekTo(this.segments()[hits[at].segment].startMs / 1000);
    document.querySelector(`[data-seg="${hits[at].segment}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  parts(s: Segment, index: number) {
    return markParts(s.text, this.hits(), index, this.hits());
  }

  showSpeaker(value: string): void {
    this.speakerShown.set(value === 'all' ? 'all' : Number(value));
    this.hitAt.set(0);
  }

  openGap(from: number): void {
    this.opened.update(set => new Set([...set, from]));
  }

  playFrom(s: Segment): void {
    this.playback.playFrom(s.startMs / 1000);
  }

  // ------------------------------------------------------------------------------------------------------ corrections

  startEditing(): void {
    this.drafts.set(Object.fromEntries(this.segments().map(s => [s.i, s.text])));
    this.tab.set('transcript');
    this.plainView.set(false);
    this.editing.set(true);
  }

  draft(i: number, text: string): void {
    this.drafts.update(d => ({ ...d, [i]: text }));
  }

  saveEdits(): void {
    const changed = this.segments().filter(s => (this.drafts()[s.i] ?? s.text).trim() !== s.text).map(s => ({ i: s.i, text: this.drafts()[s.i].trim() }));
    if (!changed.length) { this.editing.set(false); return; }
    this.change({ segments: changed }, `${changed.length} ${changed.length === 1 ? 'correction' : 'corrections'} kept as a new version; the original stays.`,
      () => this.editing.set(false));
  }

  private change(change: RecordingChange, done: string, then?: () => void): void {
    const d = this.detail();
    if (!d) return;
    this.saving.set(true);
    this.api.change(d.recordingId, change).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The change could not be saved.'); return; }
        this.detail.set(r.data);
        if (done) this.toast.success(done);
        then?.();
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.message || 'The change could not be saved.'); },
    });
  }

  renameSpeaker(key: number, name: string): void {
    this.renaming.set(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed === this.speakerName(key)) return;
    this.change({ speakers: [{ key, name: trimmed }] }, `Named ${trimmed}; every export uses the name.`);
  }

  async merge(from: number, into: number): Promise<void> {
    if (from === into) return;
    const ok = await confirmWith(this.dialog, { title: 'Merge speakers', confirmLabel: 'Merge',
      body: `${this.speakerName(from)}'s segments become ${this.speakerName(into)}'s.` });
    if (ok) this.change({ merge: { from, into } }, 'Speakers merged.');
  }

  setMask(on: boolean): void {
    this.change({ maskExports: on }, on ? 'Exports now replace personal details with [NAME], [DOB] and [PHONE].' : 'Exports now show personal details as heard.');
  }

  // -------------------------------------------------------------------------------------------------------------- use

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

  keep(forPipeline: boolean): void {
    const d = this.detail();
    if (d) this.actions.keep(d, forPipeline);
  }

  copy(): void {
    const d = this.detail();
    if (d) void this.actions.copy(d);
  }

  async again(): Promise<void> {
    const d = this.detail();
    if (d && await this.actions.again(d)) this.open(d.recordingId);
  }

  async stop(): Promise<void> {
    const d = this.detail();
    if (d && await this.actions.stop(d)) this.reload();
  }

  async remove(): Promise<void> {
    const d = this.detail();
    if (d && await this.actions.remove(d)) void this.router?.navigate(['/tools/transcript']);
  }

  async act(a: Advice): Promise<void> {
    const d = this.detail();
    if (!d) return;
    if (a.action === 'choose') { void this.router?.navigate(['/tools/transcript'], { queryParams: { new: 1 } }); return; }
    if (a.action === 'converter') { void this.router?.navigate(['/tools/converter']); return; }
    const done = await this.actions.act(d, a);
    if (Array.isArray(done)) { if (done[0]) void this.router?.navigate(['/tools/transcript'], { queryParams: { id: done[0].recordingId } }); }
    else if (done) this.reload();
  }
}
