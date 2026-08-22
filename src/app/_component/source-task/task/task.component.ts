import { Component, OnInit, OnDestroy } from '@angular/core';
import {
    ActivatedRoute,
    ParamMap,
    Router
} from '@angular/router'
import { first } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { SpinnerService } from '@/_helpers';
import {
    ApiCode,
    STATUS_LIST
} from '@/_models';
import {
    SourceTaskType,
    LookupData
} from '@/_models/index';
import {
    AbstractControl,
    FormArray,
    FormBuilder,
    FormControl,
    FormGroup,
    ValidationErrors,
    ValidatorFn,
    Validators
} from '@angular/forms';
import { parseTopicPartition } from '../../../global-config';
import {
    AlertService,
    SettingService,
    SourceTaskService,
    ConfigurationMakerService,
    AuthService,
    TenantService
} from '@/_services';

function noWhitespaceValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value = control.value;
        return value && /\s/.test(value) ? { hasSpace: true } : null;
    };
}

@Component({
    selector: 'task',
    templateUrl: 'task.component.html',
})
export class TaskComponent implements OnInit, OnDestroy {

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
    public PIPELINE_HOME_PAGES = 'PIPELINE_HOME_PAGES';
    public TASK_GROUPS = 'TASK_GROUPS';
    public pipelineIdList: any;
    public piplineHomePageList: any;
    public taskGroupList: any;
    public showBucketHelp: boolean = false;
    public isPlatformAdmin: boolean = false;
    public tenants: any[] = [];

