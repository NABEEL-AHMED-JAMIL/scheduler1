import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AlertService, SettingService } from '@/_services';
import { SpinnerService, SearchFilterPipe } from '@/_helpers';
import { QMessage } from '@/_models/index';
import { first } from 'rxjs/operators';
import { EChartOption } from 'echarts';
import { ApiCode, NameValue } from '@/_models';
import { DatePipe } from '@angular/common';

/** One bar of a column-header mini histogram (Kaggle-CSV-style "chart on top of each column")
 * -- height is this category's share of the column's non-null rows, 0-100. Every possible
 * category for the column is always included (even at 0), so the chart always reads as a
 * multi-bar histogram instead of collapsing into a single flat-colored strip whenever a
 * column happens to be all-one-value (which most of these columns usually are). */
interface ColumnBarSegment {
  label: string;
  count: number;
  pct: number;
  color: string;
}

// keyed lowercase so the color matches regardless of the casing the API returns -- shared by
// the "Queue Status" chart (drawJobRunningStatistics) and the Job Status column's mini bar,
// so a status is always the same color everywhere on this page.
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
// Job Id has no fixed status-like palette (any number of distinct ids can show up) -- cycles
// through the app's existing accent colors instead, same approach as any other "arbitrary
// category" chart in the app.
const CATEGORY_PALETTE = ['#4f46e5', '#0c7c8c', '#b5730a', '#c0392b', '#1d7a3f', '#6a3bbf', '#1c6ea4', '#e67e22'];
const JOB_ID_PIE_TOP_N = 8;

/** Shortens a value-axis tick label so it still fits the narrow (~196px) Column Insights chart
 * boxes -- "1500" -> "1.5k" instead of "1,500", which is exactly wide enough to push these
 * charts' ticks from overlapping into readable at their existing 8px font size. */
function compactAxisNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    const thousands = value / 1000;
    return (Number.isInteger(thousands) ? thousands : Math.round(thousands * 10) / 10) + 'k';
  }
  return String(value);
}


@Component({
  selector: 'queue-message',
  templateUrl: 'queue-message.component.html',
  providers: [DatePipe]
})
export class QueueMessageComponent implements OnInit {

    public ERROR: string = 'Error';
    public searchQMessageForm: any = '';
    public qMessageSearcForm!: FormGroup;
    public sourceJobRunningStatistics!: EChartOption;
    public jobStatusList: any = ['Queue', 'Start', 'Running', 'Failed', 'Completed', 'Skip', 'Interrupt'];
    public jobRunningData: NameValue[] = [
      {
        value: 0,
        name: 'Queue'
      },
      {
        value: 0,
        name: 'Start'
      },
      {
        value: 0,
        name: 'Running'
      },
      {
        value: 0,
        name: 'Failed'
      },
      {
        value: 0,
        name: 'Completed'
      },
      {
        value: 0,
        name: 'Skip'
      },
      {
        value: 0,
        name: 'Interrupt'
      }
    ];
  public queueDatas: QMessage[] = [];
  // Group-by charts (Job Id/Status/Run Manual/Skip Manual/Q Send pies + Start/End/Skip Time
  // trend lines) -- a Kaggle-style column-profile strip docked right above the table, on by
  // default (small enough now not to need hiding); the toggle stays for anyone who wants the
  // extra vertical room back.
  public showGroupByCharts = true;
  public today_date: any;
  public last_7th_date: any;

	constructor(
      private fb: FormBuilder,
      public datepipe: DatePipe,
      private alertService: AlertService,
      private spinnerService: SpinnerService,
      private settingService: SettingService,
      private router: Router,
      private searchFilterPipe: SearchFilterPipe) {
	}

    ngOnInit() {
      let todayDate = new Date();
      this.today_date = this.datepipe.transform(todayDate, 'yyyy-MM-dd');
      todayDate.setDate(todayDate.getDate() - 6);
      this.last_7th_date = this.datepipe.transform(todayDate, 'yyyy-MM-dd');
      this.addQMessageFormInit();
    }

