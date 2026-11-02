import { plainHint } from '../../shared/ui/plain-words';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { RsTimePipe } from './rs-time.pipe';
import { LoadError } from '../../shared/ui/load-error';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { ReportStudioApi, studioError } from './report-studio.api';
import { JobRow, StudioOverview } from './report-studio.model';
import { RsTabCounts } from './rs-tab-counts';
import { AppLoading } from '../../shared/ui/loading';
import { LibraryRow, LibrarySummary, ReportLibraryApi, stateChip, stateTone } from './report-library.api';
import { daysAgo } from './report-stages';

/** Error codes that mean the data does not fit the template: the way out is the field mapping. */
const MAPPING_CODES = new Set(['REQUIRED_FIELD_MISSING', 'BINDING_NOT_RESOLVED', 'DATA_SCHEMA_MISMATCH']);

/** One line of "Needs you": what to do, about what, and the one button that does it. */
export interface NeedItem {
  kind: 'approve' | 'failed' | 'publish' | 'asked';
  title: string;
  detail: string;
  action: string;
  link: (string | number)[];
  query?: Record<string, string>;
  primary: boolean;
}

/** The change against the 30 days before, as the tile words it: "+18% on the 30 days before" (none when there were none). */
export function trendWords(now: number, before: number): string {
  if (!before) return now ? 'none in the 30 days before' : '';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% on the 30 days before`;
}

/** The sparkline's points over w x h for the daily counts (oldest first). */
export function sparkPoints(counts: number[], w = 280, h = 28): string {
  if (!counts.length) return '';
  const max = Math.max(1, ...counts);
  const step = counts.length > 1 ? w / (counts.length - 1) : 0;
  return counts.map((c, i) => `${(i * step).toFixed(1)},${(h - (c / max) * (h - 2) - 1).toFixed(1)}`).join(' ');
}

/** The last {@code days} days, oldest first, as yyyy-mm-dd in the reader's calendar. */
export function lastDays(days: number, today = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

/** The chart's categories, most reports first; at most five named, the rest as "Other". */
export function topCategories(days: ({ day: string } & Record<string, number | string>)[], keep = 5): string[] {
  const totals = new Map<string, number>();
  for (const d of days) for (const [k, v] of Object.entries(d)) if (k !== 'day') totals.set(k, (totals.get(k) ?? 0) + Number(v));
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  return sorted.length > keep ? [...sorted.slice(0, keep), 'Other'] : sorted;
}

/**
 * See results › Reports › Overview (reports redesign, owner 2026-11-02; design overview.html; page report-studio): five
 * figures over 30 days with a trend instead of "this month" (which read 0 on the 2nd), one "Needs you" list -- approvals
 * (yours first), failed generations with what to do, templates to publish -- reports made a day by category, what goes out
 * next, the newest reports as pages, and the most used templates. Test templates and reports are left out everywhere.
 */
@Component({
  selector: 'app-report-overview',
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, RsTimePipe, LoadError, RouterLink, AppLoading],
  templateUrl: './overview.html',
  styleUrl: './overview.css',
})
export class ReportOverview implements OnInit {
  plain(text: string | null | undefined): string { return plainHint(text ?? ''); }
  private readonly api = inject(ReportStudioApi);
  private readonly lib = inject(ReportLibraryApi);
  private readonly auth = inject(AuthService);
  private readonly tabCounts = inject(RsTabCounts);
  private readonly router = inject(Router);
  private readonly workspaces = inject(WorkspaceDirectory);
  /** A platform administrator's pick (the one workspace selector, owner #5); null is every workspace. Members: their own. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());

  readonly data = signal<StudioOverview | null>(null);
  readonly summary = signal<LibrarySummary | null>(null);
  readonly summaryError = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  /** The chart by day or by week. */
  readonly chartBy = signal<'day' | 'week'>('day');
  /** Each recent report's first page (an object URL), by report. */
  readonly thumbs = signal<Record<string, string>>({});
  readonly stateChip = stateChip;
  readonly stateTone = stateTone;

  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly canTemplates = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin());
  readonly canLibrary = computed(() => this.auth.canOpen('report-library'));
  readonly canApprove = computed(() => this.auth.canOpen('report-approve') && !this.auth.isPlatformAdmin());

  constructor() {
    inject(DestroyRef).onDestroy(() => Object.values(this.thumbs()).forEach(u => URL.revokeObjectURL(u)));
  }

  private scope(): number | null {
    return this.auth.isPlatformAdmin() ? this.tenantId() : null;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.summaryError.set('');
    this.tabCounts.refresh(this.scope());
    this.api.overview(this.scope()).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The overview could not be read.').message); this.loading.set(false); },
    });
    // The 30-day figures are the library's (report-library): a reader without the library still has the rest.
    if (this.canLibrary()) {
      this.lib.summary(this.scope()).subscribe({
        next: s => { this.summary.set(s); this.loadThumbs(s.recent); },
        error: e => this.summaryError.set(studioError(e, 'The 30-day figures could not be read.').message),
      });
    }
  }

  private loadThumbs(rows: LibraryRow[]): void {
    for (const r of rows) {
      if (!r.currentVersion || r.state === 'FAILED' || this.thumbs()[r.reportId]) continue;
      this.api.reportThumbnail(r.reportId, r.currentVersion, this.scope()).subscribe({
        next: res => {
          if (!res.body || !(res.headers.get('Content-Type') ?? '').includes('png')) return;
          this.thumbs.set({ ...this.thumbs(), [r.reportId]: URL.createObjectURL(res.body) });
        },
        error: () => { /* the tile shows a plain page */ },
      });
    }
  }

  // ------------------------------------------------------------------ the figures

  readonly made = computed(() => {
    const s = this.summary();
    if (!s) return null;
    const byDay = new Map(s.madeDaily.map(d => [d.day, d.count]));
    const counts = lastDays(30).map(d => byDay.get(d) ?? 0);
    return { value: s.made30, trend: trendWords(s.made30, s.madeBefore30), up: s.made30 >= s.madeBefore30, points: sparkPoints(counts) };
  });

  readonly approvedShare = computed(() => {
    const a = this.summary()?.approved;
    if (!a) return null;
    const pct = a.total ? Math.round((a.signed / a.total) * 100) : 0;
    const median = a.medianHours == null ? '' : a.medianHours < 1 ? `median ${Math.round(a.medianHours * 60)} min to sign`
      : a.medianHours < 48 ? `median ${Math.round(a.medianHours)} h to sign` : `median ${Math.round(a.medianHours / 24)} days to sign`;
    return { pct, words: `${a.signed} of ${a.total}${median ? ' · ' + median : ''}` };
  });

  readonly waitingTile = computed(() => {
    const w = this.summary()?.waiting;
    if (!w) return null;
    const oldest = [...w.reports].map(r => r.askedAt).filter(Boolean).sort()[0];
    return { count: w.count, mine: w.mine, oldest: oldest ? `oldest asked ${daysAgo(oldest)}` : 'none waiting' };
  });

  // ------------------------------------------------------------------ Needs you

  /**
   * ZT-R23: what waits for a decision, split as Review › Approvals lists it -- the reader's own to decide, and what they asked
   * for that waits for someone else (and whether anyone else in the workspace can decide it). A server without the split
   * (older media) keeps the one figure.
   */
  readonly waiting = computed(() => {
    const f = this.data()?.figures;
    if (!f) return null;
    if (!f.approvals || !f.publishing) {
      const reports = f.waitingForApproval ?? 0, templates = f.publishRequests ?? 0;
      return { forYou: { reports, templates }, asked: { reports: 0, templates: 0 }, nobodyElse: 0, split: false };
    }
    return {
      forYou: { reports: f.approvals.forYou, templates: f.publishing.forYou },
      asked: { reports: f.approvals.askedByYou, templates: f.publishing.askedByYou },
      nobodyElse: f.approvals.nobodyElse + f.publishing.nobodyElse, split: true,
    };
  });

  readonly needs = computed<NeedItem[]>(() => {
    const out: NeedItem[] = [];
    const s = this.summary();
    // Only what is the reader's to decide is theirs to do; what waits for someone else is one line below.
    for (const r of (s?.waiting.reports ?? []).filter(x => x.waitingForMe && this.canApprove())) {
      const second = r.needsSecond && !!r.firstApprovedBy;
      out.push({
        kind: 'approve', primary: true,
        title: `Approve and sign · ${r.name} · v${r.currentVersion}`,
        detail: [second ? `Second approval · first by ${r.firstApproverName}` : '', r.askedAt ? `asked ${daysAgo(r.askedAt)}` : '',
          r.pages ? `${r.pages} page${r.pages === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
        action: second ? 'Review and sign' : 'Review', link: ['/reports/library', r.reportId],
      });
    }
    for (const j of this.failed()) {
      const mapping = MAPPING_CODES.has(j.errorCode ?? '');
      out.push({
        kind: 'failed', primary: false, title: `Generation failed · ${j.reportName}`,
        detail: /no (report )?version was made/i.test(j.error ?? '') ? this.plain(j.error)
          : `${this.plain(j.error)} No version was made; the report's last version is unchanged.`,
        action: mapping && this.canGenerate() ? 'Fix field mapping' : 'Open the report',
        link: mapping && this.canGenerate() ? ['/reports/new'] : ['/reports/library', j.reportId],
        query: mapping && this.canGenerate() ? { reportId: j.reportId } : undefined,
      });
    }
    const w = this.waiting();
    const publish = w?.forYou.templates ?? 0;
    if (w && !s && w.forYou.reports > 0) {
      out.push({ kind: 'approve', primary: true, title: `${w.forYou.reports} report${w.forYou.reports === 1 ? '' : 's'} waiting for ${w.split ? 'you' : 'approval'}`,
        detail: 'Decide them in Review › Approvals, with the pages beside Approve and sign.', action: 'Open Approvals', link: ['/review/approvals'] });
    }
    const asked = (w?.asked.reports ?? 0) + (w?.asked.templates ?? 0);
    if (asked > 0) {
      out.push({ kind: 'asked', primary: false, title: `${asked} waiting for another approver: you asked for ${asked === 1 ? 'it' : 'these'}`,
        detail: w!.nobodyElse > 0
          ? `No one else in this workspace can approve ${w!.nobodyElse === 1 ? 'it' : w!.nobodyElse + ' of them'}; the platform administrator will decide ${w!.nobodyElse === 1 ? 'it' : 'them'}.`
          : `Someone else decides ${asked === 1 ? 'it' : 'them'}; you can follow ${asked === 1 ? 'it' : 'them'} in Review › My requests.`,
        action: 'My requests', link: ['/review/requests'] });
    }
    if (publish > 0) {
      out.push({ kind: 'publish', primary: false, title: `Publish · ${publish} template${publish === 1 ? '' : 's'} waiting`,
        detail: 'A draft was checked and someone asked for it to be published.', action: 'Open approvals', link: ['/review/approvals'] });
    }
    return out;
  });

  /** The failed jobs still their report's last word (a report made again since is not one to act on). */
  readonly failed = computed<JobRow[]>(() => {
    const d = this.data();
    if (!d) return [];
    return d.failedJobs.filter(j => !d.recentJobs.some(x => x.reportId === j.reportId && x.status === 'SUCCEEDED'
      && (x.createdAt ?? '') > (j.createdAt ?? '')));
  });

  // ------------------------------------------------------------------ the chart

  readonly categories = computed(() => topCategories(this.summary()?.madeByCategory ?? []));

  /** Columns of the chart: a day (30) or a week (5), each stacked by category. */
  readonly columns = computed(() => {
    const cats = this.categories();
    const named = new Set(cats.filter(c => c !== 'Other'));
    const byDay = new Map((this.summary()?.madeByCategory ?? []).map(d => [d.day, d]));
    const days = lastDays(30).map(day => {
      const d = byDay.get(day);
      const parts: Record<string, number> = {};
      if (d) for (const [k, v] of Object.entries(d)) if (k !== 'day') { const key = named.has(k) ? k : 'Other'; parts[key] = (parts[key] ?? 0) + Number(v); }
      return { label: day, parts };
    });
    if (this.chartBy() === 'day') return days;
    const weeks: { label: string; parts: Record<string, number> }[] = [];
    for (let i = days.length % 7; i < days.length; i += 7) {
      const slice = days.slice(Math.max(0, i), i + 7);
      const parts: Record<string, number> = {};
      for (const d of slice) for (const [k, v] of Object.entries(d.parts)) parts[k] = (parts[k] ?? 0) + v;
      weeks.push({ label: `${slice[0].label} – ${slice[slice.length - 1].label}`, parts });
    }
    return weeks;
  });
  readonly columnMax = computed(() => Math.max(1, ...this.columns().map(c => Object.values(c.parts).reduce((a, b) => a + b, 0))));

  colTotal(c: { parts: Record<string, number> }): number {
    return Object.values(c.parts).reduce((a, b) => a + b, 0);
  }

  colTitle(c: { label: string; parts: Record<string, number> }): string {
    const parts = Object.entries(c.parts).map(([k, v]) => `${v} ${k}`);
    return `${c.label}: ${this.colTotal(c)} report${this.colTotal(c) === 1 ? '' : 's'}${parts.length ? ' (' + parts.join(', ') + ')' : ''}`;
  }

  readonly usedMax = computed(() => Math.max(1, ...(this.summary()?.mostUsed ?? []).map(t => t.reports)));

  newReport(): void {
    void this.router.navigate(['/reports/new']);
  }

  newTemplate(): void {
    void this.router.navigate(['/reports/templates'], { queryParams: { new: 1 } });
  }
}
