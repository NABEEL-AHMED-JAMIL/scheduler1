import { Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { TabCounts } from '../../../core/nav/tab-counts';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { Segmented } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { AppLoading, InlineStatus, createLoadState } from '../../../shared/ui/loading';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { DAY_OPTIONS, ToolDays, languageName, rangeText } from '../tools-shared';
import { FacetGroup, FacetPicks, ToolsFacets, facetOptions, togglePick } from '../tools-facets';
import { TranscriptApi } from './transcript.api';
import { RecordingPanel } from './recording-panel';
import { TranscribeSheet, TranscribeSheetData } from './transcribe-sheet';
import {
  BY_WORDS, DEFAULT_TRANSCRIPT_LIMITS, RecordingDetail, RecordingFacets, RecordingSummary, SPEAKER_WORDS, STATUS_WORDS,
  TranscriptLimits, clock, isActive, listPill, statusPill,
} from './transcript.model';

const POLL_MS = 5000;
const PAGE_SIZE = 25;

/**
 * Audio Transcript's list (tools Option A, owner 2026-11-02; design transcript-a.html), as the Report library: facets with
 * counts (Status, Made by, Speakers, Language), a search of names and what was said, 7 / 30 / 90 days or all time, and the
 * recordings -- length, speakers as coloured dots, status (with its progress), by, made. A row opens the side panel;
 * Transcribe recordings (or recordings dropped anywhere on the page) opens the new transcript over it.
 */
@Component({
  selector: 'app-transcript-list',
  imports: [PageHeader, Icon, Segmented, ServerTimePipe, AppLoading, InlineStatus, ToolsFacets, RecordingPanel],
  templateUrl: './transcript-list.html',
  styleUrls: ['../tools-explorer.css', './transcript-shared.css'],
  styles: `
    .tl-dots { display: inline-flex; align-items: center; gap: 0.25rem; }
    .tl-file { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); }
    .tl-drop { outline: 2px dashed var(--color-info-600); outline-offset: 4px; }
    .tl-c-len { width: 4.75rem; }
    .tl-c-spk { width: 6.5rem; }
    .tl-c-st { width: 8rem; }
    .tl-c-by { width: 8rem; }
    .tl-c-made { width: 7.5rem; }
    .tl-note { margin: 0; padding: 0 0.875rem 0.75rem; font-size: 0.75rem; color: var(--text-muted); }
    @media (max-width: 1179px) { .tl-c-by { display: none; } }
  `,
})
export class TranscriptList implements OnInit {
  private readonly api = inject(TranscriptApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly tabCounts = inject(TabCounts, { optional: true });

  /** ?new=1: the new transcript is open over the list. */
  readonly openNew = input(false);

  readonly ownSignIn = isOwnPlatformSignIn(this.auth);
  readonly me = computed(() => (typeof this.auth?.user === 'function' ? this.auth.user()?.appUserId : null) ?? null);
  readonly canSend = computed(() => !!this.auth?.canOpen?.('document-intelligence'));
  readonly limits = signal<TranscriptLimits>(DEFAULT_TRANSCRIPT_LIMITS);

  readonly dayOptions = DAY_OPTIONS;
  readonly days = signal<ToolDays>('30');
  readonly query = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(PAGE_SIZE);
  readonly picks = signal<FacetPicks>({});
  readonly rows = signal<RecordingSummary[]>([]);
  readonly total = signal(0);
  readonly all = signal(0);
  readonly counts = signal<RecordingFacets>({});
  readonly listState = createLoadState();
  readonly facetsOpen = signal(false);
  readonly dragging = signal(false);
  readonly selected = signal<RecordingSummary | null>(null);
  private listLoad: Subscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private sheet: DialogRef<RecordingDetail[] | undefined, TranscribeSheet> | null = null;

  readonly groups = computed<FacetGroup[]>(() => {
    const c = this.counts(), p = this.picks();
    return [
      { key: 'status', title: 'Status', options: facetOptions(c.status, STATUS_WORDS, p['status'] ?? [], ['done', 'transcribing', 'failed']) },
      { key: 'by', title: 'Made by', options: facetOptions(c.by, BY_WORDS, p['by'] ?? [], ['me', 'others']) },
      { key: 'speakers', title: 'Speakers', options: facetOptions(c.speakers, SPEAKER_WORDS, p['speakers'] ?? [], ['one', 'two', 'many']) },
      { key: 'language', title: 'Language', options: facetOptions(c.language, {}, p['language'] ?? [], [], languageName) },
    ];
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly footText = computed(() => this.pages() > 1 ? `${rangeText(this.page(), this.pageSize(), this.total())} recordings`
    : `${this.total()} ${this.total() === 1 ? 'recording' : 'recordings'}`);
  readonly filtered = computed(() => !!this.query().trim() || Object.values(this.picks()).some(v => v.length));

  readonly clock = clock;
  readonly listPill = listPill;
  readonly statusPill = statusPill;

  constructor() {
    effect(() => {
      const open = this.openNew();
      untracked(() => { if (open) this.openSheet(); else this.sheet?.close(); });
    });
    inject(DestroyRef).onDestroy(() => {
      [this.timer, this.searchTimer].forEach(t => t && clearTimeout(t));
      this.listLoad?.unsubscribe();
      this.sheet?.close();
    });
  }

  ngOnInit(): void {
    this.api.limits().subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data && Array.isArray(r.data.formats)) this.limits.set({ ...DEFAULT_TRANSCRIPT_LIMITS, ...r.data }); },
      error: () => this.limits.set(DEFAULT_TRANSCRIPT_LIMITS),
    });
    this.load();
  }

  load(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.listLoad?.unsubscribe();
    this.listState.start();
    const p = this.picks();
    this.listLoad = this.api.list({ days: Number(this.days()), q: this.query(), page: this.page(), size: this.pageSize(),
      status: p['status'] ?? [], by: p['by'] ?? [], speakers: p['speakers'] ?? [], language: p['language'] ?? [] }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.listState.fail(r, 'The recordings could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.total.set(r.data.total ?? this.rows().length);
        this.all.set(r.data.all ?? r.data.total ?? 0);
        this.counts.set(r.data.facets ?? {});
        this.tabCounts?.set({ '/tools/transcript': this.all() });
        const open = this.selected();
        const fresh = open ? this.rows().find(x => x.recordingId === open.recordingId) : null;
        if (fresh) this.selected.set(fresh);
        this.listState.done();
        if (this.rows().some(isActive)) this.timer = setTimeout(() => this.load(), POLL_MS);
      },
      error: err => this.listState.fail(err, 'The recordings could not be read.'),
    });
  }

  setDays(days: ToolDays): void { this.days.set(days); this.page.set(1); this.load(); }
  goTo(page: number): void { this.page.set(Math.min(this.pages(), Math.max(1, page))); this.load(); }

  toggleFacet(change: { key: string; value: string }): void {
    this.picks.set(togglePick(this.picks(), change.key, change.value));
    this.page.set(1);
    this.load();
  }

  clearFilters(): void {
    this.picks.set({});
    this.query.set('');
    this.page.set(1);
    this.load();
  }

  setQuery(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.page.set(1); this.load(); }, 300);
  }

  select(r: RecordingSummary): void {
    this.selected.set(this.selected()?.recordingId === r.recordingId ? null : r);
  }

  openKey(event: KeyboardEvent): boolean {
    if (event.key !== 'Enter' && event.key !== ' ') return false;
    event.preventDefault();
    return true;
  }

  byText(r: RecordingSummary): string {
    if (r.createdBy != null && r.createdBy === this.me()) return 'You';
    return r.createdByName || '—';
  }

  /** The speaker dots of a row: one per speaker told (at most six), none before it is done. */
  dotsOf(r: RecordingSummary): number[] {
    if (r.status !== 'DONE') return [];
    return Array.from({ length: Math.min(6, Math.max(1, r.speakerCount ?? 1)) }, (_, i) => i);
  }

  // ------------------------------------------------------------------------------------------------ transcribe recordings

  /** Transcribe recordings: ?new=1, so a reload or a link opens it too. */
  askNew(): void {
    if (this.router) void this.router.navigate([], { relativeTo: this.route ?? undefined, queryParams: { new: 1 } });
    else this.openSheet();
  }

  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  /** Recordings dropped anywhere on the page: the new transcript opens with them. */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) this.openSheet(files);
  }

  openSheet(files: File[] = []): void {
    if (this.sheet) {
      if (files.length) void this.sheet.componentInstance?.form()?.add(files);
      return;
    }
    const data: TranscribeSheetData = { limits: this.limits(), canSend: this.canSend(), bucketAllowed: !this.ownSignIn, files };
    const ref = this.dialog.open<RecordingDetail[] | undefined, TranscribeSheetData, TranscribeSheet>(TranscribeSheet, sidePanelConfig(data, 'wide', 'right'));
    this.sheet = ref;
    ref.closed.subscribe(made => {
      this.sheet = null;
      if (this.openNew() && this.router) void this.router.navigate([], { relativeTo: this.route ?? undefined, queryParams: {}, replaceUrl: true });
      if (made?.length) this.onCreated(made);
    });
  }

  onCreated(made: RecordingDetail[]): void {
    this.toast.success(made.length === 1 ? `${made[0].name} is being transcribed; you can leave this page.`
      : `${made.length} recordings are being transcribed; you can leave this page.`);
    if (made.length === 1) this.selected.set(made[0]);
    this.load();
  }
}
