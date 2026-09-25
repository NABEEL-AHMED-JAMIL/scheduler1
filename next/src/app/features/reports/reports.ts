import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, of, switchMap } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { BillingApi, MeterLine } from '../billing/billing.service';
import { formatMoney } from '../billing/billing-format';
import { ToastService } from '../../shared/ui/toast.service';
import { statusColor } from '../../shared/charts/status-color';
import { Combobox } from '../../shared/ui/combobox';
import { Donut } from '../../shared/charts/donut';
import { BarChart, Bar } from '../../shared/charts/bar-chart';
import { DaySeries, daySeries } from '../../shared/charts/day-series';
import { Histogram } from '../../shared/charts/histogram';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { StatusPill } from '../../shared/ui/status-pill';
import { TableShell } from '../../shared/ui/data-table';
import { createPager } from '../../shared/ui/pager';
import { Pagination } from '../../shared/ui/pagination';
import { DecimalPipe } from '@angular/common';
import { ReportPivot } from './report-pivot';
import {
  EXEC_SECONDS, JOB_NAME, NO_DURATION, RUN_ID, TENANT_IDX, RunData, RunRow, SECONDS, aggregate,
  humanSeconds, withJobDimension,
} from './pivot';

const EMPTY: RunData = { task: [], status: [], owner: [], day: [], job: [], tenant: [], rows: [] };

/** No axis at all, which is not the same as an axis that was cut short. */
const NO_DAYS: DaySeries = { bars: [], capped: false };

/**
 * Which outcomes count as what.
 *
 * Drawn from the JobStatus enum, which has exactly eight constants: Queue, Start, Running,
 * Failed, Completed, Skip, Interrupt, Missed. Two things follow that the UI must respect.
 * There is no Cancelled and no Stopped, so neither is ever shown. Skip and Missed rows carry
 * skip_time rather than start_time; the runs query (QueryService.runReportRows) admits either,
 * so a task that was skipped six times this week shows six skipped runs rather than six fewer.
 */
const FAILED = new Set(['Failed', 'Interrupt']);

/**
 * The outcome columns of the task table, in the order a reader wants them: what went right,
 * what went wrong, what never happened. Interrupt is kept apart from Failed -- a run that was
 * stopped is a different problem from one that broke -- though both count as failures for the
 * task's tone and success rate.
 */
const OUTCOME_COLUMNS = [
  { status: 'Completed', label: 'Completed', tone: 'ok',   title: 'Runs that finished successfully' },
  { status: 'Failed',    label: 'Failed',    tone: 'crit', title: 'Runs that reported an error' },
  { status: 'Interrupt', label: 'Interrupted', tone: 'crit', title: 'Runs stopped before they finished' },
  { status: 'Skip',      label: 'Skipped',   tone: 'warn', title: 'Runs skipped by hand or because the job was already queued' },
  { status: 'Missed',    label: 'Missed',    tone: 'warn', title: 'Scheduled runs the dispatcher never picked up' },
] as const;
const IN_FLIGHT = new Set(['Queue', 'Start', 'Running']);

// NO_DURATION -- the -1 a run that has not ended carries instead of a duration -- is imported
// from pivot.ts rather than declared again here. aggregate() now HANDS IT BACK for a sample it
// could not measure, so the two files exchange the sentinel, and two private copies of a value
// that has to agree is how they eventually stop agreeing.


interface TaskHealth {
  task: string;
  runs: number;
  /** How many distinct jobs drove this task in the range. A task wired into several jobs
   *  fails differently from one with a single caller, and the runs feed already names the
   *  job on every row -- it was simply never counted. */
  jobs: number;
  failures: number;
  /** Runs per outcome, by JobStatus name; missing means zero. */
  outcomes: Record<string, number>;
  successRate: number;
  median: number;
  /** Slowest finished run. Read next to the median it says whether the task is steady or
   *  erratic, which a median alone cannot. NO_DURATION when nothing finished. */
  slowest: number;
  lastDay: string;
  tone: 'ok' | 'warn' | 'crit';
  state: string;
  why: string;
}

interface FailureRow {
  jobQueueId: number;
  jobId: number;
  job: string;
  task: string;
  status: string;
  message: string;
  when: string;
  seconds: number;
}

/** One prompt's model calls over the range, from aiPrompt.json/usage. */
interface AiUsageRow {
  promptId: number | null;
  promptName: string;
  calls: number;
  failed: number;
  tries: number;
  tokensIn: number;
  tokensOut: number;
  medianMs: number;
  lastAt: string | null;
}

/** Failures with the same message once its numbers are taken out: one reason, many runs. */
interface FailureReason {
  key: string;
  sample: string;
  count: number;
  tasks: number;
  lastWhen: string;
}

/**
 * What a failure message says once its particulars are taken out: the job id, and every
 * number. Two server paths word the same fault differently -- "Job 2477 failed due to X" and
 * "Job 2476: X" -- and a token budget prints today's tally, so without this the one reason
 * showed up as three or four rows in the list that exists to say how many reasons there are.
 */
export function reasonKey(message: string | undefined | null): string {
  const text = (message || '').replace(/\s+/g, ' ').trim();
  if (!text) return '(no message)';
  return text
    .replace(/^Job\s+\d+\s*(failed due to\s*|:\s*|(?=failed))/i, '')
    .replace(/\d[\d,]*(\.\d+)?/g, '#')
    .slice(0, 160);
}

/** One row of POST /message.json/fetchLogs. */
interface QueueLog {
  jobQueueId?: number; jobId?: number; jobName?: string;
  jobStatus?: string; jobStatusMessage?: string;
  startTime?: string; endTime?: string; dateCreated?: string;
}

