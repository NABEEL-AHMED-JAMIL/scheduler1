import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { first } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import {
    Paging,
    STATUS_LIST,
    SourceTask,
    QueryCriteria,
} from '@/_models/index';
import {
    FormBuilder,
    FormControl,
    FormGroup,
    Validators
} from '@angular/forms';
import {
    AlertService,
    SourceJobService,
    SourceTaskService
} from '@/_services';
import {
    Execution,
    TIMES,
    FREQUENCY,
    FREQUENCY_DETAIL,
    FREQUENCY_LABEL,
    DAYS_OF_WEEK,
    DAY_OF_MONTH_OPTIONS,
    PRIORITY,
    parseTopicPartition
} from '../../../global-config';

@Component({
    selector: 'job',
    templateUrl: 'job.component.html'
})
export class JobComponent implements OnInit, OnDestroy {

    public ERROR = 'Error';
    public SUCESS = 'Sucess';
    public jobId: number | null = null;
    public sourceJobForm!: FormGroup;
    public currentTaskState = 'Add Source Job';
    public submitted = false;
    public isEditMode = false;
    public executionTypes: any = Execution;
    public frequencys: any = FREQUENCY;
    public frequencyLabel: any = FREQUENCY_LABEL;
    public intervalOptions: any;
    public frequencyDetails: any = FREQUENCY_DETAIL;
    public daysOfWeekOptions = DAYS_OF_WEEK;
    public dayOfMonthOptions = DAY_OF_MONTH_OPTIONS;
    public sourceJobStatus: any = STATUS_LIST;
    public prioritys: any = PRIORITY;
    public times: any = TIMES;

    public paging!: Paging;
    public sourceTaskQueryCriteria!: QueryCriteria;

    public sourceTasks: SourceTask[] = [];
    public selectedSourceTask: SourceTask | null = null;