    private paramMapSubscription: Subscription;

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private formBuilder: FormBuilder,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private settingService: SettingService,
        private sourceTaskService: SourceTaskService,
        private xmlService: ConfigurationMakerService,
        private authService: AuthService,
        private tenantService: TenantService) {
    }

    ngOnInit() {
        this.paramMapSubscription = this._activatedRoute.paramMap
        .subscribe((params: ParamMap) => {
            this.taskDetailId = +params.get('taskDetailId');
        });
        this.appSetting();
        this.isPlatformAdmin = this.authService.currentUser?.userRole === 'PLATFORM_ADMIN';
        if (this.taskDetailId) {
            this.currentTaskState = 'Update Task';
            this.isEditMode = true;
            this.fetchSourceTaskWithSourceTaskId();
        } else {
            this.addSourceTaskFormInit();
            if (this.isPlatformAdmin) {
                this.loadTenants();
            }
        }
    }

    private loadTenants(): void {
        this.tenantService.listTenants()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.tenants = response.data || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.alertService.showError(error, this.ERROR);
            });
    }

    ngOnDestroy(): void {
        this.paramMapSubscription?.unsubscribe();
    }

    // The keys the pipeline actually reads off a task to locate storage. Recognising one is
    // worth surfacing, because a typo here fails silently at run time rather than on save.
    private static readonly STORAGE_TAG_KEYS = ['bucket', 'bucket_name', 'input_folder', 'output_folder'];

    /**
     * Strips leading/trailing whitespace from a tag field. A trailing space is invisible in
     * the input but travels into the payload, where "etl-bucket " never matches the real
     * bucket and the job fails at run time with nothing obviously wrong on screen. Correcting
     * it silently is friendlier than rejecting the row for a character nobody can see.
     */
    public trimTagField(control: AbstractControl): void {
        const value = control.value;
        if (typeof value !== 'string') {
            return;
        }
        const trimmed = value.trim();
        if (trimmed !== value) {
            control.setValue(trimmed);
        }
    }

    /** Same treatment applied across every tag row, as a safety net on save. */
    private trimAllTagFields(): void {
        const tags = this.sourceTaskForm.get('tagsInfo') as FormArray;
        tags.controls.forEach((row) => {
            ['tagKey', 'tagParent', 'tagValue'].forEach((field) => {
                const control = row.get(field);
                if (control) {
                    this.trimTagField(control);
                }
            });
        });
    }

    public isStorageTagKey(tagKey: string): boolean {
        if (!tagKey) {
            return false;
        }
        return TaskComponent.STORAGE_TAG_KEYS.indexOf(tagKey.trim().toLowerCase()) > -1;
    }

    public toggleBucketHelp(): void {
        this.showBucketHelp = !this.showBucketHelp;
    }

    public taskTopic(queueTopicPartition: any): string {
        return parseTopicPartition(queueTopicPartition).topic;
    }

    public appSetting(): void {
        this.spinnerService.show();
        this.settingService.appSetting()
            .pipe(first())
            .subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();

					this.sourceTaskTypes = response.data.sourceTaskTypes.filter(sourceTask => sourceTask.status == 'Active');

                    if (response.data.lookupDatas.find(el => el.lookupType === this.PIPELINE_IDS)) {
                        this.settingService.fetchSubLookupByParentId(
                            response.data.lookupDatas.find(el => el.lookupType === this.PIPELINE_IDS).lookupId)
                        .pipe(first())
                        .subscribe((response) => {
                            if(response.status === ApiCode.SUCCESS) {
                                this.spinnerService.hide();
                                this.pipelineIdList = response.data.lookupDatas;
                            } else {
                                this.spinnerService.hide();
                                this.alertService.showError(response.message, this.ERROR);
                            }
                        }, (error) => {
                            this.spinnerService.hide();
                            this.alertService.showError(error, this.ERROR);
                        });
                    }

                    if (response.data.lookupDatas.find(el => el.lookupType === this.PIPELINE_HOME_PAGES)) {
                        this.settingService.fetchSubLookupByParentId(
                            response.data.lookupDatas.find(el => el.lookupType === this.PIPELINE_HOME_PAGES).lookupId)
                        .pipe(first())
                        .subscribe((response) => {
                            if(response.status === ApiCode.SUCCESS) {
                                this.spinnerService.hide();
                                this.piplineHomePageList = response.data.lookupDatas;
                            } else {
                                this.spinnerService.hide();
                                this.alertService.showError(response.message, this.ERROR);
                            }
                        }, (error) => {
                            this.spinnerService.hide();
                            this.alertService.showError(error, this.ERROR);
                        });
                    }

                    if (response.data.lookupDatas.find(el => el.lookupType === this.TASK_GROUPS)) {
                        this.settingService.fetchSubLookupByParentId(
                            response.data.lookupDatas.find(el => el.lookupType === this.TASK_GROUPS).lookupId)
                        .pipe(first())
                        .subscribe((response) => {
                            if(response.status === ApiCode.SUCCESS) {
                                this.spinnerService.hide();
                                this.taskGroupList = response.data.lookupDatas;
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

                        homePageId: [response?.data?.homePageId ?? ''],
                        pipelineId: [response?.data?.pipelineId ?? ''],
                        groupId: [response?.data?.groupId ?? ''],
                        tagsInfo: this.formBuilder.array([]),
                    });
                    if (response?.data?.xmlTagsInfo?.length > 0) {
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

            homePageId: [''],
            pipelineId: [''],
            groupId: [''],
            tenantId: ['', this.isPlatformAdmin ? Validators.required : []],
            tagsInfo: this.formBuilder.array(Array(10).fill(null).map(() => this.buildItem())),
        });
		this.spinnerService.hide();
	}

    public buildItem(): any {
        return new FormGroup({
            taskPayloadId: new FormControl(null),
            tagKey: new FormControl(null, noWhitespaceValidator()),
            tagParent: new FormControl(null, noWhitespaceValidator()),
            tagValue: new FormControl(null),
        });
    }

    public buildItemWithValue(tagInfo: any): any {
        return new FormGroup({
            taskPayloadId: new FormControl(tagInfo?.taskPayloadId),
            tagKey: new FormControl(tagInfo?.tagKey, noWhitespaceValidator()),
            tagParent: new FormControl(tagInfo?.tagParent, noWhitespaceValidator()),
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
            this.alertService.showError(error, this.ERROR);
        });
    }

    public submitSourceTask(): void {
        this.submitted = true;
		this.spinnerService.show();
		this.trimAllTagFields();
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
            groupId: this.sourceTaskForm.get('groupId').value,
            tenantId: this.sourceTaskForm.get('tenantId')?.value || null,
            xmlTagsInfo: this.tageForms.value
        }
        if (this.taskDetailId) {
            this.sourceTaskService.updateSourceTask(sourceTask)
            .pipe(first())
			.subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.alertService.showSuccess(response.message, this.SUCESS);

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
