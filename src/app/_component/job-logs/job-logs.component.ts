import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ApiCode } from '../../_models/index';
import { SourceJobService, AlertService } from '@/_services/index';
import { ActivatedRoute, Router } from '@angular/router';
import { SpinnerService } from '@/_helpers';
import {Location} from '@angular/common';
import { first } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { EChartOption } from 'echarts';

const HAPPY_PATH = ['Queue', 'Start', 'Running', 'Completed'];
const TERMINAL_ALTERNATES = ['Failed', 'Interrupt', 'Skip', 'Missed'];

const TERMINAL_STATUSES = ['Completed', ...TERMINAL_ALTERNATES];

const AUTO_REFRESH_INTERVAL_MS = 5000;

const BACK_TARGETS: {
  [from: string]: { label: string; commands: any[]; queryParams?: (jobId: any) => any; parent?: { label: string; commands: any[] } }
} = {
  jobHistory: {
    label: 'Job History', commands: ['/jobList/jobHistory'], queryParams: (jobId) => ({ jobId }),
    parent: { label: 'Job List', commands: ['/jobList'] }
  },
  jobList: { label: 'Job List', commands: ['/jobList'] },
  qMessage: { label: 'Q-Message', commands: ['/setting/queueMessage'] }
};

interface PipelineStage {
  key: string;
  label: string;
  state: 'done' | 'current' | 'pending';
  icon: string;

  spinning: boolean;
}

const REACHED_ICONS: { [key: string]: string } = {
  Failed: 'glyphicon-remove',
  Interrupt: 'glyphicon-pause',
  Skip: 'glyphicon-fast-forward',
  Missed: 'glyphicon-time'
};

@Component({
    selector: 'job-logs',
    templateUrl: 'job-logs.component.html'
})
export class JobLogComponent implements OnInit, OnDestroy {

  public SUCCESS = 'SUCCESS';
  public ERROR = 'Error';
  public auditLogs: any;
  public sourceJob: any;
  public sourceJobQueue: any;
  public searchAuditLogsForm: any = '';
  public refreshing = false;

  public autoRefreshActive = false;

  public jobStillRunning = false;
  public liveEnabled = true;
  public noJobSelected = false;
  private autoRefreshTimer: any = null;
  private currentJobQueueId: any;
  private currentJobId: any;

  private cameFrom: string | null = null;

  public viewMode: 'timeline' | 'table' | 'console' = 'timeline';

  @ViewChild('logScrollContainer', {static: false}) logScrollContainer: ElementRef<HTMLElement>;
  public stickToBottom = true;

  public logGapChartOptions: EChartOption | null = null;
  private lastZoomStart = 0;
  private lastZoomEnd: number | null = null;

  private queryParamMapSubscription: Subscription;

  constructor(private alertService: AlertService,
    private spinnerService: SpinnerService,
    private sourceJobService: SourceJobService,
    private _activatedRoute: ActivatedRoute,
    private router: Router,
    private _location: Location) {
      this.queryParamMapSubscription = this._activatedRoute.queryParamMap
      .subscribe(params => {

        this.clearAutoRefreshTimer();
        this.currentJobQueueId = params?.get('jobQueueId');
        this.currentJobId = params?.get('jobId');
        this.cameFrom = params?.get('from') || this.cameFrom;
        if (!this.currentJobQueueId && !this.currentJobId) {
          this.noJobSelected = true;
          this.sourceJob = null;
          this.sourceJobQueue = null;
          return;
        }
        this.noJobSelected = false;
        this.findSourceJobAuditLog(this.currentJobQueueId, this.currentJobId);
      });
  }

  ngOnInit() {
  }

  ngOnDestroy(): void {
    this.clearAutoRefreshTimer();
    this.queryParamMapSubscription?.unsubscribe();
  }

  public refresh(): void {
    this.refreshing = true;
    this.sourceJobService.findSourceJobAuditLog(this.currentJobQueueId, this.currentJobId)
    .pipe(first())
    .subscribe((response) => {
      this.refreshing = false;
      if(response.status === ApiCode.SUCCESS) {
        this.applyAuditLogResponse(response);
      } else {
        this.alertService.showError(response.message, this.ERROR);
      }
    }, (error) => {
      this.refreshing = false;
      this.alertService.showError(error, this.ERROR);
    });
  }

  public findSourceJobAuditLog(jobQueueId: any, jobId: any): any {
    this.spinnerService.show();
    this.sourceJobService.findSourceJobAuditLog(jobQueueId, jobId)
    .pipe(first())
    .subscribe((response) => {
      this.spinnerService.hide();
      if(response.status === ApiCode.SUCCESS) {
        this.applyAuditLogResponse(response);
      } else {
        this.alertService.showError(response.message, this.ERROR);
      }
    }, (error) => {
      this.spinnerService.hide();
      this.alertService.showError(error, this.ERROR);
    });
  }

  private scheduleAutoRefreshIfRunning(): void {
    this.clearAutoRefreshTimer();
    const status = this.sourceJobQueue?.jobStatus;
    this.jobStillRunning = !!status && TERMINAL_STATUSES.indexOf(status) === -1;
    this.autoRefreshActive = this.jobStillRunning && this.liveEnabled;
    if (!this.autoRefreshActive) {
      return;
    }
    this.autoRefreshTimer = setTimeout(() => this.refresh(), AUTO_REFRESH_INTERVAL_MS);
  }

  private clearAutoRefreshTimer(): void {
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
    this.autoRefreshActive = false;
  }

  public toggleLive(): void {
    this.liveEnabled = !this.liveEnabled;
    if (this.liveEnabled) {
      this.scheduleAutoRefreshIfRunning();
    } else {
      this.clearAutoRefreshTimer();
    }
  }

