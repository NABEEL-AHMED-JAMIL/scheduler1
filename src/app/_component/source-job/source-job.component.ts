import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Action, SourceJobDetail } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AlertService, SourceJobService } from '@/_services/index';  
import { ApiCode } from '@/_models';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { first } from 'rxjs/operators';

@Component({
    selector: 'source-job',
    templateUrl: 'source-job.component.html'
})
export class SourceJobComponent implements OnInit, OnDestroy  {

    @ViewChild('closebutton', {static: false})
	public closebutton;
    public ERROR = 'Error';
    public hide: any;
    public componenetType: any;
    public SOURCE_JOB_DETAIL_FETCH = 'SourceJob Fetch';
    public DELETE_SOURCE_JOB = "SourceJob Delete";
    public JOB_IN_QUEUE  = "SourceJob In Queue";
    public subscription !: Subscription;
    // search detail
    public searchSourceJobDetails: any = ''; 
    // source list
    public sourceJobDetails: SourceJobDetail[] = [];
    public jobIds: any[];
    public deleteViewSourceJob: SourceJobDetail;
    public deleteSelectedIndex: any
    
    constructor(
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService){
	}

    ngOnInit() {
        this.listSourceJob();
        this.subscription = interval(30000).subscribe((x => {
            this.sourceJobService.fetchRunningJobEvent(
                {
                    'jobIds': this.jobIds
                }
            ).pipe(first())
            .subscribe((response) => {
                if(response.status === ApiCode.SUCCESS) {
                    let responseSourceJobDetails = response.data;
                    this.sourceJobDetails = this.sourceJobDetails
                    .map(sourceJobDetail => {
                        let findJobDetail = responseSourceJobDetails
                        .find(responseSourceJobDetail => responseSourceJobDetail?.jobId === sourceJobDetail?.jobId);
                        if (findJobDetail) {
                            sourceJobDetail.jobRunningStatus = findJobDetail?.jobRunningStatus;
                            sourceJobDetail.jobStatus = findJobDetail?.jobStatus;
                            sourceJobDetail.lastJobRun = findJobDetail?.lastJobRun;
                            if (findJobDetail.execution == 'Auto') {
                                sourceJobDetail.scheduler.recurrenceTime = findJobDetail?.recurrenceTime;                                
                            }
                        }
                        return sourceJobDetail;
                    });
                    return
                }
                this.spinnerService.hide();
                this.alertService.showError(response.message, this.ERROR);
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        }));
    }

    public refreshSourceJobs(): void {
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
                this.listSourceJob();
                //this.alertService.showSuccess(response.message, this.JOB_IN_QUEUE);
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
            console.log(response);
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
                this.jobIds = this.sourceJobDetails
                //.filter(sourceJobDetail => sourceJobDetail.jobStatus !== 'Delete')
                .map(sourceJobDetail => sourceJobDetail.jobId);
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
                this.deleteViewSourceJob.jobStatus = 'Delete';
                this.sourceJobDetails[this.deleteSelectedIndex] = this.deleteViewSourceJob;
                this.spinnerService.hide();
                this.alertService.showSuccess(response.message, this.DELETE_SOURCE_JOB);
                this.closebutton.nativeElement.click();
                this.deleteViewSourceJob = null;
                this.deleteSelectedIndex = null;
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

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }

}
