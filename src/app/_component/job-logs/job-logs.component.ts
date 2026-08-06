import { Component, OnInit } from '@angular/core';
import { ApiCode } from '../../_models/index';
import { SourceJobService, AlertService } from '@/_services/index';
import { ActivatedRoute } from '@angular/router';
import { SpinnerService } from '@/_helpers';
import {Location} from '@angular/common';
import { first } from 'rxjs/operators';

/** Happy-path stage order for the pipeline tracker -- a run's final stage is either
 * "Completed" or one of the terminal alternates below, swapped in for the last slot. */
const HAPPY_PATH = ['Queue', 'Start', 'Running', 'Completed'];
const TERMINAL_ALTERNATES = ['Failed', 'Interrupt', 'Skip'];

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
export class JobLogComponent implements OnInit {

  public SUCCESS = 'SUCCESS';
  public ERROR = 'Error';
  public auditLogs: any;
  public sourceJob: any;
  public sourceJobQueue: any;
  public searchAuditLogsForm: any = '';
  public selectedLog: any = '';
  public refreshing = false;
  private currentJobQueueId: any;
  private currentJobId: any;
  /** Timeline is the default "nice" view -- Table stays available for scanning a long run
   * (many chunks/segments) faster than a vertical timeline reasonably allows. */
  public viewMode: 'timeline' | 'table' = 'timeline';

  constructor(private alertService: AlertService,
    private spinnerService: SpinnerService,
    private sourceJobService: SourceJobService,
    private _activatedRoute: ActivatedRoute,
    private _location: Location) {
      this._activatedRoute.queryParamMap
      .subscribe(params => {
        this.currentJobQueueId = params?.get('jobQueueId');
        this.currentJobId = params?.get('jobId');
        this.findSourceJobAuditLog(this.currentJobQueueId, this.currentJobId);
      });
  }

  ngOnInit() {
  }

  /** Re-fetches job/queue detail + audit logs for the same jobQueueId/jobId already on screen
   * -- useful while a job is still Running and new log lines are landing, without navigating
   * away and back. */
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

  private applyAuditLogResponse(response: any): void {
    // oldest first, regardless of what order the API returns them in -- the timeline
    // reads top-to-bottom as the pipeline actually ran
    this.auditLogs = (response.data?.auditLogs || []).slice().sort((a: any, b: any) =>
      new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime());
    this.sourceJob = response.data?.sourceJob;
    this.sourceJobQueue = response.data?.sourceJobQueue;
  }

  public showLogDetail(audit: any): void {
    this.selectedLog = audit?.logsDetail;
  }

  public setViewMode(mode: 'timeline' | 'table'): void {
    this.viewMode = mode;
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
    return path.map((key, i) => {
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

  public backClicked(): void {
    // location back
    this._location.back();
  }

}