    public addQMessageFormInit(): any {
        this.fetchLogs({
            'fromDate': this.last_7th_date,
            'toDate': this.today_date,
            'jobStatuses': ['Queue']
        });
        this.spinnerService.show();
        this.qMessageSearcForm = this.fb.group({
            jobQId: [],
            fromDate: [this.last_7th_date],
            toDate: [this.today_date],
            jobStatuses: ['Queue'],
            jobId: []
        });
        this.spinnerService.hide();
	}

   
    public submitQMessageFilter(): void {
      const jobQIdControl = this.qMessageSearcForm.get('jobQId');
      const fromDateControl = this.qMessageSearcForm.get('fromDate');
      const toDateControl = this.qMessageSearcForm.get('toDate');
      const jobStatusesControl = this.qMessageSearcForm.get('jobStatuses');
      const jobIdControl = this.qMessageSearcForm.get('jobId');
      let payload = {
        jobQId: jobQIdControl?.value ? jobQIdControl.value.split(',').map(Number) : null,
        fromDate: fromDateControl?.value,
        toDate: toDateControl?.value,
        jobStatuses: jobStatusesControl?.value ? [jobStatusesControl.value] : null,
        jobId: jobIdControl?.value ? jobIdControl.value.split(',').map(Number) : null
      }
      this.fetchLogs(payload);
    }

