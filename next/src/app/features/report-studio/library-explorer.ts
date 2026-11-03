import { Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, catchError, concatMap, from, map, of, toArray } from 'rxjs';
import { Icon } from '../../shared/ui/icon';
import { RsTimePipe } from './rs-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { AuthService } from '../../core/auth/auth.service';
import { DateRange, DateRangePicker, rangeKey, restoreRange } from '../../shared/ui/date-range';
import { Pagination } from '../../shared/ui/pagination';
import { PAGE_SIZES } from '../../shared/ui/pager';
import { ReportStudioApi, studioError } from './report-studio.api';
import { REPORT_DELETE_WORDS, ReportDetail, ReportVersionRow, deletedWords } from './report-studio.model';
import {
  BrowseQuery, FacetValue, HistogramDay, LibraryBrowse, LibraryRow, MADE_BY_WORDS, Meaning, ReportLibraryApi, ReportState, STATE_WORDS, stateChip,
  stateTone,
} from './report-library.api';
import { saveBlob } from './report-files';
import { zipStore } from './zip-store';
import { LibraryHistogram } from './library-histogram';
import { plainHint } from '../../shared/ui/plain-words';

type Facet = 'state' | 'templateId' | 'category' | 'madeBy' | 'approver';
type PanelTab = 'preview' | 'approval' | 'versions' | 'activity';

/** At most this many reports go in one ZIP or one bulk approval (the service's own cap for approvals). */
export const BULK_MAX = 50;

/** The histogram's bars: one per day of the range, each stacked by state in the facets' order. */
export function bars(days: HistogramDay[], from: string | null, to: string | null): { day: string; parts: { state: ReportState; n: number }[]; total: number }[] {
  const byDay = new Map(days.map(d => [d.day, d]));
  const out: { day: string; parts: { state: ReportState; n: number }[]; total: number }[] = [];
  const first = from ?? days[0]?.day;
  const last = to ?? days[days.length - 1]?.day;
  if (!first || !last) return out;
  const states: ReportState[] = ['APPROVED', 'WAITING', 'READY', 'PENDING', 'FAILED', 'VOID'];
  for (let d = new Date(first + 'T12:00:00'); d <= new Date(last + 'T12:00:00') && out.length < 400; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const h = byDay.get(key);
    const parts = states.map(s => ({ state: s, n: Number(h?.[s] ?? 0) })).filter(p => p.n > 0);
    out.push({ day: key, parts, total: parts.reduce((n, p) => n + p.n, 0) });
  }
  return out;
}

/** A report's name already says its template ("Patient intake · S-1151" from "Patient intake"): don't repeat it. */
export function namesTemplate(name: string, template: string): boolean {
  const a = name.trim().toLowerCase();
  const b = template.trim().toLowerCase();
  if (!b) return true;
  if (a.startsWith(b)) return true;
  // "Patient intake · S-1151" from "Patient intake summary": the name's lead before its first separator starts the template.
  const lead = a.split(/\s+[·\-–—|:]\s+/)[0];
  return lead.length >= 4 && b.startsWith(lead);
}

/**
 * The report library as an explorer (reports redesign, owner 2026-11-02; design library.html, the owner's Datadog-style
 * references): facets with counts on the left (state, template, category, who made it, approver, the hidden test reports),
 * the reports a day by state over the date range, a dense one-line list with bulk Approve and sign, Download as ZIP,
 * Archive and Delete, and a side panel with the report itself -- its pages, approval, versions and activity -- so the list
 * stays where it is. One answer from the service (reportLibrary.json/browse) holds the page, the counts and the bars.
 */