/**
 * What the runs in a range actually say.
 *
 * The page used to be a pivot builder and nothing else: powerful, but it answered no question
 * until the reader had built the answer themselves. The builder is still here, one click away
 * and unchanged, because it is the only surface that can answer a question nobody anticipated.
 * Above it now sit the answers people were building by hand every time.
 *
 * Everything on this page is computed in the browser from ONE fetch of /report.json/runs, which
 * is also what the builder below reads -- changing a section costs no round trip, and the
 * builder costs no second copy of the data. The only extra call is a narrow one for failures,
 * and it only fires when there are failures to explain.
 *
 * Three honesty rules run through the whole file, because the alternative on this data is a
 * dashboard that lies quietly:
 *
 *   1. `seconds` is enqueue-to-finish, not execution time -- start_time is stamped when a run
 *      is queued and never reset when the worker picks it up. Every duration is labelled
 *      "queued to finished" and never "execution time".
 *   2. Runs still in flight have no duration at all. They are excluded from every duration
 *      figure and the exclusion is stated, rather than silently shrinking the population.
 *   3. A comparison needs something to compare against. When the previous period has no runs,
 *      the tiles say so instead of printing a meaningless +100%.
 */
@Component({
  selector: 'app-reports',
  imports: [Icon, StatTile, StatusPill, TableShell, Donut, BarChart, Histogram, ReportPivot, Combobox, Pagination, DecimalPipe, RouterLink],
  templateUrl: './reports.html',
})
export class Reports implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly billingApi = inject(BillingApi);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal('');
  /** The payload exactly as the server sent it. Nothing renders from this directly. */
  readonly rawData = signal<RunData>(EMPTY);

  // ---- filters ----------------------------------------------------------------------
  //
  // Client-side, over rows the browser already has. That is not a shortcut: the runs feed is
  // one request for the whole range, so filtering here costs no round trip and -- crucially --
  // there is exactly ONE place the predicate lives. `data()` below is what every tile, chart,
  // table AND the pivot builder read, so a filter cannot reach some of them and miss others,
  // which is the failure the brief singled out.
  readonly taskFilter = signal('');
  readonly jobFilter = signal('');
  readonly statusFilter = signal('');
  readonly ownerFilter = signal('');
  readonly tenantFilter = signal('');

  /** Options come from the RAW payload, so choosing one never empties the other pickers. */
  /** Plain strings as combobox rows; the filters are names, so the value is the label. */
  asOptions(values: string[]): { value: string; label: string }[] { return values.map(v => ({ value: v, label: v })); }
  readonly taskOptions = computed(() => [...this.rawData().task].filter(Boolean).sort());
  readonly jobOptions = computed(() => [...(this.rawData().job ?? [])].filter(Boolean).sort());
  readonly statusOptions = computed(() => [...this.rawData().status].filter(Boolean).sort());
  readonly ownerOptions = computed(() => [...this.rawData().owner].filter(Boolean).sort());
  readonly tenantOptions = computed(() => [...(this.rawData().tenant ?? [])].filter(Boolean).sort());

  /**
   * Only worth showing when more than one workspace is actually present.
   *
   * A tenant administrator sees exactly their own, so the control would be a select with one option
   * that can never change anything. A platform administrator has the tenant filter switched off in the
   * backend, so for them the report really does merge workspaces -- which is precisely when
   * this needs to be visible.
   */
  readonly showTenantFilter = computed(() => this.tenantOptions().length > 1);

  readonly activeFilters = computed(() => [
    { key: 'task', label: 'Task', value: this.taskFilter() },
    { key: 'job', label: 'Job', value: this.jobFilter() },
    { key: 'status', label: 'Outcome', value: this.statusFilter() },
    { key: 'owner', label: 'Owner', value: this.ownerFilter() },
    { key: 'tenant', label: 'Workspace', value: this.tenantFilter() },
  ].filter(f => f.value));

  clearFilter(key: string): void {
    if (key === 'task') this.taskFilter.set('');
    if (key === 'job') this.jobFilter.set('');
    if (key === 'status') this.statusFilter.set('');
    if (key === 'owner') this.ownerFilter.set('');
    if (key === 'tenant') this.tenantFilter.set('');
  }

  clearFilters(): void {
    this.taskFilter.set(''); this.jobFilter.set('');
    this.statusFilter.set(''); this.ownerFilter.set('');
    this.tenantFilter.set('');
  }

  /**
   * The runs everything on this page describes.
   *
   * The DICTIONARIES are carried through untouched and only `rows` is narrowed, because every
   * row holds indexes into those arrays -- rebuilding them would invalidate every index in the
   * payload. A dictionary entry with no surviving rows simply goes unused, which the charts
   * already handle (outcomeMix only emits statuses that occurred).
   */
  readonly data = computed<RunData>(() => {
    const raw = this.rawData();
    const task = this.taskFilter(), job = this.jobFilter();
    const status = this.statusFilter(), owner = this.ownerFilter();
    const tenant = this.tenantFilter();
    if (!task && !job && !status && !owner && !tenant) return raw;
    const tenants = raw.tenant ?? [];
    const rows = raw.rows.filter(row =>
      (!task || raw.task[row[0]] === task) &&
      (!status || raw.status[row[1]] === status) &&
      (!owner || raw.owner[row[2]] === owner) &&
      (!tenant || tenants[row[TENANT_IDX] ?? -1] === tenant) &&
      (!job || row[JOB_NAME] === job));
    return { ...raw, rows };
  });
  readonly truncated = signal(false);

  readonly startDate = signal(isoDaysAgo(30));
  readonly endDate = signal(isoDaysAgo(0));

  /** The builder is opt-in: most visits want the answers, not the tool. */
  readonly showBuilder = signal(false);

  readonly failures = signal<FailureRow[]>([]);

  // ---- Task health at volume: a search, a state filter and a page, over the worst-first list.
  readonly healthSearch = signal('');
  readonly healthState = signal<'' | 'failing' | 'inflight' | 'healthy'>('');
  readonly healthPager = createPager<TaskHealth>(25);
  // ---- Failures at volume: the same message with its numbers taken out is one reason.
  readonly failureSearch = signal('');
  readonly failureReason = signal('');
  readonly failurePager = createPager<FailureRow>(25);
  // ---- Model calls in the range, per prompt.
  readonly aiUsage = signal<AiUsageRow[]>([]);
  readonly aiUsageLoading = signal(false);
  /** The usage read failed: shown as such, not as a page without AI calls. */
  readonly aiUsageError = signal('');
  readonly failuresLoading = signal(false);
  readonly failuresError = signal('');

  /** Runs in the equally-long window immediately before this one, for the deltas. */
  readonly priorRuns = signal<number | null>(null);
  readonly priorSuccessRate = signal<number | null>(null);

  readonly humanSeconds = humanSeconds;
  readonly statusColor = statusColor;
  readonly outcomeColumns = OUTCOME_COLUMNS;
  /** Durations on the histogram axis read as durations, not as bare numbers. */
  readonly formatSeconds = (value: number): string => humanSeconds(Math.round(value));

  /**
   * A date box that has been cleared is not a wider range -- it is no range at all.
   *
   * dateRangeFilter on the server returns an EMPTY filter unless both dates match
   * yyyy-mm-dd, so submitting a blank box silently returns the tenant's entire history and
   * every figure above would describe a period nobody asked for. Guarded here so the page
   * never issues that request.
   */
  readonly rangeValid = computed(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(this.startDate())
    && /^\d{4}-\d{2}-\d{2}$/.test(this.endDate())
    && this.startDate() <= this.endDate());

  // ---- the run population -------------------------------------------------------------

  readonly rows = computed(() => this.data().rows);
  readonly hasRows = computed(() => this.rows().length > 0);

  private readonly statusAt = (row: RunRow) => this.data().status[row[1]] ?? '';

  /**
   * run id -> what that run was, taken from the runs payload.
   *
   * fetchLogs answers with jobId and the error text but no name for either the job or the
   * task -- its projection is job_queue columns only. The runs feed already carries both and
   * is keyed by the same job_queue_id, so the two are joined here rather than asking the
   * server for a name it would have to be taught to send.
   */
  private readonly runIndex = computed(() => {
    const data = this.data();
    const index = new Map<number, { job: string; task: string }>();
    for (const row of data.rows) {
      index.set(row[RUN_ID], {
        job: row[JOB_NAME] ?? '',
        task: data.task[row[0]] ?? '',
      });
    }
    return index;
  });

  readonly counts = computed(() => {
    const rows = this.rows();
    let completed = 0, failed = 0, inFlight = 0;
    for (const row of rows) {
      const status = this.statusAt(row);
      if (status === 'Completed') completed++;
      else if (FAILED.has(status)) failed++;
      else if (IN_FLIGHT.has(status)) inFlight++;
    }
    return { total: rows.length, completed, failed, inFlight };
  });

  /** Skipped and missed runs in the range -- due, but never started. */
  readonly notRun = computed(() =>
    this.rows().filter(r => { const s = this.statusAt(r); return s === 'Skip' || s === 'Missed'; }).length);

  /** The Runs tile's foot: the period comparison, and how many of the runs never started. */
  readonly runsFoot = computed(() => {
    const parts: string[] = [];
    if (this.runsDelta()) parts.push(this.runsDelta());
    if (this.notRun()) parts.push(`${this.notRun()} skipped or missed`);
    return parts.join(' · ');
  });

  /**
   * Of the runs that finished, how many succeeded.
   *
   * The denominator is settled runs, not every run. Dividing by the whole population counts a
   * run that simply has not finished yet as a non-success: refresh mid-batch with 45 done and
   * 20 still queued and the tile reads 69% and turns red, reporting a problem that does not
   * exist. What is in flight is reported separately, in the tile's own foot.
   */
  readonly settled = computed(() => this.counts().completed + this.counts().failed);
  readonly successRate = computed(() => {
    const settled = this.settled();
    return settled ? Math.round((this.counts().completed / settled) * 100) : 0;
  });

  /** Runs that finished, so have a duration to speak of. */
  readonly timedRuns = computed(() => this.rows().filter(r => r[SECONDS] !== NO_DURATION));
  readonly durations = computed(() => this.timedRuns().map(r => r[SECONDS]));
  readonly untimed = computed(() => this.rows().length - this.timedRuns().length);
  /**
   * The median of the runs that have a duration -- and nothing at all when none of them does.
   *
   * The guard its execution twin below has always carried, finally given to the tile that needed
   * it more. Unguarded this read "Median duration 0s" whenever timedRuns() was empty, which is
   * one click away on any ordinary report: pick Outcome = Running and every surviving row carries
   * -1, because end_time is still null. The page then said two contradictory things about the
   * same runs fifty pixels apart, the histogram beside it being correctly captioned "No run has
   * finished in this range yet". The foot did mutter "12 with no end time" underneath, but small
   * print does not un-assert a headline figure of zero.
   */
  readonly medianDuration = computed(() =>
    this.timedRuns().length ? aggregate(this.timedRuns(), 'median') : NO_DURATION);

  /**
   * The same runs, timed from the moment the worker picked them up.
   *
   * This is the figure a reader almost always means by "how long does this task take", and it
   * is not what the tile above reports: on this deployment the median run is 34s end to end and
   * 0.2s of actual work, because the dispatcher polls once a minute. Reporting only the first
   * number invites optimising a transform that was never slow.
   */
  readonly executedRuns = computed(() =>
    this.rows().filter(r => (r[EXEC_SECONDS] ?? NO_DURATION) >= 0));
  readonly medianExecution = computed(() =>
    this.executedRuns().length ? aggregate(this.executedRuns(), 'execMedian') : NO_DURATION);

  readonly runsDelta = computed(() => {
    const before = this.priorRuns();
    if (before === null) return '';
    if (before === 0) return 'no runs in the previous period';
    const change = Math.round(((this.counts().total - before) / before) * 100);
    return change === 0 ? 'unchanged on the previous period'
      : `${change > 0 ? '+' : ''}${change}% on the previous period`;
  });

  /**
   * A rate moves in POINTS, not per cent.
   *
   * Reporting a rate's relative change is how "80% to 100%" becomes the footnote "+25%", which
   * every reader adds to 80 and gets 105. Subtracting gives the number people actually mean.
   * The empty-period wording is gated on the prior RUN COUNT rather than on the prior rate,
   * because a period in which everything failed has a rate of 0 and is not an empty period --
   * saying "no runs in the previous period" there states the opposite of what happened.
   */
  readonly successDelta = computed(() => {
    const before = this.priorSuccessRate();
    if (this.priorRuns() === null) return '';
    if (this.priorRuns() === 0) return 'no runs in the previous period';
    if (before === null) return '';
    const diff = this.successRate() - before;
    return diff === 0 ? 'unchanged on the previous period'
      : `${diff > 0 ? '+' : ''}${diff} points on the previous period`;
  });

  /**
   * untimed() counts rows with no end_time, which is NOT the same population as "in flight":
   * a run can be marked Failed and closed without one. The two are reported as what they each
   * are so this tile cannot disagree with the Failed tile beside it.
   */
  /**
   * The success tile's own qualifier.
   *
   * The in-flight count belongs here, under the number whose denominator excludes it -- it was
   * sitting under "Failed", where "4 / 12 still running" reads as twelve failures still going,
   * which is impossible since Failed is terminal.
   */
  readonly successFoot = computed(() => {
    const parts: string[] = [];
    if (this.successDelta()) parts.push(this.successDelta());
    if (this.counts().inFlight) parts.push(`${this.counts().inFlight} still running, not counted`);
    return parts.join(' · ');
  });

  /**
   * What the duration tile is actually measuring, said out loud.
   *
   * job_queue records date_created, start_time and end_time, and start_time is stamped when the
   * run is ENQUEUED -- measured across every run on this instance the two are within 10ms of
   * each other. There is no execution-start column, so end_time - start_time is queue wait plus
   * execution, and on this deployment the wait dominates it: the dispatcher polls once a
   * minute, and the observed spread is 32s to 61s for pipelines that do about a second of work.
   * A tile captioned only "Median duration" therefore reads as task performance when it is
   * mostly a measure of the dispatcher, so the caption names the wait explicitly.
   */
  readonly durationFoot = computed(() => {
    const parts: string[] = [];
    // The split, when it is known, rather than the caveat alone. "34s · 0s running" says in
    // four words what the old "wait included" only hinted at.
    parts.push(this.medianExecution() >= 0
      ? `${humanSeconds(this.medianExecution())} running, rest is queue wait`
      : 'queued to finished, wait included');
    if (this.untimed()) parts.push(`${this.untimed()} with no end time`);
    return parts.join(' · ');
  });

  // ---- shape --------------------------------------------------------------------------

  /**
   * Only the outcomes that actually occurred.
   *
   * Seeding this from the enum would draw five permanently-empty segments, because just three
   * of the eight statuses have ever reached this table.
   */
  readonly outcomeMix = computed(() => {
    const counts = new Map<string, number>();
    for (const row of this.rows()) {
      const status = this.statusAt(row);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  });

  /**
   * Runs per day, oldest first and gap-filled.
   *
   * Both halves matter. The runs query ends `order by job_queue_id desc` and the server interns
   * the day dictionary in first-seen order, so the days arrive newest-first -- plotted as they
   * come, time runs backwards. And a day with no runs is simply absent from the dictionary, so
   * an unfilled series draws a straight line across a gap and implies activity that never
   * happened.
   */
  private readonly dayChart = computed<DaySeries>(() => {
    const data = this.data();
    if (!data.rows.length) return NO_DAYS;
    const counts = new Map<string, number>();
    // Composition per day as well as volume. The page already knows each run's outcome, and a
    // plain daily total answers "how much" while hiding "how did it go" -- a day of 20 runs
    // reads identically whether all 20 completed or all 20 failed. Counts are additive, so
    // stacking them asserts something true.
    const byOutcome = new Map<string, Map<string, number>>();
    for (const row of data.rows) {
      const day = data.day[row[3]];
      if (!day) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
      const status = data.status[row[1]] || 'Unknown';
      const forDay = byOutcome.get(day) ?? new Map<string, number>();
      forDay.set(status, (forDay.get(status) ?? 0) + 1);
      byOutcome.set(day, forDay);
    }
    // Bounded by the SELECTED range, not by the days that happen to have runs. Bounding it by
    // the data made the caption a lie: it promised "days with no runs are shown as gaps" while
    // the axis quietly began at the first busy day and ended at the last, so an empty fortnight
    // either side simply vanished.
    const days = [...counts.keys()].sort();
    if (!days.length) return NO_DAYS;
    // Bounded by the SELECTED range, not by the days that happen to have runs. Bounding it by
    // the data made the caption a lie: it promised "days with no runs are shown as gaps" while
    // the axis quietly began at the first busy day and ended at the last, so an empty fortnight
    // either side simply vanished. daySeries() also owns the cap direction and the year label.
    const from = this.startDate() <= days[0] ? this.startDate() : days[0];
    const to = this.endDate() >= days[days.length - 1] ? this.endDate() : days[days.length - 1];
    const series = daySeries(counts, from, to);
    return {
      // Kept, not re-derived. See daysCapped() below.
      capped: series.capped,
      bars: series.bars.map(bar => {
        const forDay = byOutcome.get(String(bar.meta));
        if (!forDay) return bar;
        return {
          ...bar,
          segments: [...forDay.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, value]) => ({ label, value, color: statusColor(label) })),
        };
      }),
    };
  });

  readonly runsByDay = computed<Bar[]>(() => this.dayChart().bars);

  /**
   * True when the axis was shortened to its cap and the oldest days are not drawn.
   *
   * daySeries() has always returned this; it was being thrown away and guessed back from the bar
   * count as `length >= MAX_DAYS`. The two part company at exactly MAX_DAYS, which is one real
   * range rather than a theoretical one: 2024-01-01 to 2024-12-31 is 366 days in a leap year, so
   * daySeries drew all 366 and capped nothing while the card printed "Showing the most recent
   * 366 days." underneath -- a warning that exists only to say older days are missing, saying it
   * when none were.
   */
  readonly daysCapped = computed(() => this.dayChart().capped);

  /**
   * Days that actually carry a run -- not the number of slots on the axis.
   *
   * daysCovered() returned runsByDay().length, which is the SELECTED RANGE's length because the
   * axis is gap-filled. So the "all of these runs happened on one day" branch could never fire:
   * with 49 runs all on 2026-09-08 inside a 30-day range it read 31, and the card told the
   * reader about gaps in a trend that does not exist.
   */
  readonly activeDays = computed(() => this.runsByDay().filter(bar => bar.value > 0).length);

  /** Runs the chart could not place, because their row carries no day. */
  readonly undatedRuns = computed(() => {
    const data = this.data();
    if (!data.rows.length) return 0;
    return data.rows.filter(row => !data.day[row[3]]).length;
  });

  // ---- task health --------------------------------------------------------------------

  /**
   * A task's standing, from its own runs.
   *
   * Deliberately not called a health "score": there is no SLA, no expected duration and no
   * baseline in this system to score against. What can be said honestly is how often a task
   * failed and when it last ran, so that is what the states mean and the reason travels with
   * the row rather than living in a legend.
   */
  readonly taskHealth = computed<TaskHealth[]>(() => {
    const data = this.data();
    const byTask = new Map<number, RunRow[]>();
    for (const row of data.rows) {
      const list = byTask.get(row[0]);
      if (list) list.push(row); else byTask.set(row[0], [row]);
    }
    const out: TaskHealth[] = [];
    for (const [taskIdx, rows] of byTask) {
      const failures = rows.filter(r => FAILED.has(this.statusAt(r))).length;
      const completed = rows.filter(r => this.statusAt(r) === 'Completed').length;
      const outcomes: Record<string, number> = {};
      for (const r of rows) { const s = this.statusAt(r); outcomes[s] = (outcomes[s] ?? 0) + 1; }
      const timed = rows.filter(r => r[SECONDS] !== NO_DURATION);
      // The SAME settled denominator the Overview tile uses. Dividing by every run here while
      // the tile divided by settled ones made the page print two different success percentages
      // for the same data, fifty pixels apart. -1 means nothing has settled yet, rendered as a
      // dash rather than as a zero that looks like a failure.
      const settledRuns = completed + failures;
      const successRate = settledRuns ? Math.round((completed / settledRuns) * 100) : -1;
      const lastDay = rows.map(r => data.day[r[3]]).filter(Boolean).sort().pop() ?? '';

      let tone: TaskHealth['tone'] = 'ok';
      let state = 'Healthy';
      let why = 'every run completed';
      // From the same IN_FLIGHT set the Overview tile uses. Deriving it by subtraction meant any
      // status that is neither completed nor failed -- Skip and Missed among them -- was filed
      // as "still going", so the table could call a task in flight while the tile above it
      // counted nothing running, on the same rows.
      const inFlight = rows.filter(r => IN_FLIGHT.has(this.statusAt(r))).length;
      // Skip, Missed and anything else that is neither settled nor running. Named rather than
      // absorbed: a task whose every run was skipped must not read "Healthy - every run
      // completed", which is what the old subtraction plus the ladder below produced.
      const neither = rows.length - completed - failures - inFlight;
      if (failures === 0 && completed === 0 && inFlight === 0 && neither > 0) {
        tone = 'warn'; state = 'Not run';
        why = `${neither} ${neither === 1 ? 'run' : 'runs'} neither started nor finished`;
      } else if (failures === 0 && completed === 0 && inFlight > 0) {
        // Nothing has finished yet. Calling that "Healthy — every run completed" was a plain
        // falsehood: the ladder branched on failures alone, so a task whose only run was still
        // queued came out green at 0%.
        tone = 'warn'; state = 'In flight';
        why = `${inFlight} ${inFlight === 1 ? 'run' : 'runs'} still going`;
      } else if (failures === rows.length && failures > 0) {
        tone = 'crit'; state = 'Failing';
        why = `all ${failures} ${failures === 1 ? 'run' : 'runs'} failed`;
      } else if (failures > 0) {
        tone = 'warn'; state = 'Unreliable';
        why = `${failures} of ${rows.length} runs failed`;
      } else if (inFlight > 0) {
        why = `${completed} completed, ${inFlight} still going`;
      } else if (neither > 0) {
        why = `${completed} completed, ${neither} skipped or missed`;
      }
      out.push({
        task: data.task[taskIdx] ?? '(no task)',
        runs: rows.length,
        jobs: new Set(rows.map(r => r[JOB_NAME])).size,
        failures, outcomes, successRate,
        median: timed.length ? aggregate(timed, 'median') : NO_DURATION,
        slowest: timed.length ? aggregate(timed, 'max') : NO_DURATION,
        lastDay, tone, state, why,
      });
    }
    // Worst first: that is the order somebody scanning this table is looking for.
    // "Worst first" means most failures first. An unsettled task has no rate to rank on, so it
    // sorts as if perfect rather than as if zero -- otherwise a task that is merely still
    // running is presented above one that is actually failing.
    const rank = (t: TaskHealth) => (t.successRate < 0 ? 101 : t.successRate);
    return out.sort((a, b) =>
      b.failures - a.failures || rank(a) - rank(b) || b.runs - a.runs);
  });

  readonly unhealthyTasks = computed(() => this.taskHealth().filter(t => t.failures > 0).length);
  readonly inFlightTasks = computed(() => this.taskHealth().filter(t => t.tone === 'warn' && t.failures === 0).length);

  /** The health table narrowed by the search box and the state chips, still worst first. */
  readonly healthRows = computed(() => {
    const q = this.healthSearch().trim().toLowerCase();
    const state = this.healthState();
    return this.taskHealth().filter(t =>
      (!q || t.task.toLowerCase().includes(q))
      && (state === '' || (state === 'failing' ? t.failures > 0 : state === 'inflight' ? (t.tone === 'warn' && t.failures === 0) : t.failures === 0 && t.tone === 'ok')));
  });
  readonly healthPage = computed(() => this.healthPager.slice(this.healthRows()));
  setHealthState(state: '' | 'failing' | 'inflight' | 'healthy'): void {
    this.healthState.set(this.healthState() === state ? '' : state);
    this.healthPager.reset();
  }
  setHealthSearch(text: string): void { this.healthSearch.set(text); this.healthPager.reset(); }

  /**
   * Failures grouped by what went wrong. A message with its numbers replaced by # is the
   * reason: "Job 2489 failed in the queue because…" and "Job 2574 failed…" are one line
   * with a count, which is what a page of sixty rows was hiding.
   */
  readonly failureReasons = computed<FailureReason[]>(() => {
    const groups = new Map<string, FailureReason & { taskSet: Set<string> }>();
    for (const f of this.visibleFailures()) {
      const key = reasonKey(f.message);
      let g = groups.get(key);
      if (!g) { g = { key, sample: reasonKey(f.message), count: 0, tasks: 0, lastWhen: '', taskSet: new Set() }; groups.set(key, g); }
      g.count++; g.taskSet.add(f.task || String(f.jobId)); if (f.when > g.lastWhen) g.lastWhen = f.when;
    }
    return [...groups.values()].map(g => ({ key: g.key, sample: g.sample, count: g.count, tasks: g.taskSet.size, lastWhen: g.lastWhen }))
      .sort((a, b) => b.count - a.count);
  });
  readonly failureRows = computed(() => {
    const q = this.failureSearch().trim().toLowerCase();
    const reason = this.failureReason();
    return this.visibleFailures().filter(f =>
      (!reason || reasonKey(f.message) === reason)
      && (!q || `${f.job} ${f.task} ${f.message}`.toLowerCase().includes(q)));
  });
  readonly failurePage = computed(() => this.failurePager.slice(this.failureRows()));
  setFailureReason(key: string): void { this.failureReason.set(this.failureReason() === key ? '' : key); this.failurePager.reset(); }
  setFailureSearch(text: string): void { this.failureSearch.set(text); this.failurePager.reset(); }

  /** The AI section's tiles: every model call in the range, whatever prompt made it. */
  readonly aiTotals = computed(() => {
    const rows = this.aiUsage();
    const calls = rows.reduce((n, r) => n + r.calls, 0);
    return {
      calls,
      failed: rows.reduce((n, r) => n + r.failed, 0),
      tokens: rows.reduce((n, r) => n + r.tokensIn + r.tokensOut, 0),
      tokensIn: rows.reduce((n, r) => n + r.tokensIn, 0),
      tokensOut: rows.reduce((n, r) => n + r.tokensOut, 0),
      prompts: rows.length,
      failedPct: calls ? Math.round(rows.reduce((n, r) => n + r.failed, 0) / calls * 100) : 0,
    };
  });

  /**
   * run id -> the workspace it belongs to, taken from the RAW payload.
   *
   * Raw rather than data(), and that is the whole point of it existing separately from
   * runIndex(): this is the lookup that decides whether a failure survives the workspace filter,
   * so building it from rows the workspace filter has already narrowed would make every failure
   * belong to whichever workspace is selected. The runs feed covers the same range as fetchLogs
   * and is keyed by the same job_queue_id, and it is the only thing on the page that knows which
   * workspace a run id belongs to -- fetchLogs' projection is job_queue columns only.
   */
  private readonly tenantOfRun = computed(() => {
    const raw = this.rawData();
    const names = raw.tenant ?? [];
    const index = new Map<number, string>();
    for (const row of raw.rows) index.set(row[RUN_ID], names[row[TENANT_IDX] ?? -1] ?? '');
    return index;
  });

  /**
   * The failure rows the filters leave standing.
   *
   * The table is fed by fetchLogs rather than the runs feed, so it does not inherit data()'s
   * narrowing for free -- and a page that filtered its charts to one task while still listing
   * every other task's failures underneath would be worse than not filtering at all.
   *
   * Workspace was the one filter this never honoured, and for a platform administrator -- whose
   * tenantClause() is empty, so the runs feed merges every workspace -- it was the filter that
   * mattered most. Picking Workspace = Acme narrowed the Failed tile to Acme's 3 failures while
   * the table underneath went on listing all 27 and its own header went on counting them, with
   * the "Filtered to Workspace: Acme" chip on screen throughout. Worse, the foreign rows rendered
   * anonymously: their job and task are joined through runIndex(), which IS built from the
   * narrowed rows, so they showed "—" and a bare "#4713" while padding a count the tile above
   * them contradicted. The early return had to take tenant too, or a workspace chosen on its own
   * left the table completely unfiltered.
   *
   * A failure the runs feed does not carry at all cannot be attributed to a workspace, so it is
   * dropped while a workspace is selected rather than shown under one it may not belong to --
   * that unattributable row is exactly the contradiction being fixed.
   */
  readonly visibleFailures = computed(() => {
    const task = this.taskFilter(), job = this.jobFilter();
    const status = this.statusFilter(), owner = this.ownerFilter();
    const tenant = this.tenantFilter();
    if (!task && !job && !status && !tenant) return this.failures();
    // owner is not on a failure row; a filtered owner cannot be honoured here, so the table is
    // left alone for it rather than silently emptied.
    void owner;
    const workspaces = this.tenantOfRun();
    return this.failures().filter(f =>
      (!task || f.task === task) &&
      (!job || f.job === job) &&
      (!status || f.status === status) &&
      (!tenant || workspaces.get(f.jobQueueId) === tenant));
  });

  // ---- loading ------------------------------------------------------------------------

  /**
   * switchMap, not a bare subscribe: editing both date boxes fires two overlapping requests,
   * and without cancellation a slow first response lands after the fast second one and the
   * page ends up showing a range the inputs no longer say.
   */
  private readonly reload$ = new Subject<{ start: string; end: string }>();

  ngOnInit(): void {
    this.reload$.pipe(
      switchMap(range => this.http.get<ApiResponse<RunData>>(`${API_BASE}/report.json/runs`, {
        params: { startDate: range.start, endDate: range.end },
      }).pipe(
        // Caught INSIDE the switchMap, and that placement is the whole point. An error handler
        // on the outer subscribe terminates the subject for good: the first failed request
        // would take the pipeline with it, and every later Refresh, Try again and date edit
        // would push into a dead stream -- spinner on, no request, forever. Failing the inner
        // observable instead leaves the outer one alive for the next attempt.
        catchError(err => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Could not read the runs for that range.');
          return of(null);
        }),
      )),
    ).subscribe(response => {
      if (!response) return;
      this.loading.set(false);
      if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
      // Enriched once, here, so the builder below inherits the Job dimension without a
      // second pass over the rows.
      const payload = withJobDimension(response.data ?? EMPTY);
      this.rawData.set(payload);
      this.truncated.set(!!payload.truncated);
      if (payload.truncated) this.toast.info(response.message);
      this.loadFailures();
      this.loadPriorPeriod();
      this.loadAiUsage();
    });
    this.load();
  }

  load(): void {
    if (!this.rangeValid()) {
      this.error.set('Pick a start and end date, with the start on or before the end.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.reload$.next({ start: this.startDate(), end: this.endDate() });
  }

  /** The way out of a range that can never load. */
  resetRange(): void {
    this.startDate.set(isoDaysAgo(30));
    this.endDate.set(isoDaysAgo(0));
    this.load();
  }

  setStart(value: string): void { this.startDate.set(value); this.load(); }
  setEnd(value: string): void { this.endDate.set(value); this.load(); }

  /**
   * The failure detail, from the message log rather than the runs feed.
   *
   * The runs payload carries no error text and no job id -- it is dictionary-encoded for size,
   * and free text on fifty thousand rows would defeat that. fetchLogs already returns
   * jobStatusMessage and jobId per run and is filterable by status, so asking it for just the
   * failed runs in the same range gets both without widening the wide query or changing the
   * backend at all.
   *
   * It is unpaged and uncapped, which is exactly why it is only ever called narrowed to
   * failures, and only when there are some.
   */
  retryFailures(): void { this.loadFailures(); }

  private loadFailures(): void {
    /*
     * The UNFILTERED feed decides whether to fetch, because the fetch is unfiltered.
     *
     * This tested counts(), which reads the filtered data(). The request below carries only the
     * date range -- no task, job, status, owner or workspace -- so a filter that happened to
     * exclude every failure skipped the fetch AND cleared the table. Clearing is the half that
     * bites: loadFailures runs on reload, so the detail stayed empty for every other filter until
     * the next reload, and nothing on screen said the table was stale rather than empty.
     *
     * What the reader SEES is narrowed afterwards by visibleFailures(), which is where the filter
     * belongs -- one predicate over rows already in hand.
     */
    const raw = this.rawData();
    const anyFailed = raw.rows.some(row => FAILED.has(String(raw.status[row[1]] ?? '')));
    if (!anyFailed) { this.failures.set([]); return; }
    this.failuresLoading.set(true);
    this.failuresError.set('');
    // The range this answer belongs to, as the cost, usage and prior-period reads already do:
    // two quick range changes could otherwise land the older answer last.
    const asked = { start: this.startDate(), end: this.endDate() };
    const stale = () => asked.start !== this.startDate() || asked.end !== this.endDate();
    this.http.post<ApiResponse<{ sourceJobQueues?: QueueLog[] }>>(
      `${API_BASE}/message.json/fetchLogs`,
      { fromDate: this.startDate(), toDate: this.endDate(), jobStatuses: [...FAILED] },
    ).subscribe({
      next: response => {
        this.failuresLoading.set(false);
        if (stale()) return;
        if (response.status !== API_SUCCESS) {
          this.failuresError.set(response.message || 'Could not read the failure detail.');
          return;
        }
        const logs = response.data?.sourceJobQueues ?? [];
        this.failures.set(logs
          .filter(log => FAILED.has(String(log.jobStatus ?? '')))
          .map(log => ({
            jobQueueId: Number(log.jobQueueId ?? 0),
            jobId: Number(log.jobId ?? 0),
            job: this.runIndex().get(Number(log.jobQueueId ?? 0))?.job || '—',
            task: this.runIndex().get(Number(log.jobQueueId ?? 0))?.task || '',
            status: String(log.jobStatus ?? ''),
            message: (log.jobStatusMessage ?? '').trim() || 'No message was recorded.',
            when: (log.startTime ?? log.dateCreated ?? '').replace('T', ' ').slice(0, 19),
            seconds: secondsBetween(log.startTime, log.endTime),
          }))
          .sort((a, b) => b.jobQueueId - a.jobQueueId));
      },
      error: err => {
        this.failuresLoading.set(false);
        if (stale()) return;
        this.failuresError.set(err?.error?.message || 'Could not read the failure detail.');
      },
    });
  }

  /**
   * The same query over the window immediately before this one, so the tiles can say whether
   * things are getting better or worse. Nothing else on the page uses it, and when it comes
   * back empty the tiles say that rather than inventing a change.
   */
  /**
   * What the model calls in this range cost, from the meter -- the ai.* lines priced with the
   * card in effect. Admins only: the billing read refuses everyone else, and a tenant user's
   * report is about runs, not money.
   */
  readonly aiCost = signal<{ amount: number; currency: string; lines: MeterLine[] } | null>(null);
  private loadAiCost(): void {
    if (!this.auth.isTenantAdmin()) return;
    const asked = { start: this.startDate(), end: this.endDate() };
    this.billingApi.usageByMeter({ from: asked.start, to: asked.end }).subscribe({
      next: r => {
        if (asked.start !== this.startDate() || asked.end !== this.endDate()) return;
        if (r.status !== API_SUCCESS || !r.data) { this.aiCost.set(null); return; }
        const lines = (r.data.rows ?? []).filter(l => l.meter.startsWith('ai.')).map(l => ({ ...l, amount: Number(l.amount), quantity: Number(l.quantity) }));
        this.aiCost.set({ amount: lines.reduce((n, l) => n + l.amount, 0), currency: r.data.rateCard?.currency ?? 'USD', lines });
      },
      error: () => this.aiCost.set(null),
    });
  }
  aiCostText(): string { const c = this.aiCost(); return c ? formatMoney(c.amount, c.currency) : ''; }
  readonly formatMoney = formatMoney;

  /** Model calls per prompt for the same range; a page without any AI simply has no section. */
  loadAiUsage(): void {
    const asked = { start: this.startDate(), end: this.endDate() };
    this.loadAiCost();
    this.aiUsageLoading.set(true);
    this.aiUsageError.set('');
    this.http.get<ApiResponse<AiUsageRow[]>>(`${API_BASE}/aiPrompt.json/usage`, { params: { from: asked.start, to: asked.end } }).subscribe({
      next: response => {
        if (asked.start !== this.startDate() || asked.end !== this.endDate()) return;
        this.aiUsageLoading.set(false);
        if (response.status !== API_SUCCESS) {
          this.aiUsage.set([]);
          this.aiUsageError.set(response.message || 'Could not read the model calls for this range.');
          return;
        }
        this.aiUsage.set(response.data ?? []);
      },
      error: err => {
        if (asked.start !== this.startDate() || asked.end !== this.endDate()) return;
        this.aiUsageLoading.set(false);
        this.aiUsage.set([]);
        this.aiUsageError.set(err?.error?.message || 'Could not read the model calls for this range.');
      },
    });
  }

  private loadPriorPeriod(): void {
    this.priorRuns.set(null);
    this.priorSuccessRate.set(null);
    const start = new Date(this.startDate() + 'T00:00:00Z');
    const end = new Date(this.endDate() + 'T00:00:00Z');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const priorEnd = new Date(start.getTime() - 86_400_000);
    const priorStart = new Date(priorEnd.getTime() - (days - 1) * 86_400_000);

    // The range this answer will belong to. Two quick date edits fire two of these, and the
    // slower one must not overwrite the newer one's deltas.
    const asked = { start: this.startDate(), end: this.endDate() };
    this.http.get<ApiResponse<RunData>>(`${API_BASE}/report.json/runs`, {
      params: {
        startDate: priorStart.toISOString().slice(0, 10),
        endDate: priorEnd.toISOString().slice(0, 10),
      },
    }).subscribe({
      next: response => {
        if (asked.start !== this.startDate() || asked.end !== this.endDate()) return;
        if (response.status !== API_SUCCESS || !response.data) return;
        const prior = response.data;
        // A capped prior window reports exactly MAX_ROWS, so a delta against it would compare
        // against a number the server chose rather than one that happened. No comparison is
        // better than a fabricated one.
        if (prior.truncated) return;
        const done = prior.status.indexOf('Completed');
        const completed = prior.rows.filter(r => r[1] === done).length;
        const failedIdx = prior.status
          .map((label, i) => (FAILED.has(label) ? i : -1)).filter(i => i >= 0);
        const failed = prior.rows.filter(r => failedIdx.includes(r[1])).length;
        const settled = completed + failed;
        this.priorRuns.set(prior.rows.length);
        // Same settled denominator as the current period, or the two are not comparable.
        this.priorSuccessRate.set(settled ? Math.round((completed / settled) * 100) : null);
      },
      error: () => { /* a missing comparison is not an error worth interrupting the page for */ },
    });
  }

  // ---- drill-down ---------------------------------------------------------------------

  /**
   * Every drill target here is a route that resolves to something real.
   *
   * The run-log link used to be withheld on the grounds that job_audit_logs had no rows, so the
   * link would always open an empty page. That is no longer true: the worker's log lines were
   * being buffered on one JobStateClient and flushed from a different one, and with that fixed
   * the table now holds 205 lines covering all 50 runs -- including every failed one, checked
   * per status before this control was added. The rule is unchanged; only the fact was stale.
   */
  openJobHistory(jobId: number): void {
    if (jobId) this.router.navigate(['/operations/jobs', jobId, 'history']);
  }

  openRunLogs(failure: FailureRow): void {
    if (failure.jobId && failure.jobQueueId) {
      this.router.navigate(['/operations/jobs', failure.jobId, 'runs', failure.jobQueueId, 'logs']);
    }
  }

  /**
   * Clicking a day narrows the range to that day.
   *
   * Not a new "day filter": the page already has a date range and this IS a date range of one
   * day, so the two cannot disagree and the URL-less state stays in one place. It refetches,
   * which is right -- a single day may contain runs the capped range did not return.
   */
  focusDay(bar: Bar): void {
    const day = typeof bar?.meta === 'string' ? bar.meta : '';
    if (!day || !bar.value) return;
    this.startDate.set(day);
    this.endDate.set(day);
    this.load();
  }

  /** Clicking a task in the health table filters the whole page to it. */
  focusTask(task: string): void {
    this.taskFilter.set(this.taskFilter() === task ? '' : task);
  }

  toggleBuilder(): void { this.showBuilder.update(open => !open); }
}

function secondsBetween(from?: string, to?: string): number {
  if (!from || !to) return NO_DURATION;
  const a = Date.parse(from), b = Date.parse(to);
  if (isNaN(a) || isNaN(b)) return NO_DURATION;
  return Math.round((b - a) / 1000);
}

/**
 * A date `days` ago, in the viewer's own day.
 *
 * Subtracting in local time and then formatting with toISOString mixes two calendars: west of
 * UTC in the evening the two disagree and the default range silently starts and ends a day
 * early. Formatting from the local components keeps the range the one the reader would name.
 */
function isoDaysAgo(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() - days);
  const month = String(at.getMonth() + 1).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${String(at.getDate()).padStart(2, '0')}`;
}
