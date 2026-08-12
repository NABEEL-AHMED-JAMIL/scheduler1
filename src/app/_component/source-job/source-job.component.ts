import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Action, SourceJobDetail } from '@/_models/index';
import { SpinnerService, SearchFilterPipe } from '@/_helpers';
import {
    AlertService,
    SourceJobService,
    WebSocketAPI,
    WebSocketShareService
} from '@/_services/index';  
import { ApiCode, STATUS_LIST } from '@/_models';
import { Router } from '@angular/router';
import { first } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { EChartOption } from 'echarts';

// Run-status colors kept in step with the .status-* pill classes in app.less so the
// chart reads as an extension of the table, not a separate palette.
const JOB_QUEUE_STATUS_COLOR: { [status: string]: string } = {
    Queue: '#0c7c8c',
    Start: '#283593',
    Running: '#b5730a',
    Failed: '#c0392b',
    Completed: '#1d7a3f',
    Interrupt: '#6a3bbf',
    Skip: '#566573'
};


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
    // status filter -- Active/Inactive, on top of the free-text search. 'Delete' left out of
    // the options on purpose -- a deleted job is never shown at all (see filteredSourceJobDetails),
    // so filtering *for* Delete would always yield nothing.
    public readonly statusFilterOptions = STATUS_LIST.filter((s: any) => s.value !== 'Delete');
    public statusFilter: any = 'All';
    // source list
    public sourceJobDetails: SourceJobDetail[] = [];
    public selectedSourceJobIds: Set<any> = new Set<any>();
    public selectAllSourceJobs = false;
    public deleteViewSourceJob: SourceJobDetail | null = null;
    public deleteSelectedIndex: any = null;
    /** Table stays the default (this list is dense/operational, matching every other admin
     * screen); Card is an alternative view for browsing/scanning fewer jobs at a glance. */
    public viewMode: 'table' | 'card' = 'table';
    // View mode (table/card) is remembered across reloads -- without this, refreshing
    // the page (or the in-app Refresh button re-creating this component) always fell
    // back to the 'table' default and silently threw away the user's choice.
    private readonly VIEW_MODE_STORAGE_KEY = 'sourceJobViewMode';
    // Client-side pagination -- the API returns the full list in one shot, so search +
    // paging are both applied here to keep them instant and in sync with each other.
    public readonly pageSizeOptions = [50, 100, 150, 200];
    public pageSize = 50;
    public currentPage = 1;
    // Row expand (table view) -- linked task + job queue (run history) detail.
    // Queue list is only fetched the first time a row is expanded, then cached per jobId
    // so re-collapsing/re-expanding the same row doesn't refetch.
    public expandedJobId: any = null;
    public expandedJobQueuesLoading = false;
    private expandedJobQueuesCache: { [jobId: string]: any[] } = {};
    private webSocketShareSubscription: Subscription;

    
    constructor(
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService,
        private webSocketAPI: WebSocketAPI,
        private webSocketShareService: WebSocketShareService,
        private searchFilterPipe: SearchFilterPipe) {
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
        const savedViewMode = localStorage.getItem(this.VIEW_MODE_STORAGE_KEY);
        if (savedViewMode === 'table' || savedViewMode === 'card') {
            this.viewMode = savedViewMode;
        }
        this.listSourceJob();
    }

    public refreshSourceJobs(): void {
        this.webSocketAPI.connect();
        this.listSourceJob();
    }

    public setViewMode(mode: 'table' | 'card'): void {
        this.viewMode = mode;
        localStorage.setItem(this.VIEW_MODE_STORAGE_KEY, mode);
    }

    // Filtered (search + status applied) list -- the single source of truth pagination is
    // computed from, so the page count always matches what search/filter would show.
    public get filteredSourceJobDetails(): SourceJobDetail[] {
        const searched = (this.searchFilterPipe.transform(this.sourceJobDetails, this.searchSourceJobDetails) || [])
            .filter((job: SourceJobDetail) => job.jobStatus !== 'Delete');
        if (this.statusFilter === 'All') {
            return searched;
        }
        return searched.filter((job) => job.jobStatus === this.statusFilter);
    }

    public get totalPages(): number {
        return Math.max(1, Math.ceil(this.filteredSourceJobDetails.length / this.pageSize));
    }

    public get pagedSourceJobDetails(): SourceJobDetail[] {
        const start = (this.currentPage - 1) * this.pageSize;
        return this.filteredSourceJobDetails.slice(start, start + this.pageSize);
    }

    /** trackBy for both the card grid and table view -- jobId is each row's stable identity, so
     * Angular can diff by it instead of default object identity and skip re-rendering rows that
     * didn't actually change (e.g. on every websocket-pushed status update elsewhere in the
     * list). */
    public trackByJobId(_index: number, sourceJob: SourceJobDetail): any {
        return sourceJob.jobId;
    }

    public onSearchChange(searchText: any): void {
        this.searchSourceJobDetails = searchText;
        this.currentPage = 1;
    }

    public onStatusFilterChange(status: any): void {
        this.statusFilter = status;
        this.currentPage = 1;
    }

    public goToPage(page: number): void {
        if (page < 1 || page > this.totalPages || page === this.currentPage) {
            return;
        }
        this.currentPage = page;
    }

    public onPageSizeChange(size: any): void {
        this.pageSize = Number(size) || this.pageSize;
        this.currentPage = 1;
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
            // Only the current page is visible next to the header checkbox, so "select
            // all" selects what's on screen rather than every job across every page.
            this.pagedSourceJobDetails.forEach(job => {
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
                // clamp instead of resetting to page 1 -- keeps the user's place on a
                // manual refresh, only pulling back if the list shrank under them
                if (this.currentPage > this.totalPages) {
                    this.currentPage = this.totalPages;
                }
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

    public get expandedJobQueues(): any[] {
        return this.expandedJobQueuesCache[this.expandedJobId] || [];
    }

    // Duration (minutes) of each run, oldest first so the bars read left-to-right
    // chronologically -- expandedJobQueues itself stays newest-first for the table above.
    public get expandedJobQueuesChartOptions(): EChartOption | null {
        const runs = this.expandedJobQueues
            .filter(q => q.startTime && q.endTime)
            .slice()
            .reverse();
        if (!runs.length) {
            return null;
        }
        const categories = runs.map(q => `#${q.jobQueueId}`);
        const durations = runs.map(q => {
            const minutes = (new Date(q.endTime).getTime() - new Date(q.startTime).getTime()) / 60000;
            return Math.max(0, Math.round(minutes * 10) / 10);
        });
        const colors = runs.map(q => JOB_QUEUE_STATUS_COLOR[q.jobStatus] || '#7b8794');
        return {
            grid: { left: 45, right: 16, top: 24, bottom: 28 },
            // trigger:'item' required hovering the bar's own (often 1-2px tall) rectangle --
            // next to one long-running outlier, every normal run rounds down to a sliver too
            // short to reliably point at, so hover felt broken/showed nothing (or the wrong
            // run, snagged from whatever was last visible). 'axis' + a shadow axisPointer makes
            // the whole category column hoverable, at any bar height.
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any) => {
                    const p = Array.isArray(params) ? params[0] : params;
                    const run = runs[p.dataIndex];
                    return `Run ${p.name}<br/>${run.jobStatus}: ${p.value} min<br/>` +
                        `Start: ${this.formatDateTime(run.startTime)}<br/>` +
                        `End: ${this.formatDateTime(run.endTime)}`;
                }
            },
            xAxis: {
                type: 'category',
                data: categories,
                axisTick: { alignWithLabel: true }
            },
            yAxis: {
                type: 'value',
                name: 'min',
                nameTextStyle: { color: '#7b8794' }
            },
            series: [{
                type: 'bar',
                data: durations.map((d, i) => ({ value: d, itemStyle: { color: colors[i] } })),
                barMaxWidth: 28,
                // Bars navigate to that run's Job Logs on click (onExpandedJobQueuesChartClick)
                // -- pointer cursor is the only hint of that.
                cursor: 'pointer'
            }]
        };
    }

    /** Queue List (Run History) chart click -> that run's Job Logs -- categories are literally
     * `#${jobQueueId}` (see expandedJobQueuesChartOptions above), so the clicked bar's own
     * category label is the jobQueueId. jobId comes from expandedJobId (the row this chart
     * belongs to), not the click event, since the bar itself doesn't carry it. */
    public onExpandedJobQueuesChartClick(event: any): void {
        const jobQueueId = String(event?.name || '').replace(/^#/, '');
        if (!jobQueueId || !this.expandedJobId) {
            return;
        }
        this.router.navigate(['jobList/jobLogs'], {
            queryParams: { jobId: this.expandedJobId, jobQueueId, from: 'jobList' }
        });
    }

    /** Formats an ISO datetime string as 'yyyy-MM-dd HH:mm:ss' -- matches the DatePipe format
     * used everywhere else in this app, but this one's built inline (no Angular pipe injection)
     * since it only ever runs inside an echarts tooltip formatter callback. */
    private formatDateTime(value: any): string {
        if (!value) {
            return '-';
        }
        const d = new Date(value);
        if (isNaN(d.getTime())) {
            return '-';
        }
        const pad = (n: number) => n < 10 ? '0' + n : '' + n;
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
            `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    public toggleExpandJob(jobId: any): void {
        if (this.expandedJobId === jobId) {
            this.expandedJobId = null;
            return;
        }
        this.expandedJobId = jobId;
        if (this.expandedJobQueuesCache[jobId]) {
            return;
        }
        this.expandedJobQueuesLoading = true;
        this.sourceJobService.fetchSourceJobQueueListWithJobId(jobId)
            .pipe(first())
            .subscribe((response) => {
                this.expandedJobQueuesLoading = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.expandedJobQueuesCache[jobId] = response.data?.jobQueues || [];
                    return;
                }
                this.alertService.showError(response.message, this.ERROR);
            }, (error) => {
                this.expandedJobQueuesLoading = false;
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
