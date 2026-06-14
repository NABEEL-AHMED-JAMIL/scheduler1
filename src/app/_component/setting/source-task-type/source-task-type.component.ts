import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertService, SettingService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, Action, STATUS_LIST } from '@/_models';
import { SourceTaskType } from '@/_models/index';

@Component({
    selector: 'source-task-type',
    templateUrl: 'source-task-type.component.html'
})
export class SourceTaskTypeComponent implements OnInit {
    
	public ERROR:string = 'Error';
    public submitted:boolean = false;
	public isDisable:boolean = false;
	public isEditMode: boolean = false;
    public SOURCE_TASKTYPE_ADDED: any = 'SourceTaskType Added';
	public SOURCE_TASKTYPE_UPDATE: any = 'SourceTaskType Update';
    public SOURCEC_TASK_TYPE_TITLE: any = 'New SourceTaskType';
	public sourceTaskTypeStatus: any = STATUS_LIST;
	public sourceTaskTaypeForm: FormGroup;

	@Input()
	public sourceTaskTypeAction: Action;
	@Input()
	public sourceTaskType: SourceTaskType;
	@Output()
	public senderEvent: EventEmitter<Action> = new EventEmitter();
	@ViewChild('closeSourceTaskTaype',{static: false})
	public closeSourceTaskTaype;

	constructor(private formBuilder: FormBuilder,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private settingService: SettingService){
	}

    ngOnInit() {
		if (this.sourceTaskTypeAction) {
			if ((this.sourceTaskTypeAction as Action) === Action.ADD) {
				this.SOURCEC_TASK_TYPE_TITLE = 'New TaskType';
				this.addSourceTaskTaypeForm();
			} else if ((this.sourceTaskTypeAction as Action) === Action.EDIT) {
				this.SOURCEC_TASK_TYPE_TITLE = 'Edit TaskType';
				this.isEditMode = true;
				this.editSourceTaskTaypeForm(this.sourceTaskType);
			} else if ((this.sourceTaskTypeAction as Action) === Action.VIEW) {
				this.isDisable = true;
				this.SOURCEC_TASK_TYPE_TITLE = 'View TaskType';
				this.viewSourceTaskTaypeForm(this.sourceTaskType);
				this.sourceTaskTaypeForm.disable()
			} 
		}
    }

    // convenience getter for easy access to form fields
	get sourceTaskTaype() {
		return this.sourceTaskTaypeForm.controls;
	}

    public submitSourceTaskType() {
		if ((this.sourceTaskTypeAction as Action) === Action.ADD) {
			this.addSourceTaskType();
		} else if ((this.sourceTaskTypeAction as Action) === Action.EDIT) {
			this.updateSourceTaskType();
		}
    }

    public addSourceTaskTaypeForm(): any {
		this.spinnerService.show();
		this.sourceTaskTaypeForm = this.formBuilder.group({
			description: ['', Validators.required],
			topicName: ['', Validators.required],
			partitions: ['', Validators.required],
			queueTopicPartition: ['topic=&partitions=[]', Validators.required],
			serviceName: ['', Validators.required],
			schemaPayload: []
        });
		this.spinnerService.hide();
	}

	public addSourceTaskType(): void {
		this.submitted = true;
		this.updateQueueTopicPartition();
        this.spinnerService.show();
		if (this.sourceTaskTaypeForm.invalid) {
			this.spinnerService.hide();
			return;
		}
        this.settingService.addSourceTaskType(this.sourceTaskTaypeForm.value)
            .pipe(first())
			.subscribe((response) => {
				this.submitted = false;
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.closeSourceTaskTaype.nativeElement.click();
					this.resetSourceTaskEvent(Action.ADD);
					this.alertService.showSuccess(response.message, this.SOURCE_TASKTYPE_ADDED);
				} else {
					this.spinnerService.hide();
					this.alertService.showError(response.message, this.ERROR);
				}
			}, (error) => {
				this.spinnerService.hide();
				this.submitted = false;
				this.alertService.showError(error, this.ERROR);
			});
	}

    public editSourceTaskTaypeForm(sourceTaskTaype: SourceTaskType): any {
		this.spinnerService.show();
		const topicParts = this.parseQueueTopicPartition(sourceTaskTaype.queueTopicPartition);
		this.sourceTaskTaypeForm = this.formBuilder.group({
			sourceTaskTypeId: [sourceTaskTaype.sourceTaskTypeId, Validators.required],
			description: [sourceTaskTaype.description, Validators.required],
			topicName: [topicParts.topicName, Validators.required],
			partitions: [topicParts.partitions, Validators.required],
			queueTopicPartition: [sourceTaskTaype.queueTopicPartition, Validators.required],
			serviceName: [sourceTaskTaype.serviceName, Validators.required],
			schemaPayload: [sourceTaskTaype.schemaPayload],
			status: [sourceTaskTaype.status]
        });
		this.spinnerService.hide();
	}

	public updateSourceTaskType(): void {
		this.updateQueueTopicPartition();
        this.spinnerService.show();
		if (this.sourceTaskTaypeForm.invalid) {
			this.spinnerService.hide();
			return;
		}
        this.settingService.updateSourceTaskType(this.sourceTaskTaypeForm.value)
            .pipe(first())
			.subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.closeSourceTaskTaype.nativeElement.click();
					this.resetSourceTaskEvent(Action.EDIT);
					this.alertService.showSuccess(response.message, this.SOURCE_TASKTYPE_UPDATE);
				} else {
					this.spinnerService.hide();
					this.alertService.showError(response.message, this.ERROR);
				}
			}, (error) => {
				this.spinnerService.hide();
				this.alertService.showError(error, this.ERROR);
			});
	}

	public viewSourceTaskTaypeForm(sourceTaskTaype: SourceTaskType): any {
		this.spinnerService.show();
		this.submitted = true;
		const topicParts = this.parseQueueTopicPartition(sourceTaskTaype.queueTopicPartition);
		this.sourceTaskTaypeForm = this.formBuilder.group({
			sourceTaskTypeId: [sourceTaskTaype.sourceTaskTypeId, Validators.required],
			description: [sourceTaskTaype.description, Validators.required],
			topicName: [topicParts.topicName, Validators.required],
			partitions: [topicParts.partitions, Validators.required],
			queueTopicPartition: [sourceTaskTaype.queueTopicPartition, Validators.required],
			serviceName: [sourceTaskTaype.serviceName, Validators.required],
			schemaPayload: [sourceTaskTaype.schemaPayload]
        });
		this.spinnerService.hide();
	}

	private parseQueueTopicPartition(queueTopicPartition: string): { topicName: string; partitions: string } {
		const result = { topicName: '', partitions: '' };
		if (!queueTopicPartition) {
			return result;
		}
		const match = queueTopicPartition.match(/topic=([^&]+)&partitions=\[(.+?)\]/);
		if (match) {
			result.topicName = match[1];
			result.partitions = match[2];
		}
		return result;
	}

	private updateQueueTopicPartition(): void {
		if (!this.sourceTaskTaypeForm) {
			return;
		}
		const topicName = this.sourceTaskTaypeForm.get('topicName')?.value || '';
		const partitions = this.sourceTaskTaypeForm.get('partitions')?.value || '';
		this.sourceTaskTaypeForm.patchValue({ queueTopicPartition: `topic=${topicName}&partitions=[${partitions}]` }, { emitEvent: false });
	}

	public resetSourceTaskEvent(action: Action): void {
		this.senderEvent.emit(action);
	}

	public coleseSourceTaskEvent(action: Action): void {
		this.senderEvent.emit(action);
	}

}