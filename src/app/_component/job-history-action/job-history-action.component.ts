import { Component, OnInit, OnDestroy } from '@angular/core';
import { ApiCode } from '../../_models/index';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertService, HomeService } from '@/_services';
import { SpinnerService, SearchFilterPipe } from '@/_helpers';
import { first } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { EChartOption } from 'echarts';

/** One bar of a column-header mini histogram (Kaggle-CSV-style "chart on top of each column")
 * -- same pattern as queue-message.component.ts's Q-Message table, applied here to this page's
 * own (per-job) Queue Message table. Every possible category for the column is always included
 * (even at 0), so the chart never collapses into a single flat-colored strip whenever a column
 * happens to be all-one-value (which most of these columns usually are). */
interface ColumnBarSegment {
  label: string;
  count: number;
  pct: number;
  color: string;
}

// keyed lowercase so the color matches regardless of the casing the API returns -- same
// palette as the status-* pill classes and queue-message.component.ts's Queue Status chart,
// so a status is always the same color everywhere in the app.
const JOB_STATUS_COLOR: { [key: string]: string } = {
  'queue': '#0c7c8c',
  'start': '#4f46e5',
  'running': '#b5730a',
  'failed': '#c0392b',
  'completed': '#1d7a3f',
  'skip': '#1c6ea4',
  'interrupt': '#6a3bbf',
  'inflight': '#0c7c8c'
};
const JOB_STATUS_ORDER = ['Queue', 'Start', 'Running', 'Failed', 'Completed', 'Skip', 'Interrupt'];
const PILL_SUCCESS_COLOR = '#1d7a3f';
const PILL_DANGER_COLOR = '#c0392b';
const FILL_COLOR = '#4f46e5';
const EMPTY_COLOR = '#d7dce1';
// Job Id has no fixed status-like palette (any number of distinct ids can show up on this page
// when it's loaded without a jobId -- e.g. a heatmap-cell drill-down covering several jobs at
// once) -- cycles through the app's existing accent colors instead.
const CATEGORY_PALETTE = ['#4f46e5', '#0c7c8c', '#b5730a', '#c0392b', '#1d7a3f', '#6a3bbf', '#1c6ea4', '#e67e22'];
const JOB_ID_PIE_TOP_N = 8;

/** Shortens a value-axis tick label so it still fits the narrow (~196px) Column Insights chart
 * boxes -- "1500" -> "1.5k" instead of "1,500", which is exactly wide enough to push these
 * charts' ticks from overlapping into readable at their existing 8px font size. Same helper as
 * queue-message.component.ts's (same chart, duplicated on this page for a single job's own
 * history instead of the search results table). */
function compactAxisNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    const thousands = value / 1000;
    return (Number.isInteger(thousands) ? thousands : Math.round(thousands * 10) / 10) + 'k';
  }
  return String(value);
}

@Component({
  selector: 'job-history-action',
  templateUrl: 'job-history-action.component.html'
})
export class JobHistoryActionComponent implements OnInit, OnDestroy {

  public sourceJob: any;
  public sourceJobQueues: any;
  public sourceJobStatistics: any;
  public searchQMessageForm: any = '';
  // Job Status dropdown filter, applied on top of the free-text search box above (see
  // filteredQueueDatas) -- same JOB_STATUS_ORDER used by the Job Status column chart/pill
  // colors, so the dropdown options always match what the table/charts can actually show.
  public readonly jobStatusFilterOptions = JOB_STATUS_ORDER;
  public filterJobStatus: string = '';
  public ERROR: any = 'Error';
  public homePageId: any = '';
  public pipelineId: any = '';
  // Group-by charts (Job Id/Status/Run Manual/Skip Manual/Q Send pies + Start/End/Skip Time
  // trend lines) -- same Kaggle-style, on-by-default strip as the Q-Message page's equivalent.
  public showGroupByCharts = true;
  /** Stored so ngOnDestroy can unsubscribe -- queryParamMap is a long-lived route Observable,
   * leaving it subscribed past the component's lifetime leaks a dangling subscriber on every
   * navigation away from this page. */
  private queryParamMapSubscription: Subscription;

  constructor(private router: Router,
    private _activatedRoute: ActivatedRoute,
    private alertService: AlertService,
    private spinnerService: SpinnerService,
    private homeService: HomeService,
    private searchFilterPipe: SearchFilterPipe) {
    this.queryParamMapSubscription = this._activatedRoute.queryParamMap
      .subscribe(params => {
        this.weeklyHrRunningStatisticsDimensionDetail(params?.get('targetDate'),
          params?.get('targetHr'), params?.get('jobStatus'), params?.get('jobId'));
      });
  }

