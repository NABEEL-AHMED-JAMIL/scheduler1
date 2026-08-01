import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Action, SourceJobDetail } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import {
    AlertService,
    SourceJobService,
    WebSocketAPI,
    WebSocketShareService
} from '@/_services/index';  
import { ApiCode } from '@/_models';
import { Router } from '@angular/router';
import { first } from 'rxjs/operators';
import { Subscription } from 'rxjs';


@Component({
    selector: 'source-job',
    templateUrl: 'source-job.component.html'
})
export class SourceJobComponent implements OnInit, OnDestroy  {

    @ViewChild('closebutton', {static: false})
	public closebutton!: any;
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
    public selectedSourceJobIds: Set<any> = new Set<any>();
    public selectAllSourceJobs = false;
    public deleteViewSourceJob: SourceJobDetail | null = null;
    public deleteSelectedIndex: any = null;
    private webSocketShareSubscription: Subscription;

    
    constructor(
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService,
        private webSocketAPI: WebSocketAPI,
        private webSocketShareService: WebSocketShareService) {
        this.webSocketAPI.connect();
        // webSocketShareService is a root-provided singleton -- without unsubscribing in
        // ngOnDestroy, navigating away from and back to this page piles up a new subscriber
        // on every visit, each stale one still firing (and referencing a destroyed component)
        // on every future websocket message.
        this.webSocketShareSubscription = this.webSocketShareService.getNewValue()
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
                                    if (jsonPayload.execution == 'Auto' && sourceJobDetail.scheduler) {
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
                return;
            }
            this.alertService.showError(response.message, this.ERROR);
        }, (error) => {
            this.spinnerService.hide();
            this.alertService.showError(error, this.ERROR);
        });
    }

    public cloneSourceJob(sourceJob: SourceJobDetail, selectedIndex: any): void {
        this.spinnerService.show();
        this.sourceJobService.fetchSourceJobDetailWithSourceJobId(sourceJob.jobId)
            .pipe(first())
            .subscribe((response) => {
                if (response.status !== ApiCode.SUCCESS) {
                    this.spinnerService.hide();
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }

                const sourceData = response.data;
                const addPayload: any = {
                    jobName: sourceData.jobName,
                    taskDetail: {
                        taskDetailId: sourceData?.taskDetail?.taskDetailId
                    },
                    execution: sourceData.execution,
                    priority: sourceData.priority,
                    jobStatus: sourceData.jobStatus,
                    completeJob: sourceData.completeJob,
                    failJob: sourceData.failJob,
                    skipJob: sourceData.skipJob
                };

                if (sourceData.scheduler) {
                    addPayload.schedulers = [{
                        startDate: sourceData.scheduler.startDate,
                        endDate: sourceData.scheduler.endDate,
                        startTime: sourceData.scheduler.startTime,
                        frequency: sourceData.scheduler.frequency,
                        recurrence: sourceData.scheduler.recurrence
                    }];
                }

                this.sourceJobService.addSourceJob(addPayload)
                    .pipe(first())
                    .subscribe((createResponse) => {
                        this.spinnerService.hide();
                        if (createResponse.status === ApiCode.SUCCESS) {
                            this.alertService.showSuccess(createResponse.message, 'Clone');
                            this.listSourceJob();
                            return;
                        }
                        this.alertService.showError(createResponse.message, this.ERROR);
                    }, (error) => {
                        this.spinnerService.hide();
                        this.alertService.showError(error, this.ERROR);
                    });
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public toggleSelectedSourceJob(jobId: any, checked: boolean): void {
        const selectedJob = this.sourceJobDetails.find(job => job.jobId === jobId);
        if (checked && selectedJob && ['Queue', 'Start', 'Running'].includes(selectedJob.jobRunningStatus)) {
            this.alertService.showError('Selected job is already queued or running and cannot be added to batch run.', this.ERROR);
            return;
        }

        if (checked) {
            this.selectedSourceJobIds.add(jobId);
        } else {
            this.selectedSourceJobIds.delete(jobId);
            this.selectAllSourceJobs = false;
        }
    }

    public toggleSelectAllSourceJobs(checked: boolean): void {
        this.selectAllSourceJobs = checked;
        this.selectedSourceJobIds.clear();
        if (checked) {
            this.sourceJobDetails.forEach(job => {
                if (job.jobStatus !== 'Delete' && !['Queue', 'Start', 'Running'].includes(job.jobRunningStatus)) {
                    this.selectedSourceJobIds.add(job.jobId);
                }
            });
        }
    }

    public runSelectedSourceJobs(): void {
        const selectedJobs = this.sourceJobDetails.filter(job => this.selectedSourceJobIds.has(job.jobId) && job.jobStatus !== 'Delete');
        const deletedJobs = this.sourceJobDetails.filter(job => this.selectedSourceJobIds.has(job.jobId) && job.jobStatus === 'Delete');
        if (deletedJobs.length > 0) {
            this.alertService.showError('Deleted jobs cannot be run. They have been removed from selection.', this.ERROR);
        }

        if (selectedJobs.length === 0) {
            this.alertService.showError('Please select at least one non-deleted job to run.', this.ERROR);
            return;
        }

        this.spinnerService.show();
        let completedCount = 0;
        selectedJobs.forEach((job) => {
            this.sourceJobService.runSourceJob({ jobId: job.jobId })
                .pipe(first())
                .subscribe((response) => {
                    completedCount++;
                    if (response.status !== ApiCode.SUCCESS) {
                        this.alertService.showError(`Job ${job.jobId}: ${response.message}`, this.ERROR);
                    }
                    if (completedCount === selectedJobs.length) {
                        this.spinnerService.hide();
                        this.selectedSourceJobIds.clear();
                        this.selectAllSourceJobs = false;
                        this.listSourceJob();
                    }
                }, (error) => {
                    completedCount++;
                    this.alertService.showError(`Job ${job.jobId}: ${error}`, this.ERROR);
                    if (completedCount === selectedJobs.length) {
                        this.spinnerService.hide();
                        this.selectedSourceJobIds.clear();
                        this.selectAllSourceJobs = false;
                        this.listSourceJob();
                    }
                });
        });
    }

    public deleteSelectedSourceJobs(): void {
        const selectedJobs = this.sourceJobDetails.filter(job => this.selectedSourceJobIds.has(job.jobId));
        if (selectedJobs.length === 0) {
            this.alertService.showError('Please select at least one job to delete.', this.ERROR);
            return;
        }

        const invalidDeleteJobs = selectedJobs.filter(job => ['Queue', 'Start', 'Running', 'Failed'].includes(job.jobRunningStatus));
        if (invalidDeleteJobs.length > 0) {
            const invalidMessages = invalidDeleteJobs.map(job => {
                if (['Queue', 'Start', 'Running'].includes(job.jobRunningStatus)) {
                    return `Job ${job.jobId} is ${job.jobRunningStatus} and cannot be deleted now.`;
                }
                return `Job ${job.jobId} has status ${job.jobRunningStatus} and cannot be deleted once it has failed.`;
            });
            this.alertService.showError(`Cannot delete selected jobs:\n${invalidMessages.join('\n')}`, this.ERROR);
            return;
        }

        this.spinnerService.show();
        let completedCount = 0;
        let errorMessages: string[] = [];

        selectedJobs.forEach((job) => {
            this.sourceJobService.deleteSourceJob({ jobId: job.jobId })
                .pipe(first())
                .subscribe((response) => {
                    completedCount++;
                    if (response.status !== ApiCode.SUCCESS) {
                        errorMessages.push(`Job ${job.jobId}: ${response.message}`);
                    }
                    if (completedCount === selectedJobs.length) {
                        this.spinnerService.hide();
                        this.selectedSourceJobIds.clear();
                        this.selectAllSourceJobs = false;
                        this.listSourceJob();
                        if (errorMessages.length) {
                            this.alertService.showError(errorMessages.join('\n'), this.ERROR);
                        } else {
                            this.alertService.showSuccess('Selected jobs deleted successfully.', this.SUCESS);
                        }
                    }
                }, (error) => {
                    completedCount++;
                    errorMessages.push(`Job ${job.jobId}: ${error}`);
                    if (completedCount === selectedJobs.length) {
                        this.spinnerService.hide();
                        this.selectedSourceJobIds.clear();
                        this.selectAllSourceJobs = false;
                        this.listSourceJob();
                        this.alertService.showError(errorMessages.join('\n'), this.ERROR);
                    }
                });
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
                // reverse once here (not in the template's *ngFor) -- Array.reverse() mutates
                // in place, so calling it inside a template expression re-ran it on every
                // change-detection tick, flipping the row order continuously
                this.sourceJobDetails = (response.data || []).reverse();
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
        if (this.webSocketShareSubscription) {
            this.webSocketShareSubscription.unsubscribe();
        }
    }

}
