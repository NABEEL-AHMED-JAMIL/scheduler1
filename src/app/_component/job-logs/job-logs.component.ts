import { Component, OnInit, OnDestroy } from '@angular/core';
import { ApiCode } from '../../_models/index';
import { SourceJobService, AlertService } from '@/_services/index';
import { ActivatedRoute, Router } from '@angular/router';
import { SpinnerService } from '@/_helpers';
import {Location} from '@angular/common';
import { first } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { EChartOption } from 'echarts';

/** Happy-path stage order for the pipeline tracker -- a run's final stage is either
 * "Completed" or one of the terminal alternates below, swapped in for the last slot. */
const HAPPY_PATH = ['Queue', 'Start', 'Running', 'Completed'];
const TERMINAL_ALTERNATES = ['Failed', 'Interrupt', 'Skip'];
/** Every jobStatus that means the run is over -- Completed, or one of the terminal
 * alternates. Auto-refresh keeps polling while the status is anything else (Queue/Start/
 * Running) and stops the moment it lands on one of these, same set pipelineStages already
 * treats as "done" rather than "in progress". */
const TERMINAL_STATUSES = ['Completed', ...TERMINAL_ALTERNATES];
/** How often to re-poll the audit log while the run is still in flight. */
const AUTO_REFRESH_INTERVAL_MS = 5000;

/** Every chart/table row across the app that links into Job Logs passes its own `from` key in
 * the queryParams (see onRunHistoryChartClick in job-history-action.component.ts,
 * onExpandedJobQueuesChartClick in source-job.component.ts, and onDurationChartClick in
 * queue-message.component.ts) -- this maps that key to where the breadcrumb's "back" crumb
 * should actually go and what it should say. Without this, the crumb was hardcoded to always
 * read "Job History" and rely on browser Location.back(), which was wrong the moment Job Logs
 * became reachable from anywhere else (Job List's own chart, and now Q-Message's duration
 * chart) -- the label lied about the destination, and a refreshed/bookmarked Job Logs page had
 * no real history to go back to at all.
 *
 * `parent` is the crumb *before* this one, only for origins that actually have one -- Job
 * History is itself a drill-down of Job List, so that chain is two real crumbs deep
 * (Job List / Job History), while Job List and Q-Message are each reached directly (one crumb).
 * The breadcrumb used to hardcode a "Job List" crumb ahead of this one unconditionally, which
 * was flat wrong for Q-Message (never under Job List at all) and duplicated itself for Job List
 * (producing "Job List / Job List") -- building the whole chain off this table instead of just
 * the one crumb is what avoids both. */
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
  /** True only for a genuinely in-flight stage (Queue/Start/Running as the current status) --
   * spins the icon the same way every other loading indicator in this app does. */
  spinning: boolean;
}

/** Icon per stage key when reached (done/current) -- Failed/Interrupt/Skip each get a
 * distinct icon instead of a checkmark, since a checkmark reads as "succeeded" regardless of
 * what color the dot behind it is. */
