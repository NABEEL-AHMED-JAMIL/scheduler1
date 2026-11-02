import { Component, DestroyRef, ElementRef, HostListener, LOCALE_ID, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { instantOf } from '../../../core/instant';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { confirmWith } from '../../../shared/ui/confirm';
import { copyText } from '../../../shared/ui/clipboard.util';
import { formatSize } from '../../../shared/ui/format-size';
import { KeepChoice, KeepDialog, KeepDialogData, monthFolder } from '../keep-dialog';
import { saveBlob, timeLeft } from '../tools-shared';
import { TranscriptApi } from './transcript.api';
import { NewTranscript } from './new-transcript';
import { Waveform } from './waveform';
import {
  Advice, DEFAULT_TRANSCRIPT_LIMITS, ExportFormat, RailView, RecordingDetail, RecordingSummary, Segment, TranscriptLimits,
  adviceFor, clock, exportName, isActive, lanesOf, lengthText, markParts, personalText, plainText, railNote, searchHits, segmentAt,
  speakerName, stagesOf, statusPill, formatsText,
} from './transcript.model';

const POLL_MS = 2000;
const RAIL_POLL_MS = 5000;

/**
 * Audio Transcript (tools redesign, owner-approved 2026-11-02): every recording transcribed in the last 30 days in a rail,
 * searchable by name and by what was said; a new transcript (several recordings, the time and billed minutes before
 * starting) that runs on the server while the reader may leave, with its stages, minutes heard and time left; a finished
 * transcript played back with a waveform, the playing segment followed, search with hits on the timeline, speakers named
 * once, corrections kept as a new version; and the transcript used -- downloaded, sent to Documents, given to a pipeline.
 *
 * One route, /tools/transcript: ?id= opens a recording, ?new=1 (or nothing chosen) the new transcript.
 */
@Component({
  selector: 'app-transcript',
  imports: [PageHeader, Icon, RouterLink, NgTemplateOutlet, Segmented, AppLoading, InlineStatus, NewTranscript, Waveform,
    CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './transcript.html',
  styleUrl: './transcript.css',
})
export class Transcript implements OnInit {
  private readonly api = inject(TranscriptApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly when = new ServerTimePipe(inject(LOCALE_ID));

  readonly ownSignIn = isOwnPlatformSignIn(this.auth);
  readonly me = computed(() => (typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null) ?? null);
  readonly canSend = computed(() => !!this.auth?.canOpen?.('document-intelligence'));

  readonly limits = signal<TranscriptLimits>(DEFAULT_TRANSCRIPT_LIMITS);

  // --------------------------------------------------------------------------------------------------------------- rail
  readonly railView = signal<RailView>('everyone');
  readonly railQuery = signal('');
  readonly rail = signal<RecordingSummary[]>([]);
  readonly railFailed = signal(0);
  readonly railTotal = signal(0);
  readonly railState = createLoadState();
  readonly railOptions = computed<SegmentOption<RailView>[]>(() => [
    { id: 'everyone', label: 'Everyone' }, { id: 'mine', label: 'Mine' },
    { id: 'failed', label: this.railFailed() ? `Failed ${this.railFailed()}` : 'Failed' },
  ]);
  private railTimer: ReturnType<typeof setTimeout> | null = null;
  private railLoad: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // ------------------------------------------------------------------------------------------------------------ chosen
  readonly chosenId = signal<number | null>(null);
  readonly detail = signal<RecordingDetail | null>(null);
  readonly detailState = createLoadState();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private detailLoad: Subscription | null = null;
  /** Files dropped that are not recordings, said in "Could not be transcribed". */
  readonly rejects = signal<Advice[]>([]);

  /** The reader's own recordings still being worked on, shown under New transcript. */
  readonly myActive = computed(() => this.rail().filter(r => isActive(r) && (r.createdBy == null || r.createdBy === this.me())));
  readonly activeDetails = signal<Record<number, RecordingDetail>>({});
  /** The reader's own recent failures, with what to do next, plus the rejected files. */
  readonly problems = computed(() => {
    const mine = this.rail().filter(r => (r.createdBy == null || r.createdBy === this.me()) && !r.partOf)
      .map(r => ({ r, advice: adviceFor(r, this.limits()) })).filter(x => !!x.advice && x.r.status !== 'QUEUED').slice(0, 5);
    const queued = this.myActive().filter(r => r.status === 'QUEUED' && (r.queuePosition ?? 0) > 1)
      .map(r => ({ r, advice: adviceFor(r, this.limits()) }));
    return [...queued, ...mine];
  });

  // ------------------------------------------------------------------------------------------------------------ player
  readonly audioEl = viewChild<ElementRef<HTMLAudioElement>>('audio');
  readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('search');
  readonly audioUrl = signal<string | null>(null);
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly playing = signal(false);
  readonly current = signal(0);
  readonly rate = signal(1);
  readonly rates = [0.75, 1, 1.25, 1.5, 2];
  readonly follow = signal(true);
  readonly mode = signal<'transcript' | 'table' | 'plain'>('transcript');
  readonly modeOptions: SegmentOption<'transcript' | 'table' | 'plain'>[] = [
    { id: 'transcript', label: 'Transcript' }, { id: 'table', label: 'Table' }, { id: 'plain', label: 'Plain text' },
  ];
  readonly query = signal('');
  readonly hitAt = signal(0);
  readonly hidden = signal<ReadonlySet<number>>(new Set());
  readonly editing = signal(false);
  readonly drafts = signal<Record<number, string>>({});
  readonly saving = signal(false);
  readonly renaming = signal<number | null>(null);

  readonly offset = computed(() => this.detail()?.offsetSeconds ?? 0);
  readonly duration = computed(() => this.detail()?.durationSeconds ?? 0);
  readonly segments = computed<Segment[]>(() => this.detail()?.segments ?? []);
  readonly speakers = computed(() => this.detail()?.speakers ?? []);
  readonly hasSpeakers = computed(() => this.speakers().length > 0);
  readonly shownSegments = computed(() => this.segments().filter(s => s.speaker == null || !this.hidden().has(s.speaker)));
  /** The part being played; none before playback has started. */
  readonly playingIndex = computed(() => this.playing() || this.current() > 0 ? segmentAt(this.segments(), this.current() * 1000) : -1);
  readonly position = computed(() => this.duration() ? Math.min(1, this.current() / this.duration()) : 0);
  readonly hits = computed(() => searchHits(this.segments(), this.query()));
  readonly hitMarks = computed(() => this.duration() ? this.hits().map(h => this.segments()[h.segment].startMs / 1000 / this.duration()) : []);
  readonly lanes = computed(() => lanesOf(this.segments(), this.speakers(), this.duration() * 1000));
  readonly stages = computed(() => { const d = this.detail(); return d ? stagesOf(d) : []; });
  readonly personal = computed(() => personalText(this.detail()?.personal));
  readonly plain = computed(() => { const d = this.detail(); return d ? plainText(d) : ''; });

  readonly clock = clock;
  readonly lengthText = lengthText;
  readonly size = formatSize;
  readonly statusPill = statusPill;
  readonly timeLeft = timeLeft;
  readonly speakerName = (key: number | null | undefined) => speakerName(this.speakers(), key);

  constructor() {
    // Follow playback: the playing segment is kept in view.
    effect(() => {
      const i = this.playingIndex();
      if (i < 0 || !this.follow() || !this.playing()) return;
      untracked(() => document.querySelector(`[data-seg="${i}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
    });
    inject(DestroyRef).onDestroy(() => {
      [this.pollTimer, this.railTimer, this.searchTimer].forEach(t => t && clearTimeout(t));
      this.railLoad?.unsubscribe();
      this.detailLoad?.unsubscribe();
      const url = this.audioUrl();
      if (url) URL.revokeObjectURL(url);
    });
  }

  ngOnInit(): void {
    this.api.limits().subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data && Array.isArray(r.data.formats)) this.limits.set({ ...DEFAULT_TRANSCRIPT_LIMITS, ...r.data }); },
      error: () => this.limits.set(DEFAULT_TRANSCRIPT_LIMITS),
    });
    this.loadRail();
    this.route?.queryParamMap?.subscribe(params => {
      const id = Number(params.get('id'));
      this.open(id > 0 ? id : null);
    });
    if (!this.route) this.open(null);
  }

  // ------------------------------------------------------------------------------------------------------------- rail

  loadRail(): void {
    if (this.railTimer) { clearTimeout(this.railTimer); this.railTimer = null; }
    this.railLoad?.unsubscribe();
    this.railState.start();
    this.railLoad = this.api.list(this.railView(), this.railQuery()).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.railState.fail(r, 'The recordings could not be read.'); return; }
        this.rail.set(r.data.rows ?? []);
        this.railFailed.set(r.data.failedCount ?? 0);
        this.railTotal.set(r.data.total ?? this.rail().length);
        this.railState.done();
        this.pollActives();
        if (this.rail().some(isActive)) this.railTimer = setTimeout(() => this.loadRail(), RAIL_POLL_MS);
      },
      error: err => this.railState.fail(err, 'The recordings could not be read.'),
    });
  }

  /** The reader's own recordings in progress, read in full for their stages and partial text (the New view's cards). */
  private pollActives(): void {
    if (this.chosenId() != null) return;
    for (const r of this.myActive().slice(0, 3)) {
      this.api.one(r.recordingId).subscribe({
        next: x => { if (x.status === API_SUCCESS && x.data) this.activeDetails.update(m => ({ ...m, [r.recordingId]: x.data! })); },
      });
    }
  }

  setRailView(view: RailView): void { this.railView.set(view); this.loadRail(); }

  setRailQuery(value: string): void {
    this.railQuery.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadRail(), 300);
  }

  railLine(r: RecordingSummary): string {
    const by = r.createdBy != null && r.createdBy === this.me() ? 'You' : (r.createdByName || '—');
    const at = instantOf(r.createdAt ?? '');
    return railNote(r, by, at ? this.when.transform(at, 'recent') ?? '' : '', this.limits());
  }

  /** "uploaded 2 Nov, 09:02" (and by whom, when it is someone else). */
  uploadedLine(r: RecordingSummary): string {
    const at = instantOf(r.createdAt ?? '');
    const mine = r.createdBy == null || r.createdBy === this.me();
    return `uploaded${at ? ' ' + this.when.transform(at, 'recent') : ''}${mine ? '' : ' by ' + (r.createdByName || 'someone else')}`;
  }

  byLine(r: RecordingSummary): string {
    const by = r.createdBy != null && r.createdBy === this.me() ? 'You' : (r.createdByName || '—');
    const at = instantOf(r.createdAt ?? '');
    return at ? `${by} · ${this.when.transform(at, 'recent')}` : by;
  }

  choose(id: number | null): void {
    void this.router?.navigate([], { relativeTo: this.route ?? undefined, queryParams: id ? { id } : { new: 1 } });
    if (!this.router) this.open(id);
  }

  onRailPick(value: string): void {
    this.choose(value === 'new' ? null : Number(value));
  }

  // ------------------------------------------------------------------------------------------------------- a recording

  private open(id: number | null): void {
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    this.detailLoad?.unsubscribe();
    this.pause();
    const url = this.audioUrl();
    if (url) { URL.revokeObjectURL(url); this.audioUrl.set(null); }
    this.audioLoading.set(false);
    this.audioError.set('');
    this.current.set(0);
    this.query.set('');
    this.editing.set(false);
    this.hidden.set(new Set());
    this.chosenId.set(id);
    this.detail.set(null);
    if (id == null) { this.pollActives(); return; }
    this.load(id);
  }

  private load(id: number): void {
    if (!this.detail()) this.detailState.start();
    this.detailLoad = this.api.one(id).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.detailState.fail(r, 'This recording could not be read.'); return; }
        const was = this.detail();
        this.detail.set(r.data);
        this.detailState.done();
        if (isActive(r.data)) this.pollTimer = setTimeout(() => this.load(id), POLL_MS);
        else {
          if (was && isActive(was)) this.loadRail();
          if (r.data.status === 'DONE' && r.data.recordingKept && !this.audioUrl()) this.loadAudio(id);
        }
      },
      error: err => this.detailState.fail(err, 'This recording could not be read.'),
    });
  }

  reload(): void {
    const id = this.chosenId();
    if (id) this.load(id);
  }

  private loadAudio(id: number): void {
    this.audioLoading.set(true);
    this.api.audio(id).subscribe({
      next: blob => { this.audioLoading.set(false); if (this.chosenId() === id) this.audioUrl.set(URL.createObjectURL(blob)); },
      error: () => { this.audioLoading.set(false); this.audioError.set('The recording could not be loaded for playback. The transcript is all here.'); },
    });
  }

  onCreated(made: RecordingDetail[]): void {
    this.rejects.set([]);
    this.toast.success(made.length === 1 ? `${made[0].name} is being transcribed; you can leave this page.`
      : `${made.length} recordings are being transcribed; you can leave this page.`);
    this.loadRail();
    if (made.length === 1) this.choose(made[0].recordingId);
  }

  onRejected(advice: Advice): void {
    this.rejects.update(list => [advice, ...list].slice(0, 5));
  }

  async stop(r: RecordingSummary): Promise<void> {
    const ok = await confirmWith(this.dialog, { title: 'Stop transcribing', body: `${r.name} stops now. Nothing is billed for it.`,
      confirmLabel: 'Stop', danger: true });
    if (!ok) return;
    this.api.stop(r.recordingId).subscribe({
      next: x => { if (x.status !== API_SUCCESS) this.toast.error(x.message || 'It could not be stopped.'); this.loadRail(); this.reload(); },
      error: err => this.toast.error(err?.error?.message || 'It could not be stopped.'),
    });
  }

  act(r: RecordingSummary, advice: Advice): void {
    if (advice.action === 'split') {
      this.api.split(r.recordingId).subscribe({
        next: x => {
          if (x.status !== API_SUCCESS || !x.data) { this.toast.error(x.message || 'It could not be split.'); return; }
          this.toast.success(`Split into ${x.data.parts.length} parts; each is transcribed by itself.`);
          this.loadRail();
          if (x.data.parts[0]) this.choose(x.data.parts[0].recordingId);
        },
        error: err => this.toast.error(err?.error?.message || 'It could not be split.'),
      });
    } else if (advice.action === 'retry') {
      this.api.retry(r.recordingId).subscribe({
        next: x => { if (x.status !== API_SUCCESS) this.toast.error(x.message || 'It could not be started again.'); this.loadRail(); this.reload(); },
        error: err => this.toast.error(err?.error?.message || 'It could not be started again.'),
      });
    } else if (advice.action === 'choose') {
      this.choose(null);
    } else if (advice.action === 'converter') {
      void this.router?.navigate(['/tools/converter']);
    }
  }

  async remove(r: RecordingSummary): Promise<void> {
    const ok = await confirmWith(this.dialog, { title: 'Delete recording', confirmLabel: 'Delete', danger: true,
      body: `${r.name}, its transcript and its recording are removed. This cannot be undone.` });
    if (!ok) return;
    this.api.remove(r.recordingId).subscribe({
      next: x => {
        if (x.status !== API_SUCCESS) { this.toast.error(x.message || 'It could not be deleted.'); return; }
        this.toast.success(`${r.name} deleted.`);
        this.loadRail();
        if (this.chosenId() === r.recordingId) this.choose(null);
      },
      error: err => this.toast.error(err?.error?.message || 'It could not be deleted.'),
    });
  }

  // ------------------------------------------------------------------------------------------------------------ player

  toggle(): void {
    const el = this.audioEl()?.nativeElement;
    if (!el || !this.audioUrl()) return;
    if (el.paused) void el.play(); else el.pause();
  }

  private pause(): void {
    this.audioEl()?.nativeElement.pause();
  }

  /** Seconds into the recording (a part's own seconds; the file plays from its offset). */
  seekTo(seconds: number): void {
    const el = this.audioEl()?.nativeElement;
    const t = Math.max(0, Math.min(this.duration() || seconds, seconds));
    this.current.set(t);
    if (el) el.currentTime = this.offset() + t;
  }

  skip(by: number): void { this.seekTo(this.current() + by); }

  seekFraction(f: number): void { this.seekTo(f * this.duration()); }

  playFrom(s: Segment): void {
    this.seekTo(s.startMs / 1000);
    const el = this.audioEl()?.nativeElement;
    if (el && el.paused && this.audioUrl()) void el.play();
  }

  setRate(rate: number): void {
    this.rate.set(rate);
    const el = this.audioEl()?.nativeElement;
    if (el) el.playbackRate = rate;
  }

  onTime(): void {
    const el = this.audioEl()?.nativeElement;
    if (!el) return;
    const t = el.currentTime - this.offset();
    if (this.duration() && t >= this.duration()) el.pause();
    this.current.set(Math.max(0, t));
  }

  onLoaded(): void {
    const el = this.audioEl()?.nativeElement;
    if (!el) return;
    el.playbackRate = this.rate();
    if (this.offset()) el.currentTime = this.offset();
  }

  /** Space plays, J and L go back and forward 5 seconds, / searches -- unless the reader is typing. */
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (!this.detail() || this.detail()!.status !== 'DONE') return;
    const target = event.target as HTMLElement | null;
    if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || target.getAttribute('role') === 'slider')) return;
    if (event.key === ' ' && !target?.closest('button, a')) { event.preventDefault(); this.toggle(); }
    else if (event.key === 'j' || event.key === 'J') this.skip(-5);
    else if (event.key === 'l' || event.key === 'L') this.skip(5);
    else if (event.key === '/') { event.preventDefault(); this.searchBox()?.nativeElement.focus(); }
  }

  // ------------------------------------------------------------------------------------------------------------ search

  setQuery(value: string): void {
    this.query.set(value);
    this.hitAt.set(0);
    this.goToHit(0, false);
  }

  goToHit(i: number, seek = true): void {
    const hits = this.hits();
    if (!hits.length) return;
    const at = (i + hits.length) % hits.length;
    this.hitAt.set(at);
    const segment = this.segments()[hits[at].segment];
    if (seek) this.seekTo(segment.startMs / 1000);
    document.querySelector(`[data-seg="${hits[at].segment}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  parts(s: Segment, index: number) {
    return markParts(s.text, this.hits(), index, this.hits());
  }

  toggleSpeaker(key: number): void {
    this.hidden.update(set => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  // ---------------------------------------------------------------------------------------------------- corrections

  startEditing(): void {
    this.drafts.set(Object.fromEntries(this.segments().map(s => [s.i, s.text])));
    this.editing.set(true);
  }

  draft(i: number, text: string): void {
    this.drafts.update(d => ({ ...d, [i]: text }));
  }

  saveEdits(): void {
    const d = this.detail();
    if (!d) return;
    const changed = this.segments().filter(s => (this.drafts()[s.i] ?? s.text).trim() !== s.text).map(s => ({ i: s.i, text: this.drafts()[s.i].trim() }));
    if (!changed.length) { this.editing.set(false); return; }
    this.change({ segments: changed }, `${changed.length} ${changed.length === 1 ? 'correction' : 'corrections'} kept as a new version; the original stays.`,
      () => this.editing.set(false));
  }

  private change(change: Parameters<TranscriptApi['change']>[1], done: string, then?: () => void): void {
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
        if (change.name || change.speakers || change.merge) this.loadRail();
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

  rename(name: string): void {
    const d = this.detail();
    if (!d || !name.trim() || name.trim() === d.name) return;
    this.change({ name: name.trim() }, '');
  }

  // -------------------------------------------------------------------------------------------------------------- use

  download(format: ExportFormat): void {
    const d = this.detail();
    if (!d) return;
    this.api.exportFile(d.recordingId, format, !!d.maskExports).subscribe({
      next: blob => saveBlob(blob, exportName(d.name, format)),
      error: () => this.toast.error('The transcript could not be downloaded.'),
    });
  }

  async sendToDocuments(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const ok = await confirmWith(this.dialog, { title: 'Send to Documents as a visit note', confirmLabel: 'Send',
      body: `${d.name} goes to Documents as a printable transcript${d.maskExports ? ' with personal details masked' : ''}: it is read, given a document type and put in the review queue.` });
    if (!ok) return;
    this.api.sendToDocuments(d.recordingId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be sent to Documents.'); return; }
        this.detail.set(r.data.recording);
        const intake = r.data.intake;
        if (intake.outcome === 'Refused') this.toast.error(intake.reason || 'Documents refused it.');
        else this.toast.success(intake.outcome === 'Duplicate' ? `Documents already has it (document ${intake.ocrDocumentId}).`
          : `Sent to Documents as document ${intake.ocrDocumentId}; it appears under Documents in once it is read.`);
      },
      error: err => this.toast.error(err?.error?.message || 'It could not be sent to Documents.'),
    });
  }

  startPipeline(): void {
    const d = this.detail();
    if (!d) return;
    this.dialog.open<KeepChoice | undefined>(KeepDialog, { data: {
      heading: 'Keep the transcript in a bucket', confirmLabel: 'Keep and continue', folder: monthFolder('transcripts'),
      subtitle: 'A pipeline reads its files from a bucket. The transcript is saved there as text with speakers and times, then you describe the pipeline to the AI Assistant.',
    } satisfies KeepDialogData }).closed.subscribe(choice => {
      if (!choice) return;
      this.api.keep(d.recordingId, choice.bucket, choice.folder, 'txt').subscribe({
        next: r => {
          if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be kept.'); return; }
          void this.router?.navigate(['/ai/assistant'], { queryParams: { prompt: `Build a pipeline that reads the transcript ${r.data.bucket}/${r.data.key} and ` } });
        },
        error: err => this.toast.error(err?.error?.message || 'It could not be kept.'),
      });
    });
  }

  async copy(): Promise<void> {
    const ok = await copyText(this.plain());
    if (ok) this.toast.success('The transcript is copied.'); else this.toast.error('The transcript could not be copied.');
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

  activeDetail(r: RecordingSummary): RecordingDetail {
    return this.activeDetails()[r.recordingId] ?? (r as RecordingDetail);
  }

  stagesFor(d: RecordingDetail) { return stagesOf(d); }

  speakerTone(key: number | null | undefined): string {
    return key == null ? '' : `spk-${key % 6}`;
  }

  hiddenHas(key: number): boolean { return this.hidden().has(key); }

  adviceOf(r: RecordingSummary): Advice | null { return adviceFor(r, this.limits()); }

  readonly formats = computed(() => formatsText(this.limits()));

  /** "English" for "en"; the code itself when the browser cannot name it. */
  languageLabel(code: string): string {
    try {
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
    } catch {
      return code;
    }
  }

  /** "Whisper small, on this platform" for whisper-small. */
  modelLabel(model: string | null | undefined): string {
    if (!model) return '—';
    const words = model.replace(/-/g, ' ');
    return `${words[0].toUpperCase()}${words.slice(1)}, on this platform`;
  }
}
