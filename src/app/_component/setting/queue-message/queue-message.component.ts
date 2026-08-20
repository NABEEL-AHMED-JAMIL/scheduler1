import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AlertService, SettingService } from '@/_services';
import { SpinnerService, SearchFilterPipe } from '@/_helpers';
import { QMessage } from '@/_models/index';
import { first } from 'rxjs/operators';
import { EChartOption } from 'echarts';
import * as echarts from 'echarts';
import { ApiCode, NameValue } from '@/_models';
import { DatePipe } from '@angular/common';
import {
  ColumnBarSegment, JOB_STATUS_COLOR, JOB_STATUS_ORDER, PILL_SUCCESS_COLOR, PILL_DANGER_COLOR,
  FILL_COLOR, EMPTY_COLOR, CATEGORY_PALETTE, compactAxisNumber, rowDuration as sharedRowDuration,
  categoricalColumnStats, toPieOptions, jobIdRankedBarOptions,
  booleanFieldsChartOptions as sharedBooleanFieldsChartOptions, formatDateTime
} from '@/_helpers';

@Component({
  selector: 'queue-message',
  templateUrl: 'queue-message.component.html',
  providers: [DatePipe]
})
export class QueueMessageComponent implements OnInit {

    public ERROR: string = 'Error';
    public qMessageSearcForm!: FormGroup;
    public sourceJobRunningStatistics!: EChartOption;
    public jobStatusList: any = ['Queue', 'Start', 'Running', 'Failed', 'Completed', 'Skip', 'Interrupt', 'Missed'];
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
      },
      {
        value: 0,
        name: 'Missed'
      }
    ];
  private _queueDatas: QMessage[] = [];
  public get queueDatas(): QMessage[] {
    return this._queueDatas;
  }
  public set queueDatas(value: QMessage[]) {
    this._queueDatas = value;
    this.recomputeCharts();
  }

  private _searchQMessageForm: any = '';
  public get searchQMessageForm(): any {
    return this._searchQMessageForm;
  }
  public set searchQMessageForm(value: any) {
    this._searchQMessageForm = value;
    this.recomputeCharts();
  }

  public jobStatusPieOptions: EChartOption | null = null;
  public booleanFieldsChartOptions: EChartOption | null = null;
  public jobIdChartOptions: EChartOption | null = null;
  public durationComparisonChartOptions: EChartOption | null = null;

  private recomputeCharts(): void {
    this.jobStatusPieOptions = this.computeJobStatusPieOptions();
    this.booleanFieldsChartOptions = this.computeBooleanFieldsChartOptions();
    this.jobIdChartOptions = this.computeJobIdChartOptions();
    this.durationComparisonChartOptions = this.computeDurationComparisonChartOptions();
  }

  private durationZoomStart = 0;
  private durationZoomEnd = 100;

  public onDurationChartDataZoom(event: any): void {
    const zoomState = event?.batch?.[0] || event;
    if (zoomState && typeof zoomState.start === 'number' && typeof zoomState.end === 'number') {
      this.durationZoomStart = zoomState.start;
      this.durationZoomEnd = zoomState.end;
    }
  }

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

    public get filteredQueueDatas(): QMessage[] {
      return this.searchFilterPipe.transform(this.queueDatas, this.searchQMessageForm) || [];
    }

    public get jobStatusColumnStats(): ColumnBarSegment[] {
      return categoricalColumnStats(
        this.filteredQueueDatas,
        (row: any) => row.jobStatus,
        JOB_STATUS_ORDER,
        (label) => JOB_STATUS_COLOR[String(label).trim().toLowerCase()] || FILL_COLOR
      );
    }

    public booleanColumnStats(field: 'runManual' | 'skipManual' | 'jobSend'): ColumnBarSegment[] {
      return categoricalColumnStats(
        this.filteredQueueDatas,
        (row: any) => (row[field] === true ? 'True' : 'False'),
        ['True', 'False'],
        (label) => (label === 'True' ? PILL_SUCCESS_COLOR : PILL_DANGER_COLOR)
      );
    }

    public dateFillColumnStats(field: 'startTime' | 'endTime' | 'skipTime'): ColumnBarSegment[] {
      return categoricalColumnStats(
        this.filteredQueueDatas,
        (row: any) => (row[field] ? 'Filled' : 'Empty'),
        ['Filled', 'Empty'],
        (label) => (label === 'Filled' ? FILL_COLOR : EMPTY_COLOR)
      );
    }

    public rowDuration(row: any): string {
      return sharedRowDuration(row);
    }

    private computeJobStatusPieOptions(): EChartOption | null {
      return toPieOptions('Job Status', this.jobStatusColumnStats);
    }

    private computeBooleanFieldsChartOptions(): EChartOption | null {
      return sharedBooleanFieldsChartOptions(this.filteredQueueDatas, [
        { key: 'runManual', label: 'Run Manual' },
        { key: 'skipManual', label: 'Skip Manual' },
        { key: 'jobSend', label: 'Q Send' }
      ]);
    }

    private computeJobIdChartOptions(): EChartOption | null {
      return jobIdRankedBarOptions(this.filteredQueueDatas, false);
    }

    private computeDurationComparisonChartOptions(): EChartOption | null {
      const rows = this.filteredQueueDatas.filter((r: any) => r.startTime && r.endTime);
      if (!rows.length) {
        return null;
      }

      const jobIds = Array.from(new Set(rows.map((r: any) => String(r.jobId)))).sort((a, b) => Number(a) - Number(b));
      const categories = jobIds.map((id) => `Job ${id}`);
      const colorByJob = new Map<string, string>(jobIds.map((id, i) => [id, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]]));

      const bars = rows.map((r: any) => {
        const startMs = new Date(r.startTime).getTime();
        const endMs = new Date(r.endTime).getTime();
        const minutes = Math.max(0, Math.round(((endMs - startMs) / 60000) * 10) / 10);
        return {
          value: [jobIds.indexOf(String(r.jobId)), startMs, endMs, r.jobId, r.jobQueueId, r.jobStatus, minutes],
          itemStyle: { color: colorByJob.get(String(r.jobId)) }
        };
      });

      return {
        title: {
          text: 'Start → End Duration, All Jobs Compared',
          left: 'center', top: 2, textStyle: { fontSize: 11, fontWeight: 600, color: '#36424d' }
        },
        tooltip: {
          formatter: (params: any) => {
            const v = params.value;
            return `Job ${v[3]} (${v[5] || '-'})<br/>Duration: ${v[6]} min<br/>` +
              `Start: ${formatDateTime(new Date(v[1]).toISOString())}<br/>End: ${formatDateTime(new Date(v[2]).toISOString())}` +
              `<br/><span style="color:#7b8794;">Click to open this run's Job Logs</span>`;
          }
        },
        grid: { left: 70, right: 16, top: 28, bottom: 44, containLabel: true },
        xAxis: { type: 'time', axisLabel: { fontSize: 8 } },
        yAxis: { type: 'category', data: categories, axisLabel: { fontSize: 9 } },
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, start: this.durationZoomStart, end: this.durationZoomEnd },
          { type: 'slider', xAxisIndex: 0, start: this.durationZoomStart, end: this.durationZoomEnd, height: 18, bottom: 8 }
        ] as any,
        series: [{
          type: 'custom',
          renderItem: (renderParams: any, api: any) => {
            const categoryIndex = api.value(0);
            const start = api.coord([api.value(1), categoryIndex]);
            const end = api.coord([api.value(2), categoryIndex]);
            const height = Math.min(24, api.size([0, 1])[1] * 0.6);
            const rectShape = echarts.graphic.clipRectByRect(
              { x: start[0], y: start[1] - height / 2, width: Math.max(2, end[0] - start[0]), height },
              { x: renderParams.coordSys.x, y: renderParams.coordSys.y, width: renderParams.coordSys.width, height: renderParams.coordSys.height }
            );
            return rectShape && { type: 'rect', shape: rectShape, style: api.style(), transition: [] };
          },
          cursor: 'pointer',
          encode: { x: [1, 2], y: 0 },
          data: bars
        }]
      } as EChartOption;
    }

    public onDurationChartClick(event: any): void {
      const v = event?.value || event?.data?.value || (Array.isArray(event?.data) ? event.data : null);
      const jobId = v?.[3];
      const jobQueueId = v?.[4];
      if (!jobId || !jobQueueId) {
        return;
      }
      this.router.navigate(['jobList/jobLogs'], {
        queryParams: { jobId, jobQueueId, from: 'qMessage' }
      });
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