@Component({
  selector: 'app-library-explorer',
  imports: [Icon, RsTimePipe, RouterLink, DateRangePicker, Pagination, LibraryHistogram],
  templateUrl: './library-explorer.html',
  styleUrl: './library-explorer.css',
})
export class LibraryExplorer implements OnInit {
  readonly tenantId = input<number | null>(null);
  /** The Reports / Generation jobs switch lives in the page's header; the explorer shows the reports. */
  private readonly api = inject(ReportStudioApi);
  private readonly lib = inject(ReportLibraryApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly stateWords = STATE_WORDS;
  readonly madeByWords = MADE_BY_WORDS;
  readonly stateChip = stateChip;
  readonly stateTone = stateTone;
  stateWord(v: string): string { return STATE_WORDS[v as ReportState] ?? v; }
  madeByWord(v: string): string { return MADE_BY_WORDS[v as keyof typeof MADE_BY_WORDS] ?? v; }

  readonly data = signal<LibraryBrowse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly q = signal('');
  readonly filters = signal<Record<Facet, string[]>>({ state: [], templateId: [], category: [], madeBy: [], approver: [] });
  readonly tests = signal(false);
  readonly rangeStore = rangeKey('report-library', this.auth.user()?.appUserId);
  readonly range = signal<DateRange>(restoreRange(this.rangeStore, '30d'));
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);
  readonly sort = signal<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  /** Facets open beside the list on a wide screen; behind "Filters" on a narrower one. */
  readonly facetsOpen = signal(false);
  readonly templatesAll = signal(false);
  readonly picked = signal<ReadonlySet<string>>(new Set());
  readonly busy = signal('');
  /** The report open in the side panel. */
  readonly selected = signal<LibraryRow | null>(null);
  readonly detail = signal<ReportDetail | null>(null);
  readonly detailError = signal('');
  readonly panelTab = signal<PanelTab>('preview');
  readonly panelPage = signal(1);
  readonly pageImage = signal<string | null>(null);
  readonly pageError = signal('');
  readonly meanings = signal<Meaning[]>([]);
  readonly bulkMeaning = signal<string | null>(null);
  private asked = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly canApprove = computed(() => this.auth.canOpen('report-approve') && !this.auth.isPlatformAdmin());
  readonly me = computed(() => this.auth.user()?.appUserId ?? null);
  readonly rows = computed(() => this.data()?.reports ?? []);
  readonly total = computed(() => this.data()?.total ?? 0);
  readonly facets = computed(() => this.data()?.facets ?? null);
  readonly anyFilter = computed(() => !!this.q().trim() || Object.values(this.filters()).some(v => v.length) || this.tests());
  readonly bars = computed(() => bars(this.data()?.histogram.days ?? [], this.range().preset === 'all' ? null : this.range().from,
    this.range().preset === 'all' ? null : this.range().to));
  readonly pickedRows = computed(() => this.rows().filter(r => this.picked().has(r.reportId)));
  /** Of the picked, those this person may approve now: waiting or ready, not theirs, not asked by them. */
  readonly approvable = computed(() => this.pickedRows().filter(r => this.mayApprove(r)));
  readonly deletable = computed(() => this.pickedRows().filter(r => r.state !== 'APPROVED'));
  readonly allPicked = computed(() => this.rows().length > 0 && this.rows().every(r => this.picked().has(r.reportId)));
  readonly stateFacets = computed(() => this.order(this.facets()?.state ?? [], ['READY', 'WAITING', 'APPROVED', 'FAILED', 'VOID', 'PENDING'])
    .filter(f => f.value !== 'PENDING' || f.count > 0));
  readonly templateFacets = computed(() => {
    const all = this.facets()?.template ?? [];
    return this.templatesAll() ? all : all.slice(0, 5);
  });
  /** One template picked: its column only repeats it, so it gives the report's name the room. */
  readonly oneTemplate = computed(() => this.filters().templateId.length === 1);

  readonly current = computed(() => {
    const d = this.detail();
    return d?.versions.find(v => v.version === d.currentVersion) ?? null;
  });