const REACHED_ICONS: { [key: string]: string } = {
  Failed: 'glyphicon-remove',
  Interrupt: 'glyphicon-pause',
  Skip: 'glyphicon-fast-forward'
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
  /** True while the run is still in flight (Queue/Start/Running) and a background poll is
   * scheduled -- drives the "Live" indicator next to the manual Refresh button. */
  public autoRefreshActive = false;
  private autoRefreshTimer: any = null;
  private currentJobQueueId: any;
  private currentJobId: any;
  /** The `from` queryParam of whoever linked in here -- 'jobHistory' | 'jobList' | 'qMessage'
   * (see BACK_TARGETS above), or null for old links/direct visits that don't carry one. */
  private cameFrom: string | null = null;
  /** Timeline is the default "nice" view -- Table stays available for scanning a long run
   * (many chunks/segments) faster than a vertical timeline reasonably allows, and Console
   * reproduces a raw terminal-style scroll of the same lines for people who just want to
   * read the log the way it would have printed. */
  public viewMode: 'timeline' | 'table' | 'console' = 'timeline';
  /** Stored so ngOnDestroy can unsubscribe -- queryParamMap is a long-lived route Observable,
   * not a one-shot HTTP call, so leaving this subscribed past the component's lifetime leaked a
   * dangling subscriber (tied to the router's internal param stream) on every navigation away
   * from this page. */
  private queryParamMapSubscription: Subscription;

  constructor(private alertService: AlertService,
    private spinnerService: SpinnerService,
    private sourceJobService: SourceJobService,
    private _activatedRoute: ActivatedRoute,
    private router: Router,
    private _location: Location) {
      this.queryParamMapSubscription = this._activatedRoute.queryParamMap
      .subscribe(params => {
        // component instance is reused across query-param-only navigation (e.g. picking a
        // different run from Job History without leaving this route) -- drop any poll still
        // scheduled for the previous jobQueueId before switching to the new one
        this.clearAutoRefreshTimer();
        this.currentJobQueueId = params?.get('jobQueueId');
        this.currentJobId = params?.get('jobId');
        this.cameFrom = params?.get('from') || this.cameFrom;
        this.findSourceJobAuditLog(this.currentJobQueueId, this.currentJobId);
      });
  }

  ngOnInit() {
  }

  ngOnDestroy(): void {
    this.clearAutoRefreshTimer();
    this.queryParamMapSubscription?.unsubscribe();
  }

  /** Re-fetches job/queue detail + audit logs for the same jobQueueId/jobId already on screen
   * -- useful while a job is still Running and new log lines are landing, without navigating
   * away and back. Also what auto-refresh itself calls on each tick. */
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

  /** Schedules the next auto-refresh poll iff the run is still in flight (jobStatus not yet
   * one of TERMINAL_STATUSES) -- called after every successful fetch, so it naturally chains
   * itself while Queue/Start/Running and stops on its own the moment Completed/Failed/
   * Interrupt/Skip lands, without a separate watcher. */
  private scheduleAutoRefreshIfRunning(): void {
    this.clearAutoRefreshTimer();
    const status = this.sourceJobQueue?.jobStatus;
    const stillRunning = !!status && TERMINAL_STATUSES.indexOf(status) === -1;
    this.autoRefreshActive = stillRunning;
    if (!stillRunning) {
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

  private applyAuditLogResponse(response: any): void {
    // oldest first, regardless of what order the API returns them in -- the timeline
    // reads top-to-bottom as the pipeline actually ran
    this.auditLogs = (response.data?.auditLogs || []).slice().sort((a: any, b: any) =>
      new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime());
    this.sourceJob = response.data?.sourceJob;
    this.sourceJobQueue = response.data?.sourceJobQueue;
    this.scheduleAutoRefreshIfRunning();
  }

  /** Seconds between each audit log line and the one before it (the run's Start Time stands
   * in for "before" the first line, when known) -- bars this thin against the timeline reveal
   * exactly which step in a run stalled, which the timeline/table views can't show at a glance. */
  public get logGapChartOptions(): EChartOption | null {
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
    const startIndex = anchorTimes.length - logs.length; // 1 if queue startTime was prepended, else 0
    const categories: string[] = [];
    const gaps: number[] = [];
    for (let i = 1; i < anchorTimes.length; i++) {
      const seconds = Math.max(0, Math.round((anchorTimes[i] - anchorTimes[i - 1]) / 100) / 10);
      gaps.push(seconds);
      categories.push(i - startIndex === 0 ? 'Start' : `#${i - startIndex}`);
    }
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    // Slow steps (2x+ the run's average gap) are called out in the "warning" color so a
    // stall stands out from normal step-to-step pacing without needing a legend.
    const colors = gaps.map(g => g > avg * 2 && g > 5 ? '#b5730a' : '#4f46e5');
    return {
      grid: { left: 45, right: 16, top: 24, bottom: 28 },
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
      series: [{
        type: 'bar',
        data: gaps.map((g, i) => ({ value: g, itemStyle: { color: colors[i] } })),
        barMaxWidth: 18
      }]
    };
  }

  public setViewMode(mode: 'timeline' | 'table' | 'console'): void {
    this.viewMode = mode;
  }

  /** Strips tags for the Console view -- logsDetail is bound via innerHTML in the other two
   * views (some lines carry basic markup), but a terminal-style readout should show the log
   * the way it would have printed to stdout, not render that markup. */
  public plainLogText(html: any): string {
    if (!html) {
      return '';
    }
    return String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  }

  /** Queue -> Start -> Running -> Completed on the happy path; a Failed/Interrupt/Skip queue
   * status swaps in for the final slot instead, same status set the "Job Statistics" stat-strip
   * on Job History already uses. Empty until sourceJobQueue.jobStatus is known. */
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
    // Skip is written straight into the Skip status when the run is created (BulkAction#
    // createJobQueue) -- it never actually passes through Start/Running first, unlike Failed/
    // Interrupt which flip an *existing* Queue/Start/Running row after the job genuinely
    // started (BulkAction#changeJobQueueStatus). Without this, the "i < currentIndex" rule
    // below -- correct for Failed/Interrupt -- also falsely checkmarked Start/Running for a
    // Skip that was never run at all.
    const bypassedStages = current === 'Skip' ? new Set(['Start', 'Running']) : new Set<string>();
    return path.map((key, i) => {
      if (bypassedStages.has(key)) {
        return { key, label: key, state: 'pending', icon: 'glyphicon-time', spinning: false };
      }
      // A terminal status (Completed/Failed/Interrupt/Skip) means the run is over, not "in
      // progress" -- it renders as done even though it's the last stage reached. Only
      // Queue/Start/Running show the pulsing "current" treatment, since those are genuinely
      // still-in-flight states.
      let state: PipelineStage['state'] = i < currentIndex || (i === currentIndex && isTerminal) ? 'done'
        : i === currentIndex ? 'current' : 'pending';
      let icon = state === 'pending' ? 'glyphicon-time'
        : (REACHED_ICONS[key] || (state === 'current' ? 'glyphicon-refresh' : 'glyphicon-ok'));
      return { key, label: key, state, icon, spinning: state === 'current' && icon === 'glyphicon-refresh' };
    });
  }

  /** The breadcrumb's second-to-last crumb -- reflects wherever this Job Logs view was actually
   * linked in from (see BACK_TARGETS above), instead of a hardcoded "Job History" that was wrong
   * whenever the link came from Job List or Q-Message. Falls back to "Job History" (the original
   * label) for old links/direct visits with no `from`, since Location.back() is still the fallback
   * behavior for those. */
  public get backLabel(): string {
    return (this.cameFrom && BACK_TARGETS[this.cameFrom]?.label) || 'Job History';
  }

  /** The crumb *before* backLabel, if this origin has one (see BACK_TARGETS.parent) -- null for
   * origins reached directly (Job List, Q-Message) so the breadcrumb doesn't show a "Job List"
   * ancestor crumb that either doesn't apply (Q-Message) or duplicates backLabel itself (Job
   * List). Falls back to the same "Job List" parent as the jobHistory origin for old links with
   * no `from`, matching backLabel's own fallback to "Job History" -- together they reproduce
   * this page's original, unconditional "Job List / Job History" breadcrumb for those. */
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
      // Known origin -- navigate there directly rather than trusting browser history, which
      // breaks the moment this page was reached via a refresh/bookmark/new tab (no "back" to
      // go to) or via picking several different runs in a row (each one pushes its own history
      // entry, so a single "back" would just land on the previous run instead of the list).
      this.router.navigate(target.commands, {
        queryParams: target.queryParams ? target.queryParams(this.currentJobId) : undefined
      });
      return;
    }
    // Unknown origin (old link with no `from`) -- same behavior this always had.
    this._location.back();
  }

}