  ngOnInit() {
  }

  ngOnDestroy(): void {
    this.queryParamMapSubscription?.unsubscribe();
  }

  public weeklyHrRunningStatisticsDimensionDetail(targetDate: any, targetHr: any, jobStatus: any, jobId: any): void {
    this.spinnerService.show();
    this.homeService.weeklyHrRunningStatisticsDimensionDetail(targetDate, targetHr, jobStatus, jobId)
      .pipe(first())
      .subscribe((response) => {
        if (response.status === ApiCode.SUCCESS) {
          this.sourceJob = response.data?.sourceJob;
          this.homePageId = this.sourceJob?.taskDetail?.homePageId;
          if (this.sourceJob?.taskDetail?.pipelineId) {
            this.pipelineId = '(Pipeline ID:' + this.sourceJob?.taskDetail?.pipelineId + ')';
          }
          this.sourceJobQueues = response.data?.sourceJobQueues;
          this.sourceJobStatistics = response.data?.sourceJobStatistics;
          this.spinnerService.hide();
        } else {
          this.spinnerService.hide();
          this.alertService.showError(response.message, this.ERROR);
        }
      }, (error) => {
        this.spinnerService.hide();
        this.alertService.showError(error, this.ERROR);
      });
  }

  public get taskTopic(): string {
    return this.parseTopicPartition().topic;
  }

  public get taskPartitions(): string {
    return this.parseTopicPartition().partitions;
  }

  // queueTopicPartition is stored as "topic=<name>&partitions=[<list>]" — parse it for display
  private parseTopicPartition(): { topic: string; partitions: string } {
    const raw = String(this.sourceJob?.taskDetail?.sourceTaskType?.queueTopicPartition || '');
    const match = raw.match(/topic=([^&]*)&partitions=\[(.*?)\]/);
    if (match) {
      return { topic: match[1] || '-', partitions: match[2] || '-' };
    }
    return { topic: raw || '-', partitions: '-' };
  }

  // --- Column-header mini charts (Kaggle-CSV-style distribution per column) ---
  // All computed off filteredQueueDatas (the same rows the search box leaves in the table
  // below), so the bars stay in sync with whatever's actually visible.

  /** Same rows the table itself renders (searchFilter applied) -- single source of truth for
   * both the table body and every column's mini chart. */
  public get filteredQueueDatas(): any[] {
    const searched = this.searchFilterPipe.transform(this.sourceJobQueues, this.searchQMessageForm) || [];
    if (!this.filterJobStatus) {
      return searched;
    }
    return searched.filter((row: any) => row.jobStatus === this.filterJobStatus);
  }