  constructor() {
    // A link may open the library filtered: ?approver=me (the overview's "are yours"), ?state=WAITING, ?tests=1.
    const qp = this.route.snapshot?.queryParamMap;
    if (qp) {
      const f = { ...this.filters() };
      for (const k of ['state', 'templateId', 'category', 'madeBy', 'approver'] as Facet[]) {
        const v = qp.get(k);
        if (v) f[k] = v.split(',').filter(Boolean);
      }
      this.filters.set(f);
      if (qp.get('tests') === '1') this.tests.set(true);
    }
    effect(() => {
      // Another workspace picked: start again from the first page, nothing picked or open.
      this.tenantId();
      untracked(() => { this.page.set(1); this.picked.set(new Set()); this.close(); this.read(); });
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      const img = this.pageImage();
      if (img) URL.revokeObjectURL(img);
    });
  }

  ngOnInit(): void {
    if (this.canApprove()) this.lib.meanings().subscribe({ next: m => this.meanings.set(m.meanings), error: () => { /* defaults apply */ } });
  }

  private order(values: FacetValue[], order: string[]): FacetValue[] {
    const by = new Map(values.map(v => [v.value, v]));
    return order.map(k => by.get(k) ?? { value: k, count: 0 });
  }

  query(): BrowseQuery {
    const f = this.filters();
    const r = this.range();
    const s = this.sort();
    return { q: this.q(), state: f.state, templateId: f.templateId, category: f.category, madeBy: f.madeBy, approver: f.approver,
      tests: this.tests(), from: r.preset === 'all' ? null : r.from, to: r.preset === 'all' ? null : r.to,
      ...(s ? { sort: s.key, dir: s.dir } : {}), limit: this.size(), offset: (this.page() - 1) * this.size() };
  }

  read(quiet = false): void {
    if (!quiet) this.loading.set(true);
    this.error.set('');
    const asked = ++this.asked;
    this.lib.browse(this.query(), this.tenantId()).subscribe({
      next: d => {
        if (asked !== this.asked) return;
        this.data.set(d);
        this.loading.set(false);
        // A page emptied under the reader goes back to the last page that has rows.
        if (!d.reports.length && d.total && this.page() > 1) { this.page.set(Math.ceil(d.total / this.size())); this.read(); }
        const kept = new Set(d.reports.map(r => r.reportId));
        this.picked.set(new Set([...this.picked()].filter(id => kept.has(id))));
      },
      error: e => { if (asked !== this.asked) return; this.error.set(studioError(e, 'The reports could not be read.').message); this.loading.set(false); },
    });
  }

  isOn(facet: Facet, value: string): boolean {
    return this.filters()[facet].includes(value);
  }

  toggle(facet: Facet, value: string): void {
    const f = { ...this.filters() };
    f[facet] = f[facet].includes(value) ? f[facet].filter(v => v !== value) : [...f[facet], value];
    this.filters.set(f);
    this.page.set(1);
    this.read();
  }

  clearFilters(): void {
    this.filters.set({ state: [], templateId: [], category: [], madeBy: [], approver: [] });
    this.q.set('');
    this.tests.set(false);
    this.page.set(1);
    this.read();
  }

  /** The chips above the list: each filter on, with its words. */
  readonly chips = computed(() => {
    const f = this.filters();
    const fx = this.facets();
    const label = (facet: Facet, v: string) => {
      switch (facet) {
        case 'state': return STATE_WORDS[v as ReportState] ?? v;
        case 'madeBy': return MADE_BY_WORDS[v as keyof typeof MADE_BY_WORDS] ?? v;
        case 'templateId': return fx?.template.find(t => t.value === v)?.label ?? 'a template';
        case 'approver': return v === 'me' ? 'Waiting for me' : fx?.approver.find(a => a.value === v)?.label ?? 'an approver';
        default: return v || 'No category';
      }
    };
    const names: Record<Facet, string> = { state: 'Status', templateId: 'Template', category: 'Category', madeBy: 'Made by', approver: 'Approver' };
    return (Object.keys(f) as Facet[]).flatMap(k => f[k].map(v => ({ facet: k, value: v, name: names[k], label: label(k, v) })));
  });

  setTests(on: boolean): void {
    this.tests.set(on);
    this.page.set(1);
    this.read();
  }

