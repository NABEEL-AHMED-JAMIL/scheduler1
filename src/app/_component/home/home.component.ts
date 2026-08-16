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

const BREAKDOWN_COLOR: { [status: string]: string } = {
  Queue: '#0c7c8c',
  Start: '#283593',
  Running: '#b5730a',
  Failed: '#c0392b',
  Completed: '#1d7a3f',
  Skip: '#566573',
  Interrupt: '#6a3bbf'
};

@Component({
  selector: 'home',
  templateUrl: 'home.component.html',
  providers: [DatePipe]
})
export class HomeComponent implements OnInit, OnDestroy {

  private readonly chicagoTimeZone = 'America/Chicago';

  private static readonly AUTO_REFRESH_INTERVAL_MS = 60000;
  private autoRefreshTimer: any = null;

  public ERROR = 'Error';

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

  private hours: string[] = [
    '12AM', '1AM', '2AM', '3AM', '4AM', '5AM',
    '6AM', '7AM', '8AM', '9AM', '10AM', '11AM',
    '12PM', '1PM', '2PM', '3PM', '4PM', '5PM',
    '6PM', '7PM', '8PM', '9PM', '10PM', '11PM'
  ];

  private heatMapData: any = [[0, 0, '-']];

  public sourceJobStatusStatistics!: EChartOption;
  public sourceJobRunningStatistics!: EChartOption;
  public sourceJobWeeklyRunningStatistics!: EChartOption;
  public sourceJobWeeklyHrsRunningStatistics!: EChartOption;
  public today_date: any;
  public last_7th_date: any;

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

  private autoRefreshDashboard(): void {
    this.jobStatusStatistics(true);
    this.jobRunningStatistics(true);
    this.weeklyRunningJobStatistics(true);
    this.weeklyHrsRunningJobStatistics(true);
  }

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

  private statValue(data: NameValue[], name: string): number {
    const match = data.find((d) => (d.name || '').toUpperCase() === name.toUpperCase());
    return match ? Number(match.value) || 0 : 0;
  }

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

        if (!silent) {
          this.alertService.showError(error, this.ERROR);
          this.spinnerService.hide();
        }
      });
  }

  public drawJobStatusStatistics(dataPaload: any): void {

    const colorMap = {
      'Active': '#27ae60',
      'Inactive': '#f39c12',
      'Delete': '#e74c3c'
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

    const colorMap: { [key: string]: string } = {
      'START': '#4f46e5',
      'RUNNING': '#f39c12',
      'FAILED': '#c0392b',
      'COMPLETED': '#27ae60'
    };

    this.sourceJobRunningStatistics = {
      toolbox: this.refreshToolbox(() => this.jobRunningStatistics()),
      tooltip: {
        trigger: 'item'
      },
      legend: {
        left: 'center',
        bottom: '2%'
      },
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
          data: (dataPaload || []).map((item: any) => ({
            ...item,
            itemStyle: {
              color: colorMap[(item.name || '').toUpperCase()] || '#999'
            }
          }))
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

    const counts = (dataPaload || [])
      .map((row: any) => Number(row[2]))
      .filter((n: number) => !isNaN(n));
    const maxCount = counts.length ? Math.max(...counts) : 1;

    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const todayLabel = weekdayNames[now.getDay()];
    const currentHourLabel = this.hours[now.getHours()];
    const NOW_COLOR = '#c2410c';
    this.sourceJobWeeklyHrsRunningStatistics = {

      tooltip: {
        position: 'top'
      },
      grid: {

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

          show: false,
          min: 0,
          max: maxCount,
          calculable: false,
          orient: 'vertical',
          left: '93%',
          top: '40',

          seriesIndex: 0,

          color: ['#3730a3', '#4f46e5', '#a5b4fc', '#eef0fb']
        }
      ],
      series: [
        {
          name: 'Daily Job Run',
          type: 'heatmap',

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

    const clicked = event?.data?.value ?? event?.data;

    this.selectMap = this.heatMapData.find((data: any) => {
      return (data.hr == clicked?.[0] && data.dayCode == clicked?.[1] && data.count == clicked?.[2]);
    });
    this.weeklyHrRunningStatisticsDimension(this.selectMap?.date, this.selectMap?.hr);
  }

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