    public fetchLogs(payload: any): void {
      this.spinnerService.show();
      this.settingService.fetchLogs(payload)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.spinnerService.hide();
          this.queueDatas = response.data.sourceJobQueues;
          if (response.data.jobStatusStatistic) {
              this.drawJobRunningStatistics(response.data.jobStatusStatistic);
          } else {
              this.drawJobRunningStatistics(this.jobRunningData);
          }
        } else {
          this.spinnerService.hide();
          this.alertService.showError(response.message, this.ERROR);
        }
      }, (error) => {
        this.spinnerService.hide();
        this.alertService.showError(error, this.ERROR);
      });
    }

    // --- Column-header mini charts (Kaggle-CSV-style distribution per column) ---
    // All computed off filteredQueueDatas (the same rows the search box leaves in the table
    // below), so the bars stay in sync with whatever's actually visible instead of the full
    // unfiltered fetch.

    /** Same rows the table itself renders (searchFilter applied) -- single source of truth for
     * both the table body and every column's mini chart. */
    public get filteredQueueDatas(): QMessage[] {
      return this.searchFilterPipe.transform(this.queueDatas, this.searchQMessageForm) || [];
    }

    /** Job Status column -- fixed bar per status (same order/colors as the "Queue Status" chart
     * above and the status-* pills in the table body), so even a run of all-Completed rows
     * still reads as a histogram (one tall bar + flat baseline for the rest) instead of a
     * plain-colored strip. */
    public get jobStatusColumnStats(): ColumnBarSegment[] {
      return this.categoricalColumnStats(
        (row: any) => row.jobStatus,
        JOB_STATUS_ORDER,
        (label) => JOB_STATUS_COLOR[String(label).trim().toLowerCase()] || FILL_COLOR
      );
    }

    /** Run Manual / Skip Manual / Q Send columns -- always both True and False bars, same
     * green/red the table body's pills already use for these fields. */
    public booleanColumnStats(field: 'runManual' | 'skipManual' | 'jobSend'): ColumnBarSegment[] {
      return this.categoricalColumnStats(
        (row: any) => (row[field] === true ? 'True' : 'False'),
        ['True', 'False'],
        (label) => (label === 'True' ? PILL_SUCCESS_COLOR : PILL_DANGER_COLOR)
      );
    }

    /** Start Time / End Time / Skip Time columns -- these are only set once a run reaches that
     * stage, so "Filled vs Empty" is more informative than trying to histogram raw timestamps
     * in a header-sized bar (e.g. a mostly-empty End Time bar means most rows are still in flight). */
    public dateFillColumnStats(field: 'startTime' | 'endTime' | 'skipTime'): ColumnBarSegment[] {
      return this.categoricalColumnStats(
        (row: any) => (row[field] ? 'Filled' : 'Empty'),
        ['Filled', 'Empty'],
        (label) => (label === 'Filled' ? FILL_COLOR : EMPTY_COLOR)
      );
    }

    /** Shared tally-and-color-map builder behind jobStatusColumnStats/booleanColumnStats/
     * dateFillColumnStats -- counts filteredQueueDatas by whatever key valueOf(row) returns,
     * then returns one bar per entry in categoryOrder (0-count categories included) so the
     * chart's shape never depends on which values happen to be present right now. */
    private categoricalColumnStats(
      valueOf: (row: QMessage) => any, categoryOrder: string[], colorOf: (label: string) => string
    ): ColumnBarSegment[] {
      const rows = this.filteredQueueDatas;
      const counts = new Map<string, number>();
      let total = 0;
      rows.forEach((row) => {
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

    // --- Group-by charts -- same filteredQueueDatas source as the column-header mini bars
    // above, just rendered as full-size charts instead of a header-sized strip. Every getter
    // returns null (not an empty chart) when there's nothing to show, so *ngIf can skip the
    // panel entirely. Three kinds, picked per field by what actually reads well at this size:
    //   - donut pie   -- Job Status, Job Id (a handful of named categories/slices)
    //   - stacked bar -- Run Manual / Skip Manual / Q Send together (three yes/no fields
    //                    compare better as one small multiples bar than as three separate
    //                    donuts that all only ever have 2 slices)
    //   - duration bar -- Start Time + End Time merged into one "how long did each job's most
    //                    recent run take" comparison (see durationComparisonChartOptions) --
    //                    a raw "count of rows per day" line for each of Start/End/Skip Time
    //                    never actually answered a real question, and Skip Time barely has
    //                    any data (skips are rare), so it's dropped rather than replaced. ---

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
        // Legend on the right (not stacked below the ring) -- a bottom legend forced the pie's
        // radius to be computed off a squeezed vertical strip (box height minus title minus
        // legend), while the box's actual WIDTH -- 400-600px once a row has only 1-2 other
        // charts sharing it -- sat almost entirely blank on both sides of a small, centered
        // donut (confirmed off the live canvas sizes: a 605x168 box was still only drawing a
        // ~75px donut). A vertical legend spends that width instead of wasting it, and frees
        // the pie to use the box's full height since nothing's reserved at the bottom anymore.
        // 'scroll' only kicks in once there are enough entries (Job Id, up to 9) to actually
        // overflow the legend's vertical space; short legends (Job Status et al) stay 'plain'.
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

    /** Ranked horizontal bar -- used for Job Id instead of toPieOptions above. A pie's slices
     * only read clearly up to 4-5 categories; Job Id can have dozens, so even after fixing the
     * pie's wasted-space problem (right-side legend) it was still a ring of near-identical
     * slivers with a long scrolling legend doing all the actual communicating -- the ring itself
     * added little. A ranked bar puts every category's own label directly on its own row (no
     * separate legend to cross-reference at all) and its length *is* the comparison, which is
     * the actual question "which jobs are busiest" is asking. Every pixel of width goes to a
     * label or a bar -- nothing is purely decorative the way a pie's empty background is. */
    private toRankedBarOptions(title: string, segments: ColumnBarSegment[]): EChartOption | null {
      const data = segments.filter((s) => s.count > 0);
      if (!data.length) {
        return null;
      }
      // Category axis renders bottom-to-top by default -- reverse so the biggest segment (Job
      // Id's top-N sort, or any other caller's own ordering) lands at the top of the chart,
      // reading like a leaderboard instead of upside-down.
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
     * field) instead of three separate 2-slice donuts -- three "coin flip" pies side by side
     * are hard to compare at a glance; stacked bars sharing one axis are not. A field with no
     * data at all (never happens today, but Q Send is optional) drops its row instead of
     * showing an empty one. */
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
        // splitNumber+formatter: this chart's box is one of three sharing a row (~196px wide),
        // and this axis's default 5-6 ticks ("0, 300, 600, 900, 1,200, 1,500") don't fit that
        // narrow a plot area at any legible font size -- they visually ran together into an
        // unreadable "030609001500" smear. Fewer, shorter ticks (splitNumber caps how many
        // echarts generates; the formatter shortens "1,500" to "1.5k") both fit comfortably.
        xAxis: { type: 'value', splitNumber: 3, axisLabel: { fontSize: 8, formatter: compactAxisNumber } },
        yAxis: { type: 'category', data: labels, axisLabel: { fontSize: 9 } },
        series: [
          { name: 'True', type: 'bar', stack: 'total', barMaxWidth: 16, data: trueData, itemStyle: { color: PILL_SUCCESS_COLOR } },
          { name: 'False', type: 'bar', stack: 'total', barMaxWidth: 16, data: falseData, itemStyle: { color: PILL_DANGER_COLOR } }
        ]
      };
    }

    /** Job Id -- unlike the fixed-category fields above, any number of distinct ids can appear,
     * so this tallies filteredQueueDatas itself (not categoricalColumnStats, which needs a
     * fixed categoryOrder) and caps the pie at the top 8 by row count, folding the rest into a
     * single "Other" slice so a wide date range with dozens of jobs still reads as a chart
     * instead of a ring of slivers. */
    public get jobIdChartOptions(): EChartOption | null {
      const counts = new Map<string, number>();
      this.filteredQueueDatas.forEach((row: any) => {
        if (row.jobId === null || row.jobId === undefined) {
          return;
        }
        const label = String(row.jobId);
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      if (!counts.size) {
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

    /** Start Time + End Time merged into one comparison: every distinct job id gets its own
     * line, plotted as (start time, duration-in-minutes) points across all of its runs -- so
     * "when did this job run and how long did it take" for every job is visible on one shared
     * timeline, instead of two separate, uncorrelated per-day volume lines that never showed
     * duration or which job at all. All job ids are included (not just a top-N sample) --
     * that's the whole point of a "compare different process tasks" chart -- so this can get
     * busy with many distinct jobs; the legend is scrollable for that case. */
    public get durationComparisonChartOptions(): EChartOption | null {
      const rows = this.filteredQueueDatas.filter((r: any) => r.startTime && r.endTime);
      if (!rows.length) {
        return null;
      }
      // One line, all runs in chronological order -- each point is still a specific job's run
      // (color-coded by job id, named in the tooltip), so different "process tasks" are still
      // directly comparable at a glance without needing a full legend/series per job id.
      const jobIds = Array.from(new Set(rows.map((r: any) => String(r.jobId)))).sort((a, b) => Number(a) - Number(b));
      const colorByJob = new Map<string, string>(jobIds.map((id, i) => [id, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]]));
      const points = rows
        .slice()
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .map((r: any) => {
          const minutes = Math.max(0, Math.round(
            ((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000) * 10) / 10);
          return {
            value: [r.startTime, minutes],
            jobId: r.jobId, jobQueueId: r.jobQueueId, startTime: r.startTime, endTime: r.endTime, jobStatus: r.jobStatus,
            itemStyle: { color: colorByJob.get(String(r.jobId)) }
          };
        });
      return {
        title: {
          text: 'Start → End Duration, All Jobs Compared',
          left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 600, color: '#36424d' }
        },
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            const d = params.data;
            return `Job ${d.jobId} (${d.jobStatus || '-'})<br/>Duration: ${d.value[1]} min<br/>` +
              `Start: ${this.formatDateTime(d.startTime)}<br/>End: ${this.formatDateTime(d.endTime)}` +
              `<br/><span style="color:#7b8794;">Click to open this run's Job Logs</span>`;
          }
        },
        grid: { left: 50, right: 16, top: 28, bottom: 12, containLabel: true },
        xAxis: { type: 'time', axisLabel: { fontSize: 8 } },
        yAxis: { type: 'value', name: 'min', nameTextStyle: { fontSize: 8, color: '#7b8794' }, axisLabel: { fontSize: 8 } },
        series: [{
          type: 'line',
          smooth: true,
          symbolSize: 6,
          lineStyle: { color: FILL_COLOR, width: 1.5 },
          // Points navigate to that run's Job Logs on click (onDurationChartClick) -- same
          // pattern as the Run History bar charts on Job History/Job List, pointer cursor is
          // the only hint since this chart div shares styling with the other, non-clickable
          // echarts panels in this strip.
          cursor: 'pointer',
          data: points
        }]
      } as EChartOption;
    }

    /** Duration chart point click -> that run's Job Logs. Each point carries its own
     * jobId/jobQueueId (see durationComparisonChartOptions above) so no separate index lookup
     * is needed. `from: 'qMessage'` tells Job Logs' breadcrumb where "back" should actually
     * return to -- see BACK_TARGETS in job-logs.component.ts. */
    public onDurationChartClick(event: any): void {
      const jobId = event?.data?.jobId;
      const jobQueueId = event?.data?.jobQueueId;
      if (!jobId || !jobQueueId) {
        return;
      }
      this.router.navigate(['jobList/jobLogs'], {
        queryParams: { jobId, jobQueueId, from: 'qMessage' }
      });
    }

    /** Formats an ISO datetime string as 'yyyy-MM-dd HH:mm:ss' for the duration chart's
     * tooltip -- built inline (no Angular pipe injection) since it only runs inside an echarts
     * tooltip formatter callback. */
    private formatDateTime(value: any): string {
      if (!value) {
        return '-';
      }
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        return '-';
      }
      const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    public deleteQMessage(queueData: any, index: any) {
      this.spinnerService.show();
      this.settingService.failJobLogs(queueData?.jobQueueId)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.submitQMessageFilter();
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

    public interruptQMessage(queueData: any, index: any) {
      this.spinnerService.show();
      this.settingService.interruptJobLogs(queueData?.jobQueueId)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.submitQMessageFilter();
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

    public drawJobRunningStatistics(dataPaload: any): void {
      const categories = (dataPaload || []).map((d: any) => d.name);
      const values = (dataPaload || []).map((d: any) => ({
        value: d.value,
        itemStyle: { color: JOB_STATUS_COLOR[String(d.name || '').trim().toLowerCase()] || FILL_COLOR }
      }));
      this.sourceJobRunningStatistics = {
        title: {
          text: 'Queue Status',
          left: 'center',
          top: '5px',
          textStyle: {
            fontSize: 14,
            color: '#36424d'
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' }
        },
        grid: {
          left: '3%',
          right: '10%',
          bottom: '3%',
          top: '40px',
          containLabel: true
        },
        xAxis: {
          type: 'value',
          minInterval: 1,
          // This chart lives in a narrow col-lg-3 box next to the search form -- same "default
          // tick count doesn't fit a narrow axis" overlap as the Column Insights charts below
          // (see compactAxisNumber), just with this chart's own default (larger) font size
          // making it worse. splitNumber+formatter fixes it the same way.
          splitNumber: 3,
          axisLabel: { formatter: compactAxisNumber },
          splitLine: { lineStyle: { color: '#eef2f4' } }
        },
        yAxis: {
          type: 'category',
          data: categories,
          axisTick: { show: false }
        },
        series: [
          {
            name: 'Queue Status',
            type: 'bar',
            barWidth: '55%',
            itemStyle: { borderRadius: [0, 4, 4, 0] },
            label: {
              show: true,
              position: 'right',
              fontWeight: 'bold',
              color: '#36424d'
            },
            data: values
          }
        ]
      };
    }
}