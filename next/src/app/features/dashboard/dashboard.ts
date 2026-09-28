import { BillingBrief } from '../billing/billing-brief';
import { Component, DestroyRef, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Donut } from '../../shared/charts/donut';
import { Bar, BarChart } from '../../shared/charts/bar-chart';
import { daySeries } from '../../shared/charts/day-series';
import { HeatCell, HeatSelection, Heatmap } from '../../shared/charts/heatmap';
import { DashboardService, HourCell, JobBreakdown, NameValue } from './dashboard.service';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { createPager } from '../../shared/ui/pager';
import { Pagination } from '../../shared/ui/pagination';
import { Icon } from '../../shared/ui/icon';
import { statusColor } from '../../shared/charts/status-color';
import { localIsoDaysAgo } from '../../shared/ui/local-day';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { dayLabel, hourRange } from '../../shared/ui/time-format';
import { StatTile } from '../../shared/ui/stat-tile';
import { TableShell } from '../../shared/ui/data-table';
import { BlurLoader } from '../../shared/ui/blur-loader';
import { LoadError } from '../../shared/ui/load-error';
import { Observable, Subscription, debounceTime, filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { JobEventsService } from '../../core/socket/job-events.service';
import { UnreadCountService } from '../../core/notifications/unread-count.service';
import { AuthService } from '../../core/auth/auth.service';
import { workspaceName } from '../../shared/ui/workspace-name';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The three reads behind the tiles and charts; the day bars are added up from the hourly one. */
const SOURCES = ['status', 'running', 'hourly'] as const;
export type DashboardSource = typeof SOURCES[number];

/**
 * Status keys shown in the breakdown table, in lifecycle order.
 *
 * Must cover every status the backend's `total` sums over (WeeklyHrJobDimensionStatisticsDto),
 * `stop` included -- leaving one out makes `breakdownTotal`/`segmentsFor` undercount against a
 * `total` that still includes it, so the footer total and the per-row outcome bar both silently
 * stop summing to what they claim.
 */
const BREAKDOWN_COLUMNS = [
  'queue', 'start', 'running', 'failed', 'completed', 'skip', 'stop', 'interrupt', 'missed',
] as const;

type BreakdownKey = typeof BREAKDOWN_COLUMNS[number];

@Component({
  selector: 'app-dashboard',
  imports: [ServerTimePipe, Pagination, Icon, RouterLink, Donut, BarChart, Heatmap, BillingBrief, StatTile, TableShell, BlurLoader, LoadError],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  /** A busy hour can return every job that ran in it, so the drill-down pages like any list. */
  readonly breakdownPager = createPager<JobBreakdown>(50);
  readonly pagedBreakdown = computed(() => this.breakdownPager.slice(this.filteredBreakdown()));

  goToBreakdownPage(page: number): void {
    this.breakdownPager.goTo(page, this.filteredBreakdown().length);
  }
  setBreakdownPageSize(size: number): void {
    this.breakdownPager.setSize(size);
  }

  private readonly dashboard = inject(DashboardService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  /**
   * The counts drill into Run history, which is the Jobs page. Without that page (a tenant user's
   * access profile) every count landed on /unauthorized, so for them they are figures, not links.
   */
  readonly canOpenJobs = computed(() => this.auth.canOpen('jobs'));
  /**
   * A platform administrator's hour lists every workspace's jobs, and two workspaces can each have
   * a "Nightly import" (review dashboard#17), so they get a Workspace column. Everyone else's hour
   * is one workspace, where the column would repeat the same name on every row.
   */
  readonly seesWorkspaces = computed(() => this.auth.isPlatformAdmin());
  workspaceName(row: JobBreakdown): string { return workspaceName(row); }
  private readonly injector = inject(Injector);

  /** What the date boxes hold, which may be half-edited. */
  readonly startDate = signal(localIsoDaysAgo(6));
  readonly endDate = signal(localIsoDaysAgo(0));
  /**
   * The range the page last read. The subtitle, the day axis and Try again follow this one, so
   * editing a box without pressing Apply does not relabel figures that are still the old range's.
   */
  readonly appliedStart = signal(localIsoDaysAgo(6));
  readonly appliedEnd = signal(localIsoDaysAgo(0));

  /**
   * Why the boxes cannot be applied. From after To used to answer with zeros that read like a quiet
   * week, and a cleared box sent an empty date the server refused.
   */
  readonly rangeError = computed(() => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(this.startDate()) || !iso.test(this.endDate())) return 'Pick a date in both fields.';
    return this.startDate() <= this.endDate() ? '' : 'From must be on or before To.';
  });

  readonly jobStatus = signal<NameValue[]>([]);
  readonly jobRunning = signal<NameValue[]>([]);
  readonly hourly = signal<HourCell[]>([]);
  readonly breakdown = signal<JobBreakdown[]>([]);
  /** The same signal the bell's badge shows, so marking read in one clears the other. */
  private readonly unreadCount = inject(UnreadCountService);
  readonly unread = this.unreadCount.count;

  readonly loading = signal(true);
  /**
   * Why each read failed, by source. A failed chart used to be silently empty -- indistinguishable
   * from "no activity" -- and then one failure replaced every tile and chart with a single error,
   * so a slow heatmap took the job counts and the Unread link down with it. Each card now says
   * why its own figures are missing, with its own Try again.
   */
  readonly errors = signal<Partial<Record<DashboardSource, string>>>({});
  /**
   * One sentence for the whole page, only when every read was refused for the same reason (a date
   * the server will not take, MIG-103): the same sentence on every card would say it three times.
   */
  readonly error = computed(() => {
    const reasons = Object.values(this.errors());
    return reasons.length === SOURCES.length && new Set(reasons).size === 1 ? reasons[0]! : '';
  });
  /** The same for the hour drill-down, which said "No jobs ran in this hour." after a failure. */
  readonly breakdownError = signal('');
  readonly breakdownLoading = signal(false);
  /** The hour drilled into: one date, and every date its heatmap cell covers (several over a long range). */
  readonly selectedCell = signal<{ date: string; hr: number; day: string; dates: string[] } | null>(null);
  readonly breakdownSearch = signal('');

  readonly columns = BREAKDOWN_COLUMNS;

  /**
   * The statuses this hour has runs in. Nine columns, most of them zero, pushed Total off the
   * right edge at tablet and phone widths. Judged on the whole hour rather than the search
   * results, so columns do not come and go while typing; the sums still cover every status.
   */
  readonly visibleColumns = computed<readonly BreakdownKey[]>(() => {
    const rows = this.breakdownRows();
    const shown = BREAKDOWN_COLUMNS.filter(key => rows.some(row => this.countFor(row, key) > 0));
    return shown.length ? shown : BREAKDOWN_COLUMNS;
  });

  // ---- KPI tiles ----------------------------------------------------------
  // jobStatusStatistics carries an "All" bucket alongside the real statuses, so it is the
  // total rather than another category -- summing the array would count every job twice.
  readonly totalJobs = computed(() => {
    const all = this.jobStatus().find(d => (d.name ?? '').toLowerCase() === 'all');
    return all ? all.value : this.sum(this.statusCategories());
  });
  readonly activeJobs  = computed(() => this.valueOf(this.jobStatus(), 'active'));

  /**
   * Whose numbers these are, when they are not simply the reader's own workspace: a platform
   * administrator's totals add up every workspace, and the server says so on each one (MIG-46).
   */
  readonly scopeLabel = computed(() =>
    this.jobStatus().some(d => d.allWorkspaces) ? 'all workspaces' : null);

  /** The real statuses, with the "All" total removed so it can't appear as a slice. */
  readonly statusCategories = computed(() =>
    this.jobStatus().filter(d => (d.name ?? '').toLowerCase() !== 'all'));
  /**
   * The job tiles are the workspace now, whatever the range (the charts are the runs in it). A run the
   * engine has started but the worker has not picked up is Start, and it is running as far as anyone
   * watching is concerned; it was left out.
   */
  readonly runningNow  = computed(() => this.valueOf(this.jobRunning(), 'running') + this.valueOf(this.jobRunning(), 'start'));
  readonly completed   = computed(() => this.valueOf(this.jobRunning(), 'completed'));
  readonly failed      = computed(() => this.valueOf(this.jobRunning(), 'failed'));

  // ---- charts -------------------------------------------------------------
  /**
   * Runs per day, every day of the applied range present. The weekly endpoint answered one row
   * per day that had runs, named only by weekday: over a month "Thu" came four times, and a quiet
   * day vanished, so two bursts a week apart drew as steady traffic. The hourly cells carry their
   * date and are read with the same filters, so the days are added up from them instead.
   */
  readonly dayBars = computed<Bar[]>(() => {
    const counts = new Map<string, number>();
    for (const cell of this.hourly()) counts.set(cell.date, (counts.get(cell.date) ?? 0) + (cell.count ?? 0));
    if (!counts.size) return [];
    const { bars } = daySeries(counts, this.appliedStart(), this.appliedEnd());
    // A week or less reads better as "Thu 24"; longer ranges keep the dated labels, which never repeat.
    if (bars.length > 7) return bars;
    return bars.map(bar => {
      const at = new Date(bar.meta + 'T00:00:00Z');
      return { ...bar, name: `${WEEKDAY_SHORT[at.getUTCDay()]} ${at.getUTCDate()}` };
    });
  });

  /** Job and run statuses keep their status colours so a chart matches the pills in the tables. */
  readonly outcomeColor = statusColor;

  /** Hour-by-weekday cells for the heatmap; the date rides along so a click can drill in. */
  readonly heatCells = computed<HeatCell[]>(() =>
    this.hourly().map(cell => ({
      day: cell.dayCode,
      hour: cell.hr,
      value: cell.count,
      key: cell.date,
    })));

  /**
   * The drill-down's heading, which also names the region it scrolls to: "Jobs on Thursday
   * 24 Sep 2026, 22:00–23:00". The hour is the bucket the heatmap counted, said as a range; it
   * used to be "at 10p", on a 12-hour clock nothing else in the console uses.
   */
  readonly drillHeading = computed(() => {
    const cell = this.selectedCell();
    if (!cell) return '';
    const whose = this.drillAllWorkspaces() ? 'Jobs in all workspaces on ' : 'Jobs on ';
    return whose + (cell.day ? cell.day + ' ' : '') + dayLabel(cell.date) + ', ' + hourRange(cell.hr);
  });

  /**
   * Whether this hour adds up every workspace. The server says so on the TOTAL row, for a platform
   * administrator only (MIG-296); the page's scopeLabel is about the range's totals, not this hour.
   */
  readonly drillAllWorkspaces = computed(() => this.breakdown().some(row => !!row.allWorkspaces));

  /** "24 Sep 2026" from the ISO day the range is held in, for the subtitle. */
  readonly dayLabel = dayLabel;

  readonly selectedHeat = computed(() => {
    const cell = this.selectedCell();
    return cell ? { day: cell.day, hour: cell.hr } : null;
  });

  /**
   * The endpoint appends a TOTAL summary row to the same array as the jobs. It has no jobId,
   * so it is separated out and rendered as a footer rather than listed as if it were a job.
   */
  private readonly isSummaryRow = (row: JobBreakdown) =>
    !row.jobId || (row.jobName ?? '').trim().toUpperCase() === 'TOTAL';

  /**
   * Summed from the rows actually on screen rather than taken from the endpoint's TOTAL row.
   * The footer used to mix the two -- the endpoint's unfiltered figures beside a job count
   * that followed the search box -- so filtering an hour down to a handful of jobs still
   * reported the whole hour's totals, including failures none of the visible rows had.
   */
  readonly breakdownTotal = computed<JobBreakdown | null>(() => {
    const rows = this.filteredBreakdown();
    if (!rows.length) return null;
    const summed = { jobName: 'TOTAL', total: 0 } as JobBreakdown;
    for (const key of BREAKDOWN_COLUMNS) {
      (summed as any)[key] = rows.reduce((sum, row) => sum + (this.countFor(row, key) ?? 0), 0);
    }
    summed.total = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
    return summed;
  });

  /** The jobs in the hour, without the endpoint's TOTAL row. */
  readonly breakdownRows = computed(() => this.breakdown().filter(row => !this.isSummaryRow(row)));

  readonly filteredBreakdown = computed(() => {
    const rows = this.breakdownRows();
    const term = this.breakdownSearch().trim().toLowerCase();
    if (!term) return rows;
    // The workspace only where its column shows, or a row would match on something nobody can see.
    const workspaces = this.seesWorkspaces();
    return rows.filter(row =>
      String(row.jobId).includes(term) || (row.jobName ?? '').toLowerCase().includes(term)
      || (workspaces && workspaceName(row).toLowerCase().includes(term)));
  });

  ngOnInit(): void {
    this.restoreFromUrl();
    this.load();
    // Without the live feed (a dropped socket, a proxy that refuses it) the page falls back to
    // reading every minute; while the feed is up the events above are enough.
    this.poll = setInterval(() => { if (!this.jobEvents.connected()) this.load({ quiet: true }); }, 60_000);
    const cell = this.selectedCell();
    if (cell) { this.readBreakdown(cell.date, cell.hr); this.revealDrill(); }
  }

  /**
   * The view lives in the address, so Back from a count's run history returns to the same range,
   * hour and search rather than a fresh page. replaceUrl: changing the view adds no history
   * entries, so one Back still leaves the dashboard.
   */
  private syncUrl(): void {
    const cell = this.selectedCell();
    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        from: this.appliedStart(), to: this.appliedEnd(),
        date: cell?.date ?? null, hr: cell?.hr ?? null,
        q: cell ? this.breakdownSearch().trim() || null : null,
      },
    });
  }

  /** Reads the address back; anything that is not a real range, date or hour is ignored. */
  private restoreFromUrl(): void {
    const query = this.route.snapshot.queryParamMap;
    const from = query.get('from') ?? '';
    const to = query.get('to') ?? '';
    if (ISO_DAY.test(from) && ISO_DAY.test(to) && from <= to) {
      this.startDate.set(from); this.endDate.set(to);
      this.appliedStart.set(from); this.appliedEnd.set(to);
    }
    const date = query.get('date') ?? '';
    const hr = Number(query.get('hr'));
    if (!ISO_DAY.test(date) || query.get('hr') === null || !Number.isInteger(hr) || hr < 0 || hr > 23) return;
    // The cell's other dates are not known until the hours load; see coverDates.
    const day = WEEKDAY[new Date(date + 'T00:00:00Z').getUTCDay()];
    this.selectedCell.set({ date, hr, day, dates: [date] });
    this.breakdownSearch.set(query.get('q') ?? '');
  }

  /**
   * A cell restored from the address knows only its own date. Once the hours are in, it lists every
   * date its weekday and hour covers, the same as a clicked cell.
   */
  private coverDates(): void {
    const cell = this.selectedCell();
    if (!cell || cell.dates.length > 1) return;
    const dates = [...new Set(this.hourly()
      .filter(h => h.dayCode === cell.day && h.hr === cell.hr && h.count > 0)
      .map(h => h.date))].sort();
    if (dates.length > 1 && dates.includes(cell.date)) this.selectedCell.set({ ...cell, dates });
  }

  onBreakdownSearch(term: string): void {
    this.breakdownSearch.set(term);
    this.syncUrl();
  }

  /**
   * The reads in flight. A new Apply cancels the old set: a slow answer from the earlier range used
   * to land after the newer one and overwrite its tiles, and turn the loader off while the newer
   * reads were still out. Same for the drill-down, where two quick clicks could fill the second
   * hour's table with the first hour's jobs.
   */
  private loadSub = new Subscription();
  private breakdownSub?: Subscription;

  private readonly jobEvents = inject(JobEventsService);
  private readonly destroyRef = inject(DestroyRef);
  private poll: ReturnType<typeof setInterval> | null = null;

  /** When the figures were last read in full, for the "Updated" line beside the range. */
  readonly updatedAt = signal<Date | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.loadSub.unsubscribe();
      this.breakdownSub?.unsubscribe();
      if (this.poll) clearInterval(this.poll);
    });
    // The page used to read once: Running now stayed at whatever it was when the page opened. A
    // job changing state re-reads the figures, once per burst, without the loader. Log lines
    // change no figure.
    this.jobEvents.events.pipe(
      filter(event => event.type !== 'job.log'),
      debounceTime(2000),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.load({ quiet: true }));
  }

  /**
   * `quiet` is a background re-read: no loader, and a failure keeps the figures already on
   * screen rather than replacing the page with an error for a read nobody asked for.
   */
  load(options: { quiet?: boolean } = {}): void {
    this.read(SOURCES, !!options.quiet);
    this.unreadCount.refresh();
  }

  /** Try again on one card: only the read that failed goes out again. */
  retry(source: DashboardSource): void {
    this.read([source], false);
  }

  private read(sources: readonly DashboardSource[], quiet: boolean): void {
    // A full read drops every answer still out from an older range. One card's Try again joins
    // them instead, so it cannot cancel a background re-read of the other cards.
    if (sources.length === SOURCES.length) {
      this.loadSub.unsubscribe();
      this.loadSub = new Subscription();
    }
    if (!quiet) {
      this.loading.set(true);
      this.errors.update(errors => {
        const kept = { ...errors };
        for (const source of sources) delete kept[source];
        return kept;
      });
    }
    const from = this.appliedStart();
    const to = this.appliedEnd();

    // Loading until every read has answered. A quiet re-read keeps the figures and reasons already
    // on screen when it fails, and clears a card's reason when that card's read now succeeds.
    let pending = sources.length;
    let failed = false;
    const settle = () => {
      if (--pending > 0) return;
      this.loading.set(false);
      if (!failed && sources.length === SOURCES.length) this.updatedAt.set(new Date());
    };
    const clear = (source: DashboardSource) => {
      if (!this.errors()[source]) return;
      this.errors.update(errors => { const kept = { ...errors }; delete kept[source]; return kept; });
    };
    const fail = (source: DashboardSource, message: string | undefined) => {
      failed = true;
      if (!quiet) this.errors.update(errors => ({ ...errors, [source]: message || 'This could not be read.' }));
    };
    const run = <T>(source: DashboardSource, request: Observable<ApiResponse<T>>, into: (data: T | undefined) => void) =>
      this.loadSub.add(request.subscribe({
        next: r => {
          if (r.status === API_SUCCESS) { into(r.data); clear(source); }
          else fail(source, r.message);
          settle();
        },
        error: err => { fail(source, err?.error?.message); settle(); },
      }));

    for (const source of sources) {
      switch (source) {
        case 'status':
          run(source, this.dashboard.jobStatus(from, to), data => this.jobStatus.set(data ?? []));
          break;
        case 'running':
          run(source, this.dashboard.jobRunning(from, to), data => this.jobRunning.set(data ?? []));
          break;
        case 'hourly':
          run(source, this.dashboard.hourly(from, to), data => { this.hourly.set(data ?? []); this.coverDates(); });
          break;
      }
    }
  }

  /** Clicking an hour cell drills into which jobs ran in that exact hour. */
  onHeatCell(selection: HeatSelection): void {
    this.selectCell(selection.key ?? '', selection.hour, selection.value, selection.day, selection.keys);
  }

  selectCell(date: string, hr: number, count: number, day?: string, dates?: string[]): void {
    if (!count || !date) return;
    const dayName = day ?? this.hourly().find(h => h.date === date)?.dayCode ?? '';
    this.selectedCell.set({ date, hr, day: dayName, dates: dates?.length ? dates : [date] });
    this.readBreakdown(date, hr);
    this.revealDrill();
    this.syncUrl();
  }

  /**
   * The table opens below the heatmap, under the fold on a laptop and far below it on a phone, so
   * a click looked like it did nothing. It is brought into view and takes focus, so a keyboard or
   * screen-reader user lands on what just opened.
   */
  private revealDrill(): void {
    afterNextRender(() => {
      const drill = document.getElementById('dash-drill');
      if (!drill) return;
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      drill.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
      drill.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  /** Another of the dates the selected cell covers: same weekday and hour, that date's jobs. */
  pickDate(date: string): void {
    const cell = this.selectedCell();
    if (!cell || cell.date === date || !cell.dates.includes(date)) return;
    this.selectedCell.set({ ...cell, date });
    this.breakdownSearch.set('');
    this.readBreakdown(date, cell.hr);
    this.syncUrl();
  }

  /** Try again on the drill-down: the same hour, read afresh. */
  retryBreakdown(): void {
    const cell = this.selectedCell();
    if (cell) this.readBreakdown(cell.date, cell.hr);
  }

  private readBreakdown(date: string, hr: number): void {
    this.breakdownLoading.set(true);
    this.breakdownError.set('');
    this.breakdown.set([]);
    this.breakdownSub?.unsubscribe();
    this.breakdownSub = this.dashboard.breakdown(date, hr).subscribe({
      next: r => {
        this.breakdownLoading.set(false);
        if (r.status === API_SUCCESS) this.breakdown.set(r.data ?? []);
        else this.breakdownError.set(r.message || 'Could not load that hour.');
      },
      error: err => {
        this.breakdownLoading.set(false);
        this.breakdownError.set(err?.error?.message || 'Could not load that hour.');
      },
    });
  }

  clearCell(): void {
    this.breakdownSub?.unsubscribe();
    this.breakdownLoading.set(false);
    this.selectedCell.set(null);
    this.breakdownError.set('');
    this.breakdown.set([]);
    this.breakdownSearch.set('');
    this.syncUrl();
  }

  /**
   * Clicking a count opens that job's runs for exactly this hour and status. Zero is not a
   * link -- following it would land on an empty page -- so it says so instead.
   *
   * The Total column is every status at once, not a status of its own. It was passing
   * "Total" through as a jobStatus filter, and since no run is ever in a state called Total
   * the history screen filtered them all away -- the one cell that should show the most
   * showed nothing.
   */
  openCount(row: JobBreakdown, status: string, count: number): void {
    if (!this.canOpenJobs()) return;
    if (!count) {
      const label = status === 'Total' ? '' : status.toLowerCase() + ' ';
      this.toast.info(`No ${label}runs for ${row.jobName} in this hour.`);
      return;
    }
    const cell = this.selectedCell();
    const queryParams: Record<string, string | number | null> = {
      targetDate: cell?.date ?? null,
      targetHr: cell?.hr ?? null,
    };
    if (status !== 'Total') {
      // Column keys are lowercase; the API and the UI both expect the capitalised status.
      queryParams['jobStatus'] = status.charAt(0).toUpperCase() + status.slice(1);
    }
    // A row that does not name its job goes to the cross-job view rather than into the path as
    // the word "undefined". Without this, a breakdown row missing its id produced
    // /jobs/undefined/history -- a real URL that renders, reads "undefined" back out of the path
    // and hands it to every link on the page. The paramless route already means "this hour across
    // every job", which is the honest reading of a row that cannot say which job it is.
    this.router.navigate(row.jobId ? ['/operations/jobs', row.jobId, 'history'] : ['/operations/jobs', 'history'],
      { queryParams });
  }

  /**
   * The footer's equivalent of openCount. There is no single job behind a total, so this goes
   * to the history screen without one and the endpoint reads that as "every job in this hour"
   * -- which is what the old screen did by rendering TOTAL as an ordinary row whose jobId
   * happened to be null. Migrating that row into a <tfoot> is what dropped the click.
   */
  openTotal(status: string, count: number): void {
    if (!this.canOpenJobs()) return;
    if (!count) {
      const label = status === 'Total' ? '' : status.toLowerCase() + ' ';
      this.toast.info(`No ${label}runs in this hour.`);
      return;
    }
    const cell = this.selectedCell();
    const queryParams: Record<string, string | number | null> = {
      targetDate: cell?.date ?? null,
      targetHr: cell?.hr ?? null,
    };
    // No run is ever in a state called Total, so the column sends no status and the endpoint
    // returns every status for the hour.
    if (status !== 'Total') {
      queryParams['jobStatus'] = status.charAt(0).toUpperCase() + status.slice(1);
    }
    this.router.navigate(['/operations/jobs', 'history'], { queryParams });
  }

  countFor(row: JobBreakdown, key: BreakdownKey): number {
    return (row[key] as number) ?? 0;
  }

  /** Proportional bar of a job's outcomes, so a row reads at a glance. */
  segmentsFor(row: JobBreakdown): { key: string; pct: number; count: number }[] {
    const total = row.total || 0;
    if (!total) return [];
    return BREAKDOWN_COLUMNS
      .map(key => ({ key, count: this.countFor(row, key) }))
      .filter(s => s.count > 0)
      .map(s => ({ ...s, pct: (s.count / total) * 100 }));
  }

  applyRange(): void {
    if (this.rangeError()) return;
    this.appliedStart.set(this.startDate());
    this.appliedEnd.set(this.endDate());
    this.load();
    this.clearCell();
  }

  resetRange(): void {
    this.startDate.set(localIsoDaysAgo(6));
    this.endDate.set(localIsoDaysAgo(0));
    this.applyRange();
  }

  private sum(data: NameValue[]): number {
    return data.reduce((total, d) => total + (d.value ?? 0), 0);
  }

  private valueOf(data: NameValue[], name: string): number {
    return data.find(d => (d.name ?? '').toLowerCase() === name)?.value ?? 0;
  }
}
