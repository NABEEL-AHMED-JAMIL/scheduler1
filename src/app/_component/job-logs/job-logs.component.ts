import { Component, OnInit } from '@angular/core';
import { ApiCode } from '../../_models/index';
import { SourceJobService, AlertService } from '@/_services/index';
import { ActivatedRoute } from '@angular/router';
import { SpinnerService } from '@/_helpers';
import {Location} from '@angular/common';
import { first } from 'rxjs/operators';

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

  constructor(private alertService: AlertService,
    private spinnerService: SpinnerService,
    private sourceJobService: SourceJobService,
    private _activatedRoute: ActivatedRoute,
    private _location: Location) {
      this._activatedRoute.queryParamMap
      .subscribe(params => {
        this.findSourceJobAuditLog(params?.get('jobQueueId'), params?.get('jobId'));
      });
  }

  ngOnInit() {
  }

  public findSourceJobAuditLog(jobQueueId: any, jobId: any): any {
    this.spinnerService.show();
    this.sourceJobService.findSourceJobAuditLog(jobQueueId, jobId)
    .pipe(first())
    .subscribe((response) => {
      if(response.status === ApiCode.SUCCESS) {
        this.auditLogs = response.data?.auditLogs;
        this.sourceJob = response.data?.sourceJob;
        this.sourceJobQueue = response.data?.sourceJobQueue;
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

  public backClicked(): void {
    // location back
    this._location.back();
  }

}
