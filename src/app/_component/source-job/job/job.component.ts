import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { SourceTask, Paging, QueryCriteria, STATUS_LIST } from '@/_models/index';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AlertService, SourceJobService, SourceTaskService } from '@/_services';
import { first } from 'rxjs/operators';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import { Execution, TIMES, FREQUENCY, FREQUENCY_DETAIL, PRIORITY } from '../../../global-config';


@Component({
    selector: 'job',
    templateUrl: 'job.component.html'
})
export class JobComponent implements OnInit {

    public ERROR = 'Error';
    public SUCESS = 'Sucess';
    public jobId: any;
    public sourceJobForm: FormGroup;
    public currentTaskState = 'Add Source Job';
    public submitted: boolean = false;
    public isEditMode: boolean = false;
    public executionTypes: any = Execution;
    public frequencys: any = FREQUENCY;
    public recurrences: any;
    public frequencyDetails: any = FREQUENCY_DETAIL;
    public sourceJobStatus: any = STATUS_LIST;
    public prioritys: any = PRIORITY;
    public times: any = TIMES;

    // pagint
    public paging: Paging;
    public sourceTaskQueryCriteria: QueryCriteria;
    // source list
    public sourceTasks: SourceTask[] = [];
    public selectedSourceTask: SourceTask;
    
    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private fb: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService,
        private sourceTaskService: SourceTaskService) {
    }

    ngOnInit() {
        this._activatedRoute.paramMap
        .subscribe((params: ParamMap) => {
            this.jobId = +params.get('jobId');
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
        let sourceJob: any = {
            jobId: this.sourceJobForm.get('jobId').value,
            jobName: this.sourceJobForm.get('jobName').value,
            taskDetail: {
                taskDetailId: this.sourceJobForm.get('taskDetail').value?.taskDetailId
            },
            execution: this.sourceJobForm.get('executionType').value,
            priority:  this.sourceJobForm.get('priority').value,
            jobStatus: this.sourceJobForm.get('jobStatus').value,
            completeJob: this.sourceJobForm.get('completeJob').value,
            failJob: this.sourceJobForm.get('failJob').value,
            skipJob: this.sourceJobForm.get('skipJob').value,
        }
        if (this.sourceJobForm.get('scheduler')) {
            sourceJob.schedulers = [
                this.sourceJobForm.get('scheduler').value
            ]
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
                    console.log(this.sourceTasks);
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
                        this.sourceJobForm.addControl('scheduler', this.fb.group({
                            schedulerId: new FormControl(response?.data?.scheduler?.schedulerId),
                            startDate: new FormControl(response?.data?.scheduler?.startDate, [Validators.required]),
                            endDate: new FormControl(response?.data?.scheduler?.endDate),
                            startTime: new FormControl(response?.data?.scheduler?.startTime.substring(0,5), [Validators.required]),
                            frequency: new FormControl(response?.data?.scheduler?.frequency, [Validators.required]),
                            recurrence: new FormControl(response?.data?.scheduler?.recurrence, [Validators.required]),
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
            recurrence: new FormControl('',[Validators.required]),
        });
    }

    public onTaskDetailChange(taskDetailId: any): void {
        this.selectedSourceTask = this.sourceTasks
        .find(taskDetail => {
            return taskDetail?.taskDetailId === Number(taskDetailId);
        });
        this.taskDetail.serviceName.setValue(this.selectedSourceTask?.sourceTaskType?.serviceName);
        this.taskDetail.queueTopicPartition.setValue(this.selectedSourceTask?.sourceTaskType?.queueTopicPartition);
        this.taskDetail.taskPayload.setValue(this.selectedSourceTask?.taskPayload);
        this.taskDetail.homePageId.setValue(this.selectedSourceTask?.homePageId);
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
        this.recurrences = this.frequencyDetails
        .find(frequency => {
            return frequency.key === selectFrequency;
        })?.value;
    }

}