  private applyAuditLogResponse(response: any): void {

    this.auditLogs = (response.data?.auditLogs || []).slice().sort((a: any, b: any) =>
      new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime());
    this.sourceJob = response.data?.sourceJob;
    this.sourceJobQueue = response.data?.sourceJobQueue;
    this.logGapChartOptions = this.computeLogGapChartOptions();
    this.scheduleAutoRefreshIfRunning();
    this.scrollToBottomIfSticky();
  }

  public toggleStickToBottom(): void {
    this.stickToBottom = !this.stickToBottom;
    if (this.stickToBottom) {
      this.scrollToBottomIfSticky();
    }
  }

  private scrollToBottomIfSticky(): void {
    if (!this.stickToBottom) {
      return;
    }
    setTimeout(() => {
      const el = this.logScrollContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  public onChartDataZoom(event: any): void {
    const zoomState = event?.batch?.[0] || event;
    if (zoomState && typeof zoomState.start === 'number' && typeof zoomState.end === 'number') {
      this.lastZoomStart = zoomState.start;
      this.lastZoomEnd = zoomState.end;
    }
  }

  private computeLogGapChartOptions(): EChartOption | null {
    const logs = this.auditLogs || [];
    if (logs.length < 2 && !(logs.length === 1 && this.sourceJobQueue?.startTime)) {
      return null;
    }
    const anchorTimes: number[] = [];
    if (this.sourceJobQueue?.startTime) {
      anchorTimes.push(new Date(this.sourceJobQueue.startTime).getTime());
    }
    logs.forEach((l: any) => anchorTimes.push(new Date(l.dateCreated).getTime()));
    if (anchorTimes.length < 2) {
      return null;
    }
    const startIndex = anchorTimes.length - logs.length;
    const categories: string[] = [];
    const gaps: number[] = [];
    for (let i = 1; i < anchorTimes.length; i++) {
      const seconds = Math.max(0, Math.round((anchorTimes[i] - anchorTimes[i - 1]) / 100) / 10);
      gaps.push(seconds);
      categories.push(i - startIndex === 0 ? 'Start' : `#${i - startIndex}`);
    }
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    const colors = gaps.map(g => g > avg * 2 && g > 5 ? '#b5730a' : '#2563eb');

    const READABLE_BAR_COUNT = 80;
    const showsAll = categories.length <= READABLE_BAR_COUNT;
    const defaultEndPct = showsAll ? 100 : Math.round((READABLE_BAR_COUNT / categories.length) * 100);
    const zoomStart = this.lastZoomEnd !== null ? this.lastZoomStart : 0;
    const zoomEnd = this.lastZoomEnd !== null ? this.lastZoomEnd : defaultEndPct;

    return {
      grid: { left: 45, right: 16, top: 24, bottom: 56 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.name}<br/>+${p.value}s since previous`
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { interval: Math.ceil(categories.length / 20) },
        axisTick: { alignWithLabel: true }
      },
      yAxis: {
        type: 'value',
        name: 'sec',
        nameTextStyle: { color: '#7b8794' }
      },
      dataZoom: (showsAll ? undefined : [
        { type: 'inside', start: zoomStart, end: zoomEnd },
        { type: 'slider', start: zoomStart, end: zoomEnd, height: 18, bottom: 8 }
      ]) as any,
      series: [{
        type: 'bar',
        data: gaps.map((g, i) => ({ value: g, itemStyle: { color: colors[i] } })),
        barMaxWidth: 18
      }]
    };
  }

  public setViewMode(mode: 'timeline' | 'table' | 'console'): void {
    this.viewMode = mode;
    this.scrollToBottomIfSticky();
  }

  public plainLogText(html: any): string {
    if (!html) {
      return '';
    }
    return String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  }

  public get pipelineStages(): PipelineStage[] {
    let current = this.sourceJobQueue?.jobStatus;
    if (!current) {
      return [];
    }
    let isTerminal = TERMINAL_ALTERNATES.indexOf(current) > -1 || current === 'Completed';
    let path = TERMINAL_ALTERNATES.indexOf(current) > -1
      ? [...HAPPY_PATH.slice(0, 3), current]
      : HAPPY_PATH;
    let currentIndex = path.indexOf(current);

    const bypassedStages = current === 'Skip' ? new Set(['Start', 'Running']) : new Set<string>();
    return path.map((key, i) => {
      if (bypassedStages.has(key)) {
        return { key, label: key, state: 'pending', icon: 'glyphicon-time', spinning: false };
      }

      let state: PipelineStage['state'] = i < currentIndex || (i === currentIndex && isTerminal) ? 'done'
        : i === currentIndex ? 'current' : 'pending';
      let icon = state === 'pending' ? 'glyphicon-time'
        : (REACHED_ICONS[key] || (state === 'current' ? 'glyphicon-refresh' : 'glyphicon-ok'));
      return { key, label: key, state, icon, spinning: state === 'current' && icon === 'glyphicon-refresh' };
    });
  }

  public get backLabel(): string {
    return (this.cameFrom && BACK_TARGETS[this.cameFrom]?.label) || 'Job History';
  }

  public get backParent(): { label: string; commands: any[] } | null {
    const target = this.cameFrom && BACK_TARGETS[this.cameFrom];
    if (target) {
      return target.parent || null;
    }
    return BACK_TARGETS.jobHistory.parent;
  }

  public backClicked(): void {
    const target = this.cameFrom && BACK_TARGETS[this.cameFrom];
    if (target) {

      this.router.navigate(target.commands, {
        queryParams: target.queryParams ? target.queryParams(this.currentJobId) : undefined
      });
      return;
    }

    this._location.back();
  }

}
