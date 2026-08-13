import { Component, OnInit, OnDestroy } from '@angular/core';
import { ApiCode } from '../../_models/index';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertService, HomeService } from '@/_services';
import { SpinnerService, SearchFilterPipe } from '@/_helpers';
import { first } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { EChartOption } from 'echarts';
import {
  ColumnBarSegment, JOB_STATUS_COLOR, JOB_STATUS_ORDER, PILL_SUCCESS_COLOR, PILL_DANGER_COLOR,
  FILL_COLOR, EMPTY_COLOR, rowDuration as sharedRowDuration,
  categoricalColumnStats, toPieOptions, jobIdRankedBarOptions,
  booleanFieldsChartOptions as sharedBooleanFieldsChartOptions, formatDateTime
} from '@/_helpers';

@Component({
  selector: 'job-history-action',
  templateUrl: 'job-history-action.component.html'
})
export class JobHistoryActionComponent implements OnInit, OnDestroy {

  public sourceJob: any;
  public sourceJobQueues: any;
  public sourceJobStatistics: any;
  public searchQMessageForm: any = '';

  public readonly jobStatusFilterOptions = JOB_STATUS_ORDER;
  public filterJobStatus: string = '';
  public ERROR: any = 'Error';
  public homePageId: any = '';
  public pipelineId: any = '';

  public showGroupByCharts = true;

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

  private parseTopicPartition(): { topic: string; partitions: string } {
    const raw = String(this.sourceJob?.taskDetail?.sourceTaskType?.queueTopicPartition || '');
    const match = raw.match(/topic=([^&]*)&partitions=\[(.*?)\]/);
    if (match) {
      return { topic: match[1] || '-', partitions: match[2] || '-' };
    }
    return { topic: raw || '-', partitions: '-' };
  }

  public get filteredQueueDatas(): any[] {
    const searched = this.searchFilterPipe.transform(this.sourceJobQueues, this.searchQMessageForm) || [];
    if (!this.filterJobStatus) {
      return searched;
    }
    return searched.filter((row: any) => row.jobStatus === this.filterJobStatus);
  }

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
            `Start: ${formatDateTime(run.startTime)}<br/>` +
            `End: ${formatDateTime(run.endTime)}`;
        }
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisTick: { alignWithLabel: true },
        axisLabel: { interval: Math.max(0, Math.ceil(categories.length / 15) - 1), fontSize: 9 }
      },
      yAxis: {
        type: 'value',
        name: 'min',
        nameTextStyle: { color: '#7b8794' }
      },
      series: [{
        type: 'bar',
        data: durations.map((d: number, i: number) => ({ value: d, itemStyle: { color: colors[i] }, jobId: runs[i].jobId })),
        barMaxWidth: 28,
        cursor: 'pointer'
      }]
    };
  }

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

  public get jobStatusPieOptions(): EChartOption | null {
    return toPieOptions('Job Status', this.jobStatusColumnStats);
  }

  public get booleanFieldsChartOptions(): EChartOption | null {
    return sharedBooleanFieldsChartOptions(this.filteredQueueDatas, [
      { key: 'runManual', label: 'Run Manual' },
      { key: 'skipManual', label: 'Skip Manual' },
      { key: 'jobSend', label: 'Q Send' }
    ]);
  }

  public get jobIdChartOptions(): EChartOption | null {
    if (this.sourceJob) {
      return null;
    }
    return jobIdRankedBarOptions(this.filteredQueueDatas, true);
  }

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
