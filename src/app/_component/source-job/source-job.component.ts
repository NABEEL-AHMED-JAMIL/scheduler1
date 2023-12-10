import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Action, SourceJobDetail } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AlertService, SourceJobService, WebSocketAPI, WebSocketShareService } from '@/_services/index';  
import { ApiCode } from '@/_models';
import { Router } from '@angular/router';
import { first } from 'rxjs/operators';


@Component({
    selector: 'source-job',
    templateUrl: 'source-job.component.html'
})
export class SourceJobComponent implements OnInit, OnDestroy  {

    @ViewChild('closebutton', {static: false})
	public closebutton;
    public ERROR = 'Error';
    public SUCESS = 'Sucess';
    public hide: any;
    public componenetType: any;
    public SOURCE_JOB_DETAIL_FETCH = 'SourceJob Fetch';
    public DELETE_SOURCE_JOB = "SourceJob Delete";
    public JOB_IN_QUEUE  = "SourceJob In Queue";
    // search detail
    public searchSourceJobDetails: any = ''; 
    // source list
    public sourceJobDetails: SourceJobDetail[] = [];
    public deleteViewSourceJob: SourceJobDetail;
    public deleteSelectedIndex: any
    
    
    constructor(
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService,
        private webSocketAPI: WebSocketAPI,
        private webSocketShareService: WebSocketShareService) {
        this.webSocketAPI.connect();
        this.webSocketShareService.getNewValue()
            .subscribe({
                next: (data) => {
                    if (data) {
                        var jsonPayload = JSON.parse(data);
                        this.sourceJobDetails = this.sourceJobDetails
                            .map(sourceJobDetail => {
                                if (jsonPayload?.jobId === sourceJobDetail?.jobId) {
                                    sourceJobDetail.jobRunningStatus = jsonPayload?.jobRunningStatus;
                                    sourceJobDetail.jobStatus = jsonPayload?.jobStatus;
                                    sourceJobDetail.lastJobRun = jsonPayload?.lastJobRun;
                                    if (jsonPayload.execution == 'Auto') {
                                        sourceJobDetail.scheduler.recurrenceTime = jsonPayload?.recurrenceTime;
                                    }
                                }
                                return sourceJobDetail;
                            });
                    }
                }
            });
    }

    ngOnInit() {
        this.listSourceJob();
    }

    public refreshSourceJobs(): void {
        this.webSocketAPI.connect();
        this.listSourceJob();
    }

    public batchAction(): void {
        this.hide = true;
        this.componenetType = 'job';
    }

    public resetEvent(action:Action): void {
        this.hide = false;
        this.componenetType = 'job';
	}

    public deleteSourceJob(viewSourceJob: SourceJobDetail, selectedIndex: any): void {
        this.deleteViewSourceJob = viewSourceJob;
        this.deleteSelectedIndex = selectedIndex;
    }

    public runSourceJob(sourceJob: SourceJobDetail, selectedIndex: any): void {
        this.spinnerService.show();
        this.sourceJobService.runSourceJob(sourceJob)
        .pipe(first())
        .subscribe((response) => {
            this.spinnerService.hide();
            if(response.status === ApiCode.SUCCESS) {
                //this.alertService.showSuccess(response.message, this.SUCESS);
                return;
            }
            this.alertService.showError(response.message, this.ERROR);
        }, (error) => {
            this.spinnerService.hide();
            this.alertService.showError(error, this.ERROR);
        });
    }

    public skipNextSourceJob(sourceJob: SourceJobDetail, selectedIndex: any): void {
        this.spinnerService.show();
        this.sourceJobService.skipNextSourceJob(sourceJob)
        .pipe(first())
        .subscribe((response) => {
            this.spinnerService.hide();
            if(response.status === ApiCode.SUCCESS) {
                this.listSourceJob();
                this.alertService.showSuccess(response.message, this.SUCESS);
                return;
            }
            this.alertService.showError(response.message, this.ERROR);
        }, (error) => {
            this.alertService.showError(error, this.ERROR);
            this.spinnerService.hide();
        });
    }

    public listSourceJob(): void {
        this.spinnerService.show();
        this.sourceJobService.listSourceJob()
        .pipe(first())
        .subscribe((response) => {
            if(response.status === ApiCode.SUCCESS) {
                this.sourceJobDetails = response.data;
                this.spinnerService.hide();
                return;
            }
            this.spinnerService.hide();
            this.alertService.showError(response.message, this.ERROR);
        }, (error) => {
            this.alertService.showError(error, this.ERROR);
            this.spinnerService.hide();
        });
    }

    public processDeleteSourceJob(): void {
        this.spinnerService.show();
        this.sourceJobService
        .deleteSourceJob(this.deleteViewSourceJob)
        .pipe(first())
        .subscribe((response) => {
            if(response.status === ApiCode.SUCCESS) {
                this.listSourceJob();
                this.deleteViewSourceJob = null;
                this.deleteSelectedIndex = null;
                this.spinnerService.hide();
                this.alertService.showSuccess(response.message, this.DELETE_SOURCE_JOB);
                this.closebutton.nativeElement.click();
                return;
            }
            this.spinnerService.hide();
            this.alertService.showError(response.message, this.ERROR);
        }, (error) => {
            this.spinnerService.hide();
            this.alertService.showError(error, this.ERROR);
        });
    }

    public sourceJobHistoryByJobId(jobId: any): any {
        this.router.navigate(['jobList/jobHistory'],
        { 
          queryParams: {
            jobId: jobId
          }
        });
    }

    public ngOnDestroy(): void {
        this.webSocketAPI.disconnect();
    }

}
