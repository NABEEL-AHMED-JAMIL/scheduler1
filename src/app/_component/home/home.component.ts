import { Component, OnInit, OnDestroy } from '@angular/core';
import { ApiCode, NameValue } from '../../_models/index';
import { Router } from '@angular/router';
import { EChartOption } from 'echarts';
import { first } from 'rxjs/operators';
import { SpinnerService } from '@/_helpers';
import { DatePipe } from '@angular/common'
import {
  AlertService,
  HomeService
} from '@/_services';

// Same status palette as the .status-* pill classes (app.less) and the Job List/Job Logs
// charts, so a job's breakdown reads consistently everywhere counts by status show up.
const BREAKDOWN_COLOR: { [status: string]: string } = {
  Queue: '#0c7c8c',
  Start: '#283593',
  Running: '#b5730a',
  Failed: '#c0392b',
  Completed: '#1d7a3f',
  Skip: '#566573',
  Interrupt: '#6a3bbf'
};

/**
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'home',
  templateUrl: 'home.component.html',
  providers: [DatePipe]
})
export class HomeComponent implements OnInit, OnDestroy {

  private readonly chicagoTimeZone = 'America/Chicago';
  // Real-time refresh -- re-pulls every chart/stat off the currently selected date range every
  // minute so the dashboard doesn't go stale while it's left open. Silent (autoRefreshDashboard)
  // so it doesn't blank the page with the full spinner or reset whatever the user's doing (a
  // search in the Job Breakdown table, a drilled-down heatmap cell) every 60 seconds -- only the
  // manual Apply/Reset/toolbox-refresh paths still show the spinner.
  private static readonly AUTO_REFRESH_INTERVAL_MS = 60000;
  private autoRefreshTimer: any = null;

  public ERROR = 'Error';
  // search detail
  public searchSourceJobDetails: any = '';
  public sourceJobWeeklyRunningStatisticsDimensionData: any;
  public jobStatusData: NameValue[] = [
    {
      value: 0,
      name: 'Active'
    },
    {
      value: 0,
      name: 'Inactive'
    },
    {
      value: 0,
      name: 'Delete'
    }
  ];
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
    }
  ];
  private weeklyRunningJobData: NameValue[] = [];
  // hours
  private hours: string[] = [
    '12AM', '1AM', '2AM', '3AM', '4AM', '5AM',
    '6AM', '7AM', '8AM', '9AM', '10AM', '11AM',
    '12PM', '1PM', '2PM', '3PM', '4PM', '5PM',
    '6PM', '7PM', '8PM', '9PM', '10PM', '11PM'
  ];

  // data pattern -> day|hr|total count
  private heatMapData: any = [[0, 0, '-']];

  public sourceJobStatusStatistics!: EChartOption;
  public sourceJobRunningStatistics!: EChartOption;
  public sourceJobWeeklyRunningStatistics!: EChartOption;
  public sourceJobWeeklyHrsRunningStatistics!: EChartOption;
  public today_date: any;
  public last_7th_date: any;
  // date-range filter -- defaults to the last 7 days, editable from the toolbar
  public filterStartDate: any;
  public filterEndDate: any;

  constructor(public datepipe: DatePipe,
    private alertService: AlertService,
    private spinnerService: SpinnerService,
    private homeService: HomeService,
    private router: Router) { }

  ngOnInit() {
    let todayDate = new Date();
    this.today_date = this.datepipe.transform(todayDate, 'yyyy-MM-dd', this.chicagoTimeZone) || '';
    todayDate.setDate(todayDate.getDate() - 6);
    this.last_7th_date = this.datepipe.transform(todayDate, 'yyyy-MM-dd', this.chicagoTimeZone) || '';
    this.filterStartDate = this.last_7th_date;
    this.filterEndDate = this.today_date;
    this.loadDashboard();
    this.autoRefreshTimer = setInterval(
      () => this.autoRefreshDashboard(), HomeComponent.AUTO_REFRESH_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  /** Whether the filter has been moved away from the default last-7-days window. */
  get isCustomRange(): boolean {
    return this.filterStartDate !== this.last_7th_date || this.filterEndDate !== this.today_date;
  }

  public applyFilter(): void {
    if (!this.filterStartDate || !this.filterEndDate) {
      this.alertService.showError('Please select both a start and end date.', this.ERROR);
      return;
    }
    if (this.filterStartDate > this.filterEndDate) {
      this.alertService.showError('Start date must be on or before the end date.', this.ERROR);
      return;
    }
    this.loadDashboard();
  }

  public resetFilter(): void {
    this.filterStartDate = this.last_7th_date;
    this.filterEndDate = this.today_date;
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.searchSourceJobDetails = '';
    this.sourceJobWeeklyRunningStatisticsDimensionData = undefined;
    this.jobStatusStatistics();
    this.jobRunningStatistics();
    this.weeklyRunningJobStatistics();
    this.weeklyHrsRunningJobStatistics();
  }

  /** The 1-minute auto-refresh tick -- same four fetches as loadDashboard, but silent (no
   * spinner) and without touching searchSourceJobDetails/sourceJobWeeklyRunningStatisticsDimensionData,
   * so it can't interrupt a search the user's mid-typing or collapse a heatmap drill-down
   * they've got open. */
  private autoRefreshDashboard(): void {
    this.jobStatusStatistics(true);
    this.jobRunningStatistics(true);
    this.weeklyRunningJobStatistics(true);
    this.weeklyHrsRunningJobStatistics(true);
  }

  // --- Stat tiles (derived from the same jobStatusData/jobRunningData the pie charts already use) ---

  get totalJobsCount(): number {
    return this.statValue(this.jobStatusData, 'All');
  }

  get activeJobsCount(): number {
    return this.statValue(this.jobStatusData, 'Active');
  }

  get runningNowCount(): number {
    return this.statValue(this.jobRunningData, 'Running');
  }

  get failedCount(): number {
    return this.statValue(this.jobRunningData, 'Failed');
  }

  get completedCount(): number {
    return this.statValue(this.jobRunningData, 'Completed');
  }

  /** Case-insensitive lookup -- the API returns UPPERCASE status names, the pre-load defaults use Title Case. */
  private statValue(data: NameValue[], name: string): number {
    const match = data.find((d) => (d.name || '').toUpperCase() === name.toUpperCase());
    return match ? Number(match.value) || 0 : 0;
  }

  /** Shared toolbox config for every chart's refresh button -- only the click handler and visibility differ per chart. */
  private refreshToolbox(onclick: () => void, show = false): any {
    return {
      top: '7px',
      feature: {
        myRefresh: {
          show,
          title: 'Refresh',
          top: '7px',
          icon: 'image://https://www.svgrepo.com/show/199951/refresh.svg',
          onclick
        }
      }
    };
  }

  public jobStatusStatistics(silent = false): void {
    if (!silent) {
      this.spinnerService.show();
    }
    this.homeService.jobStatusStatistics(this.filterStartDate, this.filterEndDate)
      .pipe(first())
      .subscribe((response) => {
        if (response.status === ApiCode.SUCCESS) {
          if (!silent) {
            this.spinnerService.hide();
          }
          this.jobStatusData = response.data;
          this.drawJobStatusStatistics(this.jobStatusData);
        } else {
          this.drawJobStatusStatistics(this.jobStatusData);
          if (!silent) {
            this.spinnerService.hide();
          }
        }
      }, (error) => {
        // Auto-refresh failures stay quiet -- an error toast every minute in the background
        // (transient network blip, backend restart) would be far more disruptive than just
        // trying again on the next tick with whatever data is already on screen.
        if (!silent) {
          this.alertService.showError(error, this.ERROR);
          this.spinnerService.hide();
        }
      });
  }

  public drawJobStatusStatistics(dataPaload: any): void {
    // Map colors based on status name for consistent coloring
    const colorMap = {
      'Active': '#27ae60',      // Green  (matches pill-success)
      'Inactive': '#f39c12',    // Amber  (matches pill-warning)
      'Delete': '#e74c3c'       // Red    (matches pill-danger)
    };
    
    const itemStyle = {
      color: (params: any) => {
        return colorMap[params.name as keyof typeof colorMap] || '#999';
      }
    };
    
    this.sourceJobStatusStatistics = {
      toolbox: this.refreshToolbox(() => this.jobStatusStatistics()),
      tooltip: {
        trigger: 'item'
      },
      legend: {
        left: 'center',
        bottom: '2%',
      },
      series: [
        {
          name: 'Job Status',
          type: 'pie',
          radius: ['40%', '60%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 1
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: false,
              fontSize: 40,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          // 'All' is a synthetic Active+Inactive row the backend adds only for the
          // totalJobsCount KPI tile (see statValue) -- including it here doubled the pie's
          // total and skewed every slice's percentage.
          data: dataPaload
            .filter((item: any) => (item.name || '').toUpperCase() !== 'ALL')
            .map((item: any) => ({
              ...item,
              itemStyle: {
                color: colorMap[item.name as keyof typeof colorMap] || '#999'
              }
            }))
        }
      ]
    }
  }

  public jobRunningStatistics(silent = false): void {
    if (!silent) {
      this.spinnerService.show();
    }
    this.homeService.jobRunningStatistics(this.filterStartDate, this.filterEndDate)
      .pipe(first())
      .subscribe((response) => {
        if (response.status === ApiCode.SUCCESS) {
          if (!silent) {
            this.spinnerService.hide();
          }
          this.jobRunningData = response.data;
          this.drawJobRunningStatistics(this.jobRunningData);
        } else {
          this.drawJobRunningStatistics(this.jobRunningData);
          if (!silent) {
            this.spinnerService.hide();
          }
        }
      }, (error) => {
        if (!silent) {
          this.alertService.showError(error, this.ERROR);
          this.spinnerService.hide();
        }
      });
  }

  public drawJobRunningStatistics(dataPaload: any): void {
    this.sourceJobRunningStatistics = {
      toolbox: this.refreshToolbox(() => this.jobRunningStatistics()),
      tooltip: {
        trigger: 'item'
      },
      legend: {
        left: 'center',
        bottom: '2%'
      },
      color: ['#27ae60', '#f39c12', '#e74c3c'],
      series: [
        {
          name: 'Job Statistics',
          type: 'pie',
          radius: ['0%', '60%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 1
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: false,
              fontSize: 40,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: true
          },
          data: dataPaload
        }
      ]
    };
  }

  public weeklyRunningJobStatistics(silent = false): void {
    if (!silent) {
      this.spinnerService.show();
    }
    this.homeService.weeklyRunningJobStatistics(this.filterStartDate, this.filterEndDate)
      .pipe(first())
      .subscribe((response) => {
        if (response.status === ApiCode.SUCCESS) {
          if (!silent) {
            this.spinnerService.hide();
          }
          this.weeklyRunningJobData = response.data;
          const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          const dayIndex = dayOrder.map(day =>
            this.weeklyRunningJobData.find((element) => element.name === day)?.value || 0
          );
          this.drawSourceJobWeeklyRunningStatistics(dayIndex);
        } else {
          this.drawSourceJobWeeklyRunningStatistics([0, 0, 0, 0, 0, 0, 0]);
          if (!silent) {
            this.spinnerService.hide();
          }
        }
      }, (error) => {
        if (!silent) {
          this.alertService.showError(error, this.ERROR);
          this.spinnerService.hide();
        }
      });
  }

  public drawSourceJobWeeklyRunningStatistics(dataPaload: any): void {
    this.sourceJobWeeklyRunningStatistics = {
      toolbox: this.refreshToolbox(() => this.weeklyRunningJobStatistics()),
      tooltip: {
        trigger: 'axis',
      },
      grid: {
        left: '3%',
        right: '4%',
        top: '4%',
        bottom: '3%',
        containLabel: true
      },
      color: ['#4f46e5'],
      xAxis: [
        {
          type: 'category',
          data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          axisTick: {
            alignWithLabel: true
          }
        }
      ],
      yAxis: [
        {
          type: 'value'
        }
      ],
      series: [
        {
          name: 'Jobs',
          type: 'bar',
          barWidth: '60%',
          data: dataPaload
        }
      ]
    };
  }

  public weeklyHrsRunningJobStatistics(silent = false): void {
    if (!silent) {
      this.spinnerService.show();
    }
    this.homeService.weeklyHrsRunningJobStatistics(this.filterStartDate, this.filterEndDate)
      .pipe(first())
      .subscribe((response) => {
        if (!silent) {
          this.spinnerService.hide();
        }
        if (response.status === ApiCode.SUCCESS) {
          this.heatMapData = response.data;
          this.drawWeeklyHrsRunningJobStatistics(
            this.heatMapData.map(function (item: any) {
              return [item.hr, item.dayCode, item.count || '-'];
            }));
          return;
        }
        if (!silent) {
          this.alertService.showError(response.message, this.ERROR);
        }
      }, (error) => {
        if (!silent) {
          this.spinnerService.hide();
          this.alertService.showError(error, this.ERROR);
        }
      });
  }

  public drawWeeklyHrsRunningJobStatistics(dataPaload: any): void {
    // visualMap.max was a hardcoded 2000 -- real per-hour job counts are usually single/low
    // double digits, so every populated cell landed in the bottom sliver of that range and
    // rendered the same near-black/maroon shade regardless of whether it was a 2 or a 40,
    // making the heatmap's whole point (spot the busy cells at a glance) impossible. Deriving
    // the ceiling from the actual data keeps the color scale meaningful at any volume.
    const counts = (dataPaload || [])
      .map((row: any) => Number(row[2]))
      .filter((n: number) => !isNaN(n));
    const maxCount = counts.length ? Math.max(...counts) : 1;
    // The cell color only encodes job count, not which day it happened on -- with 7 same-
    // looking rows there was no way to tell "today's numbers" from a previous day's at a
    // glance. A thin markArea outline around today's row turned out too subtle to notice
    // against the heatmap's own indigo palette (it visually disappeared into the cells). Bold,
    // colored axis labels read far more reliably -- eyes land on axis text before cell color --
    // and the current-hour cell gets a high-contrast amber border (a color nothing else in this
    // chart uses) instead of blending into the same indigo family as everything else.
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const todayLabel = weekdayNames[now.getDay()];
    const currentHourLabel = this.hours[now.getHours()];
    const NOW_COLOR = '#c2410c';
    this.sourceJobWeeklyHrsRunningStatistics = {
      // No toolbox (refresh icon) here -- this chart already redraws on every filter change,
      // and the icon was just clutter in the top-right corner nothing else on the page has.
      tooltip: {
        position: 'top'
      },
      grid: {
        // right was 13% -- way more than the (now-hidden) color-legend needs, so the heatmap
        // cells ended well short of the card's right edge with a dead gap after them.
        left: '1%',
        right: '2%',
        top: '3%',
        height: '80%',
        containLabel: true
      },
      xAxis: <any>{
        type: 'category',
        data: this.hours,
        splitArea: {
          show: true
        },
        axisLabel: {
          // Cast to any -- rich-text axisLabel formatters (per-value styling via a {token|text}
          // return) aren't in these echarts typings, but are valid at runtime.
          formatter: (value: string) => value === currentHourLabel ? `{now|${value}}` : value,
          rich: {
            now: { color: NOW_COLOR, fontWeight: 700 }
          }
        }
      },
      yAxis: <any>{
        type: 'category',
        data: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        splitArea: {
          show: true
        },
        axisLabel: {
          // Sunday gets its own sun-gold color regardless of which day is "today" (a small,
          // fixed themed touch -- Sun-day) -- otherwise the normal indigo "today" bolding applies.
          formatter: (value: string) => value === 'Sunday' ? `{sunday|${value}}`
            : value === todayLabel ? `{today|${value}}` : value,
          rich: {
            today: { color: '#4f46e5', fontWeight: 700 },
            sunday: { color: '#d97706', fontWeight: 700 }
          }
        }
      },
      visualMap: [
        {
          // show:false -- this still drives the heatmap's value-to-color scale, just without
          // rendering the vertical legend bar (the "line" on the right the cells didn't need).
          show: false,
          min: 0,
          max: maxCount,
          calculable: false,
          orient: 'vertical',
          left: '93%',
          top: '40',
          // Scoped to the heatmap series (index 0) only -- without this, the "right now"
          // scatter marker (series index 1) would get recolored by this value scale too,
          // stripping its fixed amber ring.
          seriesIndex: 0,
          // Single-hue light-to-dark sequential scale (app's indigo accent) -- reads as
          // "low to high" at a glance, unlike the old green/black/brown/darkred stops
          // which had no consistent light->dark direction to anchor on.
          color: ['#3730a3', '#4f46e5', '#a5b4fc', '#eef0fb']
        }
      ],
      series: [
        {
          name: 'Daily Job Run',
          type: 'heatmap',
          // Fixed label color read badly at one end of the scale or the other -- the visualMap
          // goes dark indigo (high count) to near-white lavender (low count), so a single color
          // was always going to be illegible against half the cells. A series-level label.color
          // callback (the "normal" way to do this) rendered no text at all here -- not just bad
          // contrast, the labels vanished outright, so per-datum label overrides (each data item
          // carries its own {value, label} instead of a plain [hr,day,count] tuple) are used
          // instead, which is the older/more basic echarts mechanism and reliably supported.
          //
          // The "right now" cell (today + current hour) gets the same per-datum treatment for
          // its own itemStyle -- an amber border directly on the actual cell, in place of two
          // earlier attempts that didn't pan out: a markArea outline (rendered zero pixels on
          // this heatmap), then a circular scatter marker overlaid on top (visually didn't read
          // as "this cell" -- a circle over a square cell looked like an unrelated dot, not a
          // highlight of the cell itself). A border on the real cell is unambiguous.
          data: dataPaload.map((row: any) => {
            const value = Number(row[2]);
            const isNumeric = !isNaN(value);
            const isNow = row[0] === currentHourLabel && row[1] === todayLabel;
            return {
              value: row,
              label: {
                color: !isNumeric ? '#7b8794' : (value > maxCount * 0.45 ? '#ffffff' : '#312e81')
              },
              itemStyle: isNow ? { borderColor: NOW_COLOR, borderWidth: 3 } : undefined
            };
          }),
          label: {
            show: true,
            fontWeight: 600
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
        }
      ]
    };
  }

  public weeklyHrRunningStatisticsDimension(targetDate: any, targetHr: any): void {
    this.spinnerService.show();
    this.homeService.weeklyHrRunningStatisticsDimension(targetDate, targetHr)
      .pipe(first())
      .subscribe((response) => {
        if (response.status === ApiCode.SUCCESS) {
          this.sourceJobWeeklyRunningStatisticsDimensionData = response.data;
          this.spinnerService.hide();
        } else {
          this.alertService.showError(response.message, this.ERROR);
          this.spinnerService.hide();
        }
      }, (error) => {
        this.alertService.showError(error, this.ERROR);
        this.spinnerService.hide();
      });
  }

  private selectMap: any;
  public onChartEvent(event: any, type: string) {
    this.searchSourceJobDetails = '';
    // Each heatmap data point is now {value: [hr, day, count], label, itemStyle} (per-cell label
    // color/border, see drawWeeklyHrsRunningJobStatistics) rather than the plain [hr, day, count]
    // tuple it used to be -- so the clicked cell's actual values live at event.data.value now,
    // not event.data directly (which is undefined for these indices on a plain object, and
    // silently sent "targetDate=undefined&targetHr=undefined" to the backend as a result).
    const clicked = event?.data?.value ?? event?.data;
    // fine the data from the main data with the target event
    this.selectMap = this.heatMapData.find((data: any) => {
      return (data.hr == clicked?.[0] && data.dayCode == clicked?.[1] && data.count == clicked?.[2]);
    });
    this.weeklyHrRunningStatisticsDimension(this.selectMap?.date, this.selectMap?.hr);
  }

  /** Mini stacked-bar segments for the Job Breakdown table's Breakdown column -- one segment
   * per non-zero status, width proportional to its share of the row's total, so the seven
   * count columns are readable as a shape at a glance instead of only as separate numbers. */
  public breakdownSegments(sourceJob: any): { status: string; count: number; pct: number; color: string }[] {
    const total = Number(sourceJob?.total) || 0;
    if (!total) {
      return [];
    }
    const statuses = ['Queue', 'Start', 'Running', 'Failed', 'Completed', 'Skip', 'Interrupt'];
    return statuses
      .map(status => ({
        status,
        count: Number(sourceJob[status.toLowerCase()]) || 0,
        color: BREAKDOWN_COLOR[status]
      }))
      .filter(seg => seg.count > 0)
      .map(seg => ({ ...seg, pct: (seg.count / total) * 100 }));
  }

  public sourceJobCountAction(sourceJob: any, type: string, count: any): any {
    if (!count || Number(count) === 0) {
      this.alertService.showError('No ' + type + ' records available to view.', this.ERROR);
      return;
    }
    this.router.navigate(['jobList/jobHistory'],
      {
        queryParams: {
          jobId: sourceJob?.jobId,
          jobStatus: type,
          targetDate: this.selectMap?.date,
          targetHr: this.selectMap?.hr
        }
      });
  }

}

