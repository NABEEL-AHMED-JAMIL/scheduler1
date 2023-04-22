import { Component, OnInit } from '@angular/core';
import { SpinnerService } from '@/_helpers';
import { ActivatedRoute, ParamMap, Router } from '@angular/router'
import { first } from 'rxjs/operators';
import { ApiCode, STATUS_LIST } from '@/_models';
import { SourceTaskType, LookupData } from '@/_models/index';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AlertService, SettingService, SourceTaskService, ConfigurationMakerService } from '@/_services';

@Component({
    selector: 'task',
    templateUrl: 'task.component.html',
})
export class TaskComponent implements OnInit {

    public ERROR = 'Error';
    public SUCESS = 'Sucess';
    public taskDetailId: any;
	public submitted: boolean = false;
    public isEditMode: boolean = false;
    public sourceTaskTypes: SourceTaskType[] = [];
    public lookupDate: LookupData[] = [];
    public sourceTaskStatus: any = STATUS_LIST;
    public sourceTaskForm: FormGroup;
    public currentTaskState = 'Add Task';
    public PIPELINE_IDS = 'PIPELINE_IDS';
    public PIPLINE_HOME_PAGES = 'PIPLINE_HOME_PAGES';
    public pipelineIdList: any;
    public piplineHomePageList: any;

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private formBuilder: FormBuilder,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private settingService: SettingService,
        private sourceTaskService: SourceTaskService,
        private xmlService: ConfigurationMakerService) {
    }

    ngOnInit() {
        this._activatedRoute.paramMap
        .subscribe((params: ParamMap) => {
            this.taskDetailId = +params.get('taskDetailId');
        });
        this.appSetting();
        if (this.taskDetailId) {
            this.currentTaskState = 'Update Task';
            this.isEditMode = true;
            this.fetchSourceTaskWithSourceTaskId();
        } else {
            this.addSourceTaskFormInit();
        }
    }

    public appSetting(): void {
        this.spinnerService.show();
        this.settingService.appSetting()
            .pipe(first())
            .subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
                    // only the active task can be show
					this.sourceTaskTypes = response.data.sourceTaskTaypes.filter(sourceTask => sourceTask.status == 'Active');
                    // PIPELINE_IDS
                    if (response.data.lookupDatas.find(el => el.lookupType === this.PIPELINE_IDS)) {
                        this.settingService.fetchSubLookupByParentId(
                            response.data.lookupDatas.find(el => el.lookupType === this.PIPELINE_IDS).lookupId)
                        .pipe(first())
                        .subscribe((response) => {
                            if(response.status === ApiCode.SUCCESS) {
                                this.spinnerService.hide();
                                this.pipelineIdList = response.data.lookupDatas;
                                console.log(this.pipelineIdList);
                            } else {
                                this.spinnerService.hide();
                                this.alertService.showError(response.message, this.ERROR);
                            }
                        }, (error) => {
                            this.spinnerService.hide();
                            this.alertService.showError(error, this.ERROR);
                        });
                    }
                    // PIPLINE_HOME_PAGES
                    if (response.data.lookupDatas.find(el => el.lookupType === this.PIPLINE_HOME_PAGES)) {
                        this.settingService.fetchSubLookupByParentId(
                            response.data.lookupDatas.find(el => el.lookupType === this.PIPLINE_HOME_PAGES).lookupId)
                        .pipe(first())
                        .subscribe((response) => {
                            if(response.status === ApiCode.SUCCESS) {
                                this.spinnerService.hide();
                                this.piplineHomePageList = response.data.lookupDatas;
                                console.log(this.piplineHomePageList);
                            } else {
                                this.spinnerService.hide();
                                this.alertService.showError(response.message, this.ERROR);
                            }
                        }, (error) => {
                            this.spinnerService.hide();
                            this.alertService.showError(error, this.ERROR);
                        });
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

    public fetchSourceTaskWithSourceTaskId(): void {
        this.spinnerService.show();
        this.sourceTaskService.fetchSourceTaskWithSourceTaskId(this.taskDetailId)
            .pipe(first())
            .subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
                    this.sourceTaskForm = this.formBuilder.group({
                        taskDetailId: [response?.data?.taskDetailId],
                        taskName: [response?.data?.taskName, Validators.required],
                        sourceTaskTypeId: [response?.data?.sourceTaskType?.sourceTaskTypeId, Validators.required],
                        taskPayload: [response?.data?.taskPayload, Validators.required],
                        taskStatus: [response?.data?.taskStatus],
                        homePageId: [response?.data?.homePageId],
                        pipelineId: [response?.data?.pipelineId],
                        tagsInfo: this.formBuilder.array([]),
                    });
                    if (response?.data?.xmlTagsInfo.length > 0) {
                        for (let i = 0; i < response?.data?.xmlTagsInfo.length; i++) {
                            this.tageFormsAddItemV1(response?.data?.xmlTagsInfo[i]);
                        }
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

    public addSourceTaskFormInit(): any {
		this.spinnerService.show();
		this.sourceTaskForm = this.formBuilder.group({
			taskDetailId: [],
			taskName: ['', Validators.required],
            sourceTaskTypeId: ['', Validators.required],
            taskPayload: ['', Validators.required],
            taskStatus: [],
            homePageId: [],
            pipelineId: [],
            tagsInfo: this.formBuilder.array([
                this.buildItem(),
                this.buildItem(),
                this.buildItem(),
                this.buildItem(),
            ]),
        });
		this.spinnerService.hide();
	}

    public buildItem(): any {
        return new FormGroup({
            taskPayloadId: new FormControl(null),
            tagKey: new FormControl(null),
            tagParent: new FormControl(null),
            tagValue: new FormControl(null),
        });
    }

    public buildItemWithValue(tagInfo: any): any {
        return new FormGroup({
            taskPayloadId: new FormControl(tagInfo?.taskPayloadId),
            tagKey: new FormControl(tagInfo?.tagKey),
            tagParent: new FormControl(tagInfo?.tagParent),
            tagValue: new FormControl(tagInfo?.tagValue),
        });
    }

    public submintTageForms(sourceTask: any): any {
        let xmlInfo =  {
            xmlTagsInfo: sourceTask
        }
        this.xmlService.getXmlData(xmlInfo)
        .pipe(first())
        .subscribe((response: any) => {
            this.sourceTaskForm.controls['taskPayload'].setValue(response.message);
        }, error => {
            console.log('Error :- ' + JSON.stringify(error));
        });
    }

    public submitSourceTask(): void {
        this.submitted = true;
		this.spinnerService.show();
		if (this.sourceTaskForm.invalid) {
			this.spinnerService.hide();
			return;
		}
        let sourceTask: any = {
            taskDetailId: this.sourceTaskForm.get('taskDetailId').value,
            taskName: this.sourceTaskForm.get('taskName').value,
            sourceTaskType: {
                sourceTaskTypeId: this.sourceTaskForm.get('sourceTaskTypeId').value
            },
            taskPayload: this.sourceTaskForm.get('taskPayload').value,
            taskStatus: this.sourceTaskForm.get('taskStatus').value,
            homePageId: this.sourceTaskForm.get('homePageId').value,
            pipelineId: this.sourceTaskForm.get('pipelineId').value,
            xmlTagsInfo: this.tageForms.value
        }
        if (this.taskDetailId) {
            this.sourceTaskService.updateSourceTask(sourceTask)
            .pipe(first())
			.subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.alertService.showSuccess(response.message, this.SUCESS);
                    // route to source task list
                    this._router.navigateByUrl('/taskList');
				} else {
					this.spinnerService.hide();
					this.alertService.showError(response.message, this.ERROR);
				}
			}, (error) => {
				this.spinnerService.hide();
				this.alertService.showError(error, this.ERROR);
			});
        } else {
            this.sourceTaskService.addSourceTask(sourceTask)
            .pipe(first())
			.subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.alertService.showSuccess(response.message, this.SUCESS);
                    // route to source task list
                    this._router.navigateByUrl('/taskList');
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

	public get sourceTask() {
		return this.sourceTaskForm.controls;
	}

    public get tageForms(): FormArray {
        return this.sourceTaskForm.get('tagsInfo') as FormArray;
    }
    
    public tageFormsAddItem(): void {
        this.tageForms.push(this.buildItem());
    }

    private tageFormsAddItemV1(tagInfo: any): void {
        this.tageForms.push(this.buildItemWithValue(tagInfo));
    }
    
    public tageFormAddItem(index: number): void {
        this.tageForms.insert(index, this.buildItem());
    }

    public tageFormRemoveItem(index: number): void {
        this.tageForms.removeAt(index);
    }

}