  onSearch(value: string): void {
    this.q.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.page.set(1); this.read(); }, 300);
  }

  applyRange(r: DateRange): void {
    this.range.set(r);
    this.page.set(1);
    this.read();
  }

  sortBy(key: string): void {
    const s = this.sort();
    this.sort.set(!s || s.key !== key ? { key, dir: key === 'madeAt' ? 'desc' : 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null);
    this.page.set(1);
    this.read();
  }

  sortMark(key: string): 'ascending' | 'descending' | 'none' {
    const s = this.sort();
    return s?.key === key ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  goTo(p: number): void { this.page.set(p); this.read(); }
  setSize(n: number): void { this.size.set(n); this.page.set(1); this.read(); }

  // ------------------------------------------------------------------ picking and bulk actions

  isPicked(r: LibraryRow): boolean { return this.picked().has(r.reportId); }

  clearPicked(): void { this.picked.set(new Set()); }

  togglePick(r: LibraryRow): void {
    const next = new Set(this.picked());
    if (next.has(r.reportId)) next.delete(r.reportId); else if (next.size < BULK_MAX) next.add(r.reportId);
    this.picked.set(next);
  }

  togglePage(on: boolean): void {
    this.picked.set(on ? new Set(this.rows().slice(0, BULK_MAX).map(r => r.reportId)) : new Set());
  }

  /** Whether this person may approve a row's current version: not theirs, not asked by them, not given the first approval. */
  mayApprove(r: LibraryRow): boolean {
    return this.canApprove() && (r.state === 'READY' || r.state === 'WAITING') && r.createdBy !== this.me() && r.firstApprovedBy !== this.me()
      && !!r.currentVersion && (r.state !== 'WAITING' || r.waitingForMe || !r.firstApprovedBy);
  }

  async approvePicked(): Promise<void> {
    const rows = this.approvable();
    if (!rows.length) return;
    const meaning = this.meanings().find(m => m.code === this.bulkMeaning())?.words;
    const skipped = this.pickedRows().length - rows.length;
    const ok = await confirmWith(this.dialog, {
      title: `Approve and sign ${rows.length} report${rows.length === 1 ? '' : 's'}?`, confirmLabel: `Approve and sign ${rows.length}`,
      body: `${meaning ? `Your approvals say: “${meaning}”. ` : 'Each approval states its step\'s meaning (review first, release last). '}`
        + 'Each current version is approved as on its own page: its PDF is signed in your name where it is the last approval.'
        + (skipped ? ` ${skipped} picked report${skipped === 1 ? ' is' : 's are'} not yours to approve and stay as they are.` : ''),
    });
    if (!ok) return;
    this.busy.set('approve');
    this.lib.approveMany(rows.map(r => ({ reportId: r.reportId, version: r.currentVersion! })), this.bulkMeaning()).subscribe({
      next: a => {
        this.busy.set('');
        if (a.approved) this.toast.success(`${a.approved} report${a.approved === 1 ? '' : 's'} approved${a.results.some(x => x.ok && x.signed) ? ' and signed' : ''}.`);
        const names = new Map(rows.map(r => [r.reportId, r.name]));
        for (const x of a.results.filter(y => !y.ok)) this.toast.error(`${names.get(x.reportId) ?? x.reportId}: ${x.message}`);
        this.picked.set(new Set());
        this.read(true);
        const sel = this.selected();
        if (sel) this.open(sel, this.panelTab());
      },
      error: e => { this.busy.set(''); this.toast.error(studioError(e).message); },
    });
  }

  /** The picked reports' current PDFs (the signed one when signed), each through the reader's own audited download, in one ZIP. */
  zipPicked(): void {
    const rows = this.pickedRows().filter(r => r.currentVersion && r.state !== 'FAILED');
    if (!rows.length) return;
    this.busy.set('zip');
    from(rows).pipe(
      concatMap(r => this.api.download(r.reportId, r.currentVersion!, 'PDF').pipe(
        concatMap(res => from((res.body ?? new Blob()).arrayBuffer()).pipe(map(buf => ({ r, bytes: new Uint8Array(buf), error: '' })))),
        catchError(e => of({ r, bytes: new Uint8Array(), error: studioError(e).message })))),
      toArray(),
    ).subscribe(results => {
      this.busy.set('');
      const got = results.filter(x => !x.error && x.bytes.length);
      for (const f of results.filter(x => x.error)) this.toast.error(`${f.r.name}: ${f.error}`);
      if (!got.length) return;
      const blob = zipStore(got.map(x => ({ name: `${x.r.label} ${x.r.name} v${x.r.currentVersion}${x.r.signed ? ' (signed)' : ''}.pdf`, bytes: x.bytes })));
      saveBlob(blob, `Reports ${new Date().toISOString().slice(0, 10)}.zip`);
      this.toast.success(`${got.length} report${got.length === 1 ? '' : 's'} in the ZIP.`);
    });
  }

  archivePicked(): void {
    const rows = this.pickedRows();
    if (!rows.length) return;
    void confirmWith(this.dialog, { title: `Archive ${rows.length} report${rows.length === 1 ? '' : 's'}?`,
      body: 'They leave the library; their versions and files are kept.', confirmLabel: `Archive ${rows.length}` }).then(ok => {
      if (!ok) return;
      this.each(rows, r => this.api.archiveReport(r.reportId).pipe(map(() => 0)), n => `${n} report${n === 1 ? '' : 's'} archived.`);
    });
  }

  deletePicked(): void {
    const rows = this.deletable();
    if (!rows.length) return;
    void confirmWith(this.dialog, { title: `Delete ${rows.length} report${rows.length === 1 ? '' : 's'}?`, body: REPORT_DELETE_WORDS,
      confirmLabel: `Delete ${rows.length}`, danger: true }).then(ok => {
      if (!ok) return;
      this.each(rows, r => this.api.deleteReport(r.reportId).pipe(map(d => d.filesLeft ?? 0)),
        (n, left) => n === 1 && rows.length === 1 ? deletedWords(rows[0].name, left) : left
          ? `${n} reports deleted. Their ${left} stored files stay in storage until an operator removes them.` : `${n} reports deleted.`);
    });
  }

  /** One at a time, so each refusal is its own; then the same page is read again. */
  private each(rows: LibraryRow[], call: (r: LibraryRow) => Observable<number>, done: (n: number, left: number) => string): void {
    this.busy.set('each');
    from(rows).pipe(
      concatMap(r => call(r).pipe(map(left => ({ r, left, error: '' })), catchError(e => of({ r, left: 0, error: studioError(e).message })))),
      toArray(),
    ).subscribe(results => {
      this.busy.set('');
      const ok = results.filter(x => !x.error);
      if (ok.length) this.toast.success(done(ok.length, ok.reduce((n, x) => n + x.left, 0)));
      for (const f of results.filter(x => x.error)) this.toast.error(`${f.r.name}: ${f.error}`);
      this.picked.set(new Set());
      if (this.selected() && results.some(x => !x.error && x.r.reportId === this.selected()!.reportId)) this.close();
      this.read(true);
    });
  }

  // ------------------------------------------------------------------ the side panel

  open(r: LibraryRow, tab: PanelTab = 'preview'): void {
    this.selected.set(r);
    this.panelTab.set(tab);
    this.detail.set(null);
    this.detailError.set('');
    this.panelPage.set(1);
    this.api.report(r.reportId, this.tenantId()).subscribe({
      next: d => { if (this.selected()?.reportId === r.reportId) this.detail.set(d); },
      error: e => this.detailError.set(studioError(e, 'The report could not be read.').message),
    });
    this.loadPage(r, 1);
  }

  close(): void {
    this.selected.set(null);
    this.detail.set(null);
  }

  /** Arrow keys move the open report up and down the list; Enter opens it; Space picks it. */
  key(ev: KeyboardEvent, r: LibraryRow): void {
    const list = this.rows();
    const i = list.findIndex(x => x.reportId === r.reportId);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const next = list[i + (ev.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        this.open(next, this.panelTab());
        (document.querySelector(`[data-row="${next.reportId}"]`) as HTMLElement | null)?.focus();
      }
    } else if (ev.key === ' ') {
      ev.preventDefault();
      this.togglePick(r);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      this.open(r, this.panelTab());
    }
  }

  loadPage(r: LibraryRow, page: number): void {
    if (!r.currentVersion || r.state === 'FAILED') { this.pageImage.set(null); return; }
    this.pageError.set('');
    this.lib.page(r.reportId, r.currentVersion, page, this.tenantId()).subscribe({
      next: res => {
        if (this.selected()?.reportId !== r.reportId || !res.body || !(res.headers.get('Content-Type') ?? '').includes('png')) return;
        const old = this.pageImage();
        if (old) URL.revokeObjectURL(old);
        this.pageImage.set(URL.createObjectURL(res.body));
        this.panelPage.set(page);
      },
      error: () => this.pageError.set('The page could not be drawn right now.'),
    });
  }

  turn(step: number): void {
    const r = this.selected();
    const pages = r?.pages ?? 1;
    const next = this.panelPage() + step;
    if (r && next >= 1 && next <= pages) this.loadPage(r, next);
  }

  /** What to do next with the open report, in a sentence. */
  nextSteps(r: LibraryRow): string {
    if (r.state === 'FAILED') return r.failReason ? `Generation failed: ${plainHint(r.failReason)}` : 'Its last generation failed; open the report to see why and generate it again.';
    if (r.state === 'PENDING') return 'Its first version is being made.';
    if (r.state === 'VOID') return 'Its current version is VOID. Generate it again to make a correct version.';
    if (r.state === 'APPROVED') return r.signed ? `Approved and signed by ${r.approverName}.` : `Approved by ${r.approverName}.`;
    if (r.state === 'WAITING') {
      if (r.firstApprovedBy) return `${r.firstApproverName} gave the first approval. ${r.waitingForMe ? 'You are the second approver.' : 'A second approver signs it next.'}`;
      return r.waitingForMe ? 'It waits for your approval.' : 'It waits for a reviewer\'s approval.';
    }
    return r.createdBy === this.me() ? 'Ready. You made it; someone else approves it.' : 'Ready, not approved yet.';
  }

  async approveOpen(): Promise<void> {
    const r = this.selected();
    if (!r?.currentVersion) return;
    const meaning = this.meanings().find(m => m.code === this.bulkMeaning())?.words;
    const ok = await confirmWith(this.dialog, { title: `Approve ${r.label} v${r.currentVersion}?`, confirmLabel: 'Approve and sign',
      body: `${meaning ? `Your approval says: “${meaning}”. ` : ''}Its PDF is signed in your name where it is the last approval. Any later change to the file breaks the signature.` });
    if (!ok) return;
    this.busy.set('approve');
    this.api.approve(r.reportId, r.currentVersion, '', null, this.bulkMeaning()).subscribe({
      next: a => {
        this.busy.set('');
        this.toast.success(a.stage === 'FIRST' ? `First approval of v${r.currentVersion} recorded.` : `v${r.currentVersion} approved${a.signed ? ' and signed' : ''}.`);
        this.read(true);
        this.open({ ...r, state: a.stage === 'FIRST' ? 'WAITING' : 'APPROVED' }, 'approval');
      },
      error: e => { this.busy.set(''); this.toast.error(studioError(e).message); },
    });
  }

  versionsOf(d: ReportDetail): ReportVersionRow[] {
    return [...d.versions].sort((a, b) => b.version - a.version);
  }

  /** "9 days ago", for the side panel's line. */
  ago(at: string | null | undefined): string {
    if (!at) return '';
    const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
    return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  }

  namesTemplate(r: LibraryRow): boolean {
    return namesTemplate(r.name, r.templateName);
  }

}