    private paramMapSubscription!: Subscription;

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private fb: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService,
        private sourceTaskService: SourceTaskService) {
    }

    ngOnInit() {
        this.paramMapSubscription = this._activatedRoute.paramMap
        .subscribe((params: ParamMap) => {
            const id = params.get('jobId');
            this.jobId = id !== null ? Number(id) : null;
        });
        this.sourceTaskQueryCriteria = {
            page: 1,
            limit: 5000,
            order: 'DESC',
            columnName: 'st.task_detail_id'
        }
        if (this.jobId) {
            this.currentTaskState = 'Update Source Job';
            this.isEditMode = true;
            this.fetchSourceJobDetailWithSourceJobId();
        } else {
            this.addSourceJobFormInit();
        }
        this.loadSourceTaskTargetPage(this.sourceTaskQueryCriteria);
    }

    ngOnDestroy(): void {
        this.paramMapSubscription?.unsubscribe();
    }

    private loadSourceTaskTargetPage(queryCriteria: QueryCriteria) {
        this.listSourceTask(queryCriteria);
    }

    public onSubmit() {
        this.submitted = true;
        this.spinnerService.show();
        if (this.sourceJobForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        const sourceJob: any = {
            jobId: this.sourceJobForm.get('jobId')?.value,
            jobName: this.sourceJobForm.get('jobName')?.value,
            taskDetail: {
                taskDetailId: this.sourceJobForm.get('taskDetail')?.value?.taskDetailId
            },
            execution: this.sourceJobForm.get('executionType')?.value,
            priority: this.sourceJobForm.get('priority')?.value,
            jobStatus: this.sourceJobForm.get('jobStatus')?.value,
            completeJob: this.sourceJobForm.get('completeJob')?.value,
            failJob: this.sourceJobForm.get('failJob')?.value,
            skipJob: this.sourceJobForm.get('skipJob')?.value,
        };
        const schedulerControl = this.sourceJobForm.get('scheduler');
        if (schedulerControl) {
            const schedulerValue = schedulerControl.value;
            sourceJob.schedulers = [{
                ...schedulerValue,
                daysOfWeek: (schedulerValue.daysOfWeek && schedulerValue.daysOfWeek.length)
                    ? schedulerValue.daysOfWeek.join(',') : null,
                dayOfMonth: (schedulerValue.dayOfMonth === '' || schedulerValue.dayOfMonth === undefined)
                    ? null : schedulerValue.dayOfMonth,
            }];
        }
        if (this.jobId) {
            this.sourceJobService.updateSourceJob(sourceJob)
            .pipe(first())
            .subscribe((response) => {
                if(response.status === ApiCode.SUCCESS) {
                    this.spinnerService.hide();
                    this.alertService.showSuccess(response.message, this.SUCESS);
                    this._router.navigateByUrl('/jobList');
                } else {
                    this.spinnerService.hide();
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        } else {
            this.sourceJobService.addSourceJob(sourceJob)
            .pipe(first())
            .subscribe((response) => {
                if(response.status === ApiCode.SUCCESS) {
                    this.spinnerService.hide();
                    this.alertService.showSuccess(response.message, this.SUCESS);
                    this._router.navigateByUrl('/jobList');
                } else {
                    this.spinnerService.hide();
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        }
    }

    public listSourceTask(queryCriteria: QueryCriteria): void {
        this.spinnerService.show();
        this.sourceTaskService.listSourceTask(queryCriteria)
          .pipe(first())
          .subscribe((response) => {
                if(response.status === ApiCode.SUCCESS) {
                    this.sourceTasks = response.data
                    .filter((sourceTask: any) => {
                        if (sourceTask.taskStatus === 'Active')
                            return sourceTask;
                    });
                    this.paging = response.paging;
                    this.spinnerService.hide();
              } else {
                    this.alertService.showError(response.message, this.ERROR);
                    this.spinnerService.hide();
              }
        }, (error) => {
            this.alertService.showError(error, this.ERROR);
            this.spinnerService.hide();
        });
    }

    public addSourceJobFormInit(): any {
        this.spinnerService.show();
        this.selectedSourceTask = null;
        this.sourceJobForm = this.fb.group({
            jobId: [],
            jobName: ['', Validators.required],
            executionType: ['', Validators.required],
            priority: ['', Validators.required],
            taskDetail: this.fb.group({
                taskDetailId: ['', Validators.required],
                serviceName: ['', Validators.required],
                homePageId: [''],
                pipelineId: [''],
                queueTopicPartition: ['', Validators.required],
                taskPayload: ['', Validators.required],
            }),
            jobStatus: [],
            completeJob: [false],
            failJob: [false],
            skipJob: [false],
        });
        this.spinnerService.hide();
	}

    public fetchSourceJobDetailWithSourceJobId(): void {
        this.spinnerService.show();
        this.sourceJobService.fetchSourceJobDetailWithSourceJobId(this.jobId)
            .pipe(first())
            .subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
                    this.selectedSourceTask = response?.data?.taskDetail?.sourceTaskType;
                    this.sourceJobForm = this.fb.group({
                        jobId: [response?.data?.jobId],
                        jobName: [response?.data?.jobName, Validators.required],
                        executionType: [{
                            value: response?.data?.execution,
                            disabled: true
                        }, Validators.required],
                        priority: [response?.data?.priority, Validators.required],
                        taskDetail: this.fb.group({
                            taskDetailId: [response?.data?.taskDetail?.taskDetailId, Validators.required],
                            serviceName: [response?.data?.taskDetail?.sourceTaskType?.serviceName, Validators.required],
                            homePageId: [response?.data?.taskDetail?.homePageId],
                            pipelineId: [response?.data?.taskDetail?.pipelineId],
                            queueTopicPartition: [response?.data?.taskDetail?.sourceTaskType?.queueTopicPartition, Validators.required],
                            taskPayload: [response?.data?.taskDetail?.taskPayload, Validators.required],
                        }),
                        jobStatus: [response?.data?.jobStatus, Validators.required],
                        completeJob: [response?.data?.completeJob],
                        failJob: [response?.data?.failJob],
                        skipJob: [response?.data?.skipJob],
                    });
                    if (response?.data?.scheduler) {
                        this.onFrequencyChange(response?.data?.scheduler?.frequency);
                        const daysOfWeekCsv = response?.data?.scheduler?.daysOfWeek;
                        this.sourceJobForm.addControl('scheduler', this.fb.group({
                            schedulerId: new FormControl(response?.data?.scheduler?.schedulerId),
                            startDate: new FormControl(response?.data?.scheduler?.startDate, [Validators.required]),
                            endDate: new FormControl(response?.data?.scheduler?.endDate),
                            startTime: new FormControl(response?.data?.scheduler?.startTime?.substring(0,5), [Validators.required]),
                            frequency: new FormControl(response?.data?.scheduler?.frequency, [Validators.required]),
                            intervalValue: new FormControl(response?.data?.scheduler?.intervalValue, [Validators.required]),
                            daysOfWeek: new FormControl(daysOfWeekCsv ? daysOfWeekCsv.split(',').filter(Boolean) : []),
                            dayOfMonth: new FormControl(response?.data?.scheduler?.dayOfMonth ?? null),
                        }));
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

    public get sourceJob() {
        return this.sourceJobForm.controls;
    }

    public get taskDetail() {
        return ((this.sourceJobForm.get('taskDetail') as FormGroup).controls);
    }

    public get taskTopic(): string {
        return parseTopicPartition(this.taskDetail?.queueTopicPartition?.value).topic;
    }

    public get taskPartitions(): string {
        return parseTopicPartition(this.taskDetail?.queueTopicPartition?.value).partitions;
    }

    public copyToClipboard(text: string): void {
        navigator.clipboard.writeText(text);
    }

    public get scheduler() {
        return ((this.sourceJobForm.get('scheduler') as FormGroup).controls);
    }

    private buildItem(): any {
        return this.fb.group({
            schedulerId: new FormControl(),
            startDate: new FormControl('',[Validators.required]),
            endDate: new FormControl(),
            startTime: new FormControl('',[Validators.required]),
            frequency: new FormControl('',[Validators.required]),
            intervalValue: new FormControl('',[Validators.required]),
            daysOfWeek: new FormControl([]),
            dayOfMonth: new FormControl(null),
        });
    }

    public onTaskDetailChange(taskDetailId: any): void {
        const selectedTask = this.sourceTasks.find(taskDetail => {
            return taskDetail?.taskDetailId === Number(taskDetailId);
        });
        this.selectedSourceTask = selectedTask ?? null;
        this.taskDetail.serviceName.setValue(this.selectedSourceTask?.sourceTaskType?.serviceName);
        this.taskDetail.queueTopicPartition.setValue(this.selectedSourceTask?.sourceTaskType?.queueTopicPartition);
        this.taskDetail.taskPayload.setValue(this.selectedSourceTask?.taskPayload);
        this.taskDetail.homePageId.setValue(this.selectedSourceTask?.homePageId);
        this.taskDetail.pipelineId.setValue(this.selectedSourceTask?.pipelineId);
    }

    public onExecutionTypeChange(executionType: any): void {
        if (executionType === 'Auto') {
            if (!this.sourceJobForm.get('scheduler')) {
                this.sourceJobForm.addControl('scheduler', this.buildItem());
          }
        } else if (executionType === 'Manual') {
            if (this.sourceJobForm.get('scheduler')) {
                this.sourceJobForm.removeControl('scheduler');
            }
        }
    }

    public onFrequencyChange(selectFrequency: string): void {
        this.intervalOptions = this.frequencyDetails
        .find((frequency: any) => {
            return frequency.key === selectFrequency;
        })?.value;
    }

    public isDaySelected(dayCode: string): boolean {
        const days: string[] = this.scheduler?.daysOfWeek?.value || [];
        return days.includes(dayCode);
    }

    public toggleDay(dayCode: string): void {
        const control = this.scheduler?.daysOfWeek;
        if (!control) {
            return;
        }
        const days: string[] = [...(control.value || [])];
        const index = days.indexOf(dayCode);
        if (index >= 0) {
            days.splice(index, 1);
        } else {
            days.push(dayCode);
        }
        control.setValue(days);
    }

    public get scheduleSummary(): string {
        if (!this.sourceJobForm?.get('scheduler')) {
            return '';
        }
        const s = this.scheduler;
        const interval = s.intervalValue?.value;
        const frequency = s.frequency?.value;
        const startTime = s.startTime?.value;
        const startDate = s.startDate?.value;
        const endDate = s.endDate?.value;
        if (!interval || !frequency || !startTime) {
            return 'Fill in the schedule fields above to see a preview.';
        }
        const unitPlural = (this.frequencyLabel[frequency] || frequency).toLowerCase();
        const unit = Number(interval) === 1 ? unitPlural.replace(/s$/, '') : unitPlural;
        let repeatText = `Runs every ${interval} ${unit}`;
        if (frequency === 'Weekly') {
            const days: string[] = s.daysOfWeek?.value || [];
            if (days.length) {
                const order = this.daysOfWeekOptions.map((d: any) => d.code);
                const sorted = [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
                const labels = sorted.map(code => this.daysOfWeekOptions.find((d: any) => d.code === code)?.label || code);
                repeatText = `Runs every ${interval} ${unit} on ${labels.join(', ')}`;
            }
        } else if (frequency === 'Monthly') {
            const dayOfMonth = s.dayOfMonth?.value;
            if (dayOfMonth !== null && dayOfMonth !== undefined && dayOfMonth !== '') {
                const dayLabel = Number(dayOfMonth) === 0 ? 'the last day' : `day ${dayOfMonth}`;
                repeatText = `Runs every ${interval} ${unit} on ${dayLabel}`;
            }
        }
        let summary = `${repeatText} at ${startTime}, starting ${startDate || '(pick a start date)'}`;
        summary += endDate ? `, until ${endDate}.` : ', with no end date.';
        return summary;
    }

}