  // --- Run history chart ---
  // This job's full run history had no chart at all -- a bar per run (duration, colored by
  // status, oldest-to-newest left-to-right) turns "scroll a table of timestamps" into "see the
  // pattern at a glance": whether runs are speeding up/slowing down, and which ones failed.
  // Same shape/behavior as the "Queue List (Run History)" chart on the Job List's row-expand
  // panel (source-job.component.ts) -- reused here for a single job's full history instead of
  // just its most recent runs, so the two read as the same feature everywhere they appear.
  public get runHistoryChartOptions(): EChartOption | null {
    const runs = this.filteredQueueDatas
      .filter((q: any) => q.startTime && q.endTime)
      .slice()
      .reverse();
    if (!runs.length) {
      return null;
    }
    const categories = runs.map((q: any) => `#${q.jobQueueId}`);
    const durations = runs.map((q: any) => {
      const minutes = (new Date(q.endTime).getTime() - new Date(q.startTime).getTime()) / 60000;
      return Math.max(0, Math.round(minutes * 10) / 10);
    });
    const colors = runs.map((q: any) => JOB_STATUS_COLOR[String(q.jobStatus || '').trim().toLowerCase()] || FILL_COLOR);
    return {
      grid: { left: 45, right: 16, top: 24, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const run = runs[p.dataIndex];
          return `Run ${p.name}<br/>${run.jobStatus}: ${p.value} min<br/>` +
            `Start: ${this.formatDateTime(run.startTime)}<br/>` +
            `End: ${this.formatDateTime(run.endTime)}`;
        }
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisTick: { alignWithLabel: true },
        // Default 12px font left barely any breathing room between labels even at a sparse
        // interval -- on the multi-job drill-down view (up to hundreds of runs, e.g. a
        // heatmap-cell's worth of queue messages across every job that ran that hour) they ran
        // together into an unreadable smear. Fewer, smaller labels fixes it the same way as the
        // Column Insights charts' axisLabel.fontSize.
        axisLabel: { interval: Math.max(0, Math.ceil(categories.length / 15) - 1), fontSize: 9 }
      },
      yAxis: {
        type: 'value',
        name: 'min',
        nameTextStyle: { color: '#7b8794' }
      },
      series: [{
        type: 'bar',
        // jobId travels with each bar's own data point (not just read off this.sourceJob at
        // click time) because this page can load scoped to a single job (sourceJob set, every
        // run has that same jobId) OR as a multi-job heatmap-cell drill-down (no jobId in the
        // URL at all -- see the constructor's queryParamMap subscribe -- so this.sourceJob is
        // never set and runs can each belong to a different job). Falling back to
        // this.sourceJob?.jobId there silently sent "jobId=undefined" (dropped by the router
        // entirely, not even sent as a param) to Job Logs, which then queried the backend with
        // the literal string "null" for jobId and failed -- see onRunHistoryChartClick below.
        data: durations.map((d: number, i: number) => ({ value: d, itemStyle: { color: colors[i] }, jobId: runs[i].jobId })),
        barMaxWidth: 28,
        // Bars navigate to that run's Job Logs on click (onRunHistoryChartClick) -- pointer
        // cursor is the only hint of that, since this chart div is shared styling with other,
        // non-clickable echarts panels elsewhere in the app.
        cursor: 'pointer'
      }]
    };
  }

  /** Run History chart bar click -> that run's Job Logs -- categories are literally `#${jobQueueId}`
   * (see runHistoryChartOptions above), so the clicked bar's own category label is the jobQueueId,
   * no need to keep a separate index-to-run lookup in sync with the getter. jobId comes off the
   * clicked bar's own data (see runHistoryChartOptions) rather than this.sourceJob, since that's
   * unset on the multi-job drill-down view this page also renders. */
  public onRunHistoryChartClick(event: any): void {
    const jobQueueId = String(event?.name || '').replace(/^#/, '');
    const jobId = event?.data?.jobId ?? this.sourceJob?.jobId;
    if (!jobQueueId || !jobId) {
      return;
    }
    this.router.navigate(['jobList/jobLogs'], {
      queryParams: { jobId, jobQueueId, from: 'jobHistory' }
    });
  }

  /** Formats an ISO datetime string as 'yyyy-MM-dd HH:mm:ss' -- matches the DatePipe format
   * used everywhere else in this app, but this one's built inline (no Angular pipe injection)
   * since it only ever runs inside an echarts tooltip formatter callback. */
  private formatDateTime(value: any): string {
    if (!value) {
      return '-';
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      return '-';
    }
    const pad = (n: number) => n < 10 ? '0' + n : '' + n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /** Job Status column -- fixed bar per status (same order/colors as the status-* pills in the
   * table body and the Queue Status chart on the Q-Message page), so even a run of all-Completed
   * rows still reads as a histogram (one tall bar + flat baseline for the rest) instead of a
   * plain-colored strip. */
  public get jobStatusColumnStats(): ColumnBarSegment[] {
    return this.categoricalColumnStats(
      (row: any) => row.jobStatus,
      JOB_STATUS_ORDER,
      (label) => JOB_STATUS_COLOR[String(label).trim().toLowerCase()] || FILL_COLOR
    );
  }

  /** Run Manual / Skip Manual / Q Send -- always both True and False bars, same green/red the
   * table body's pills already use for these fields. (Q Send/jobSend has no table column on
   * this page, but the field is on the same SourceJobQueueDto rows -- the group-by chart below
   * still uses it, matching the Q-Message page's equivalent chart.) */
  public booleanColumnStats(field: 'runManual' | 'skipManual' | 'jobSend'): ColumnBarSegment[] {
    return this.categoricalColumnStats(
      (row: any) => (row[field] === true ? 'True' : 'False'),
      ['True', 'False'],
      (label) => (label === 'True' ? PILL_SUCCESS_COLOR : PILL_DANGER_COLOR)
    );
  }

  /** Start Time / End Time / Skip Time columns -- these are only set once a run reaches that
   * stage, so "Filled vs Empty" is more informative than trying to histogram raw timestamps in
   * a header-sized bar (e.g. a mostly-empty End Time bar means most rows are still in flight). */
  public dateFillColumnStats(field: 'startTime' | 'endTime' | 'skipTime'): ColumnBarSegment[] {
    return this.categoricalColumnStats(
      (row: any) => (row[field] ? 'Filled' : 'Empty'),
      ['Filled', 'Empty'],
      (label) => (label === 'Filled' ? FILL_COLOR : EMPTY_COLOR)
    );
  }

  /** Shared tally-and-color-map builder behind jobStatusColumnStats/booleanColumnStats/
   * dateFillColumnStats -- counts filteredQueueDatas by whatever key valueOf(row) returns, then
   * returns one bar per entry in categoryOrder (0-count categories included) so the chart's
   * shape never depends on which values happen to be present right now. */
  private categoricalColumnStats(
    valueOf: (row: any) => any, categoryOrder: string[], colorOf: (label: string) => string
  ): ColumnBarSegment[] {
    const rows = this.filteredQueueDatas;
    const counts = new Map<string, number>();
    let total = 0;
    rows.forEach((row: any) => {
      const raw = valueOf(row);
      if (raw === null || raw === undefined || raw === '') {
        return;
      }
      const label = String(raw);
      counts.set(label, (counts.get(label) || 0) + 1);
      total++;
    });
    if (!total) {
      return [];
    }
    return categoryOrder.map((label) => {
      const count = counts.get(label) || 0;
      return { label, count, pct: (count / total) * 100, color: colorOf(label) };
    });
  }

  // --- Group-by charts (pie for categorical/boolean fields, line for the three timestamp
  // fields) -- same filteredQueueDatas source as the column-header mini bars above, just
  // rendered as full-size charts instead of a header-sized strip. Every getter returns null
  // (not an empty chart) when there's nothing to show, so *ngIf can skip the panel entirely. ---

  /** Renders any of the categorical stats above (jobStatusColumnStats) as a donut pie --
   * reuses their counts as-is instead of re-tallying. */
  private toPieOptions(title: string, segments: ColumnBarSegment[]): EChartOption | null {
    const data = segments.filter((s) => s.count > 0);
    if (!data.length) {
      return null;
    }
    return {
      title: { text: title, left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 600, color: '#36424d' } },
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      // Legend on the right (not stacked below the ring) -- see the matching comment on
      // queue-message.component.ts's toPieOptions (same chart, duplicated on this page). A
      // bottom legend forced the pie's radius off a squeezed vertical strip while the box's
      // actual width sat mostly blank on both sides of a small, centered donut; a vertical
      // legend spends that width instead and lets the pie use the box's full height.
      legend: {
        orient: 'vertical', right: 4, top: 20, bottom: 4,
        type: data.length > 6 ? 'scroll' : 'plain',
        pageIconSize: 8, pageTextStyle: { fontSize: 8 },
        textStyle: { fontSize: 9 }, itemWidth: 8, itemHeight: 8, itemGap: 6
      },
      series: [{
        type: 'pie',
        center: ['32%', '56%'],
        radius: ['46%', '72%'],
        top: 20,
        bottom: 4,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: data.map((s) => ({ name: s.label, value: s.count, itemStyle: { color: s.color } }))
      }]
    };
  }

  public get jobStatusPieOptions(): EChartOption | null {
    return this.toPieOptions('Job Status', this.jobStatusColumnStats);
  }

  /** Ranked horizontal bar -- see the matching comment on queue-message.component.ts's
   * toRankedBarOptions (same chart, duplicated on this page). Used for Job Id instead of
   * toPieOptions above -- a pie only reads clearly up to 4-5 slices, and this page's Job Id
   * breakdown (the multi-job heatmap-drill-down case) can have dozens. */
  private toRankedBarOptions(title: string, segments: ColumnBarSegment[]): EChartOption | null {
    const data = segments.filter((s) => s.count > 0);
    if (!data.length) {
      return null;
    }
    const ordered = data.slice().reverse();
    return {
      title: { text: title, left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 600, color: '#36424d' } },
      tooltip: { trigger: 'item', formatter: '{b}: {c}' },
      grid: { left: 4, right: 6, top: 22, bottom: 4, containLabel: true },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category',
        data: ordered.map((s) => s.label),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#36424d' }
      },
      series: [{
        type: 'bar',
        barMaxWidth: 12,
        data: ordered.map((s) => ({ value: s.count, itemStyle: { color: s.color } })),
        label: { show: true, position: 'right', fontSize: 9, color: '#7b8794' }
      }]
    };
  }

  /** Run Manual / Skip Manual / Q Send as one 100%-stacked horizontal bar (True vs False per
   * field) instead of three separate 2-slice donuts -- see the Q-Message page's identical
   * chart for the full reasoning; kept consistent between the two pages on purpose. */
  public get booleanFieldsChartOptions(): EChartOption | null {
    const fields: { key: 'runManual' | 'skipManual' | 'jobSend'; label: string }[] = [
      { key: 'runManual', label: 'Run Manual' },
      { key: 'skipManual', label: 'Skip Manual' },
      { key: 'jobSend', label: 'Q Send' }
    ];
    const rows = this.filteredQueueDatas;
    const labels: string[] = [];
    const trueData: number[] = [];
    const falseData: number[] = [];
    fields.forEach((f) => {
      const trueCount = rows.filter((r: any) => r[f.key] === true).length;
      const falseCount = rows.filter((r: any) => r[f.key] === false).length;
      if (trueCount + falseCount === 0) {
        return;
      }
      labels.push(f.label);
      trueData.push(trueCount);
      falseData.push(falseCount);
    });
    if (!labels.length) {
      return null;
    }
    return {
      title: { text: 'Run / Skip / Q Send', left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 600, color: '#36424d' } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 2, data: ['True', 'False'], textStyle: { fontSize: 9 }, itemWidth: 8, itemHeight: 8, itemGap: 10 },
      grid: { left: 66, right: 14, top: 30, bottom: 26, containLabel: true },
      // splitNumber+formatter: see compactAxisNumber above -- this chart's box is one of up to
      // three sharing a row (~196px wide), too narrow for the default 5-6 value-axis ticks.
      xAxis: { type: 'value', splitNumber: 3, axisLabel: { fontSize: 8, formatter: compactAxisNumber } },
      yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 9 } },
      series: [
        { name: 'True', type: 'bar', stack: 'total', barMaxWidth: 16, data: trueData, itemStyle: { color: PILL_SUCCESS_COLOR } },
        { name: 'False', type: 'bar', stack: 'total', barMaxWidth: 16, data: falseData, itemStyle: { color: PILL_DANGER_COLOR } }
      ]
    };
  }

  /** Job Id -- this page is usually one job's own history (jobId fixed in the URL, sourceJob
   * set), where this pie would always be a single 100% slice -- pure wasted chart-box space
   * next to the "Job: 1191 - ..." heading already shown above, since it can never say anything
   * that heading doesn't. Skipped entirely in that case; only rendered for the other way this
   * page loads, a heatmap-cell drill-down with no jobId at all (sourceJob unset) covering
   * however many jobs ran in that hour, where it's an actual breakdown. Tallies
   * filteredQueueDatas itself (not categoricalColumnStats, which needs a fixed categoryOrder)
   * and caps at the top 8 by row count, folding the rest into "Other" so a wide drill-down with
   * dozens of jobs still reads as a chart instead of a ring of slivers. */
  public get jobIdChartOptions(): EChartOption | null {
    if (this.sourceJob) {
      return null;
    }
    const counts = new Map<string, number>();
    this.filteredQueueDatas.forEach((row: any) => {
      if (row.jobId === null || row.jobId === undefined) {
        return;
      }
      const label = String(row.jobId);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    if (!counts.size || counts.size === 1) {
      // Still just a single slice even on the drill-down path (e.g. only one job ran in that
      // hour) -- same reasoning as the sourceJob-scoped case above, so skip it here too.
      return null;
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, JOB_ID_PIE_TOP_N);
    const rest = sorted.slice(JOB_ID_PIE_TOP_N);
    const restTotal = rest.reduce((sum, [, count]) => sum + count, 0);
    const segments: ColumnBarSegment[] = top.map(([label, count], i) => ({
      label: `Job ${label}`, count, pct: 0, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]
    }));
    if (restTotal > 0) {
      segments.push({ label: `Other (${rest.length} jobs)`, count: restTotal, pct: 0, color: '#9aa5ac' });
    }
    return this.toRankedBarOptions('Job Id', segments);
  }

  // Start Time / End Time comparison across jobs already exists on this page as
  // runHistoryChartOptions (above) -- a duration-per-run bar, colored by status, clickable
  // through to that run's logs. No separate Start/End/Skip Time chart needed here; Skip Time
  // is dropped rather than replaced (skips are rare, and "rows per day" never said anything a
  // real question would ask).

  public get hasActiveFilters(): boolean {
    return !!(this.filterJobStatus || this.searchQMessageForm);
  }

  public clearFilters(): void {
    this.filterJobStatus = '';
    this.searchQMessageForm = '';
  }

  public logsDeatilQMessage(queueData: any, index: any): any {
    this.router.navigate(['jobList/jobLogs'],
      {
        queryParams: {
          jobId: queueData?.jobId,
          jobQueueId: queueData?.jobQueueId
        }
      });
  }


}
