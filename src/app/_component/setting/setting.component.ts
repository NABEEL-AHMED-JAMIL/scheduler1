import { Component, OnInit, ViewChild } from '@angular/core';
import { AlertService, CommomService, SettingService, SourceTaskService, KafkaConnectionProfileService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, Action } from '@/_models';
import { Router } from '@angular/router';
import { SourceTaskType, LookupData } from '@/_models/index';

@Component({
    selector: 'setting',
    templateUrl: 'setting.component.html'
})
export class SettingComponent implements OnInit {

	@ViewChild('closebutton', {static: false})
	public closebutton: any;

	public ERROR: string = 'Error';
	public submitted: boolean = false;
	public searchSourceTaskTaype: any = '';
	public searchLookupDataForm: any = '';
	public APPSETTING_FETCH: string = 'AppSetting Fetch';
	public DELETE_SOURCE_TASK_TYPE = "Source TaskType Delete";
	// source tasktype
	public sourceTaskTypeAction: Action | null = null;
	public sourceTaskType: SourceTaskType | null = null;
	// source task type
	public sourceTaskTypes: SourceTaskType[] = [];
    // lookup
	public lookupAction: Action | null = null;
	public lookupData: LookupData | null = null;
	public lookupDatas: LookupData[] = [];
	public deleteSourceTaskTypeId:any;
	public deleteSelectedIndex:any;
	// Kafka topic test (per Source TaskType row) -- keyed by sourceTaskTypeId so only that
	// row's button shows a spinner while a test is in flight.
	public testingTopicRowId: any = null;
	// Link Source Task picker (opened from a Source TaskType row's "Link Source Task" count) --
	// every task built on that type, filterable by Group so a long list of tasks reads as
	// browsable categories instead of one flat list.
	public linkedSourceTasks: any[] = [];
	public linkedSourceTasksLoading = false;
	public linkedSourceTaskGroupFilter = 'All';
	public linkedSourceTaskSearch = '';

	constructor(
		private router: Router,
		private commomService: CommomService,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private settingService: SettingService,
		private sourceTaskService: SourceTaskService,
		private kafkaConnectionProfileService: KafkaConnectionProfileService){
	}

    ngOnInit() {
		this.appSetting();
    }

	/** sourceTaskTypes with soft-deleted (status === 'Delete') rows filtered out -- a deleted
	 * Source TaskType shouldn't keep cluttering this list, it stays in the database (and
	 * anything that already linked to it) but isn't surfaced here anymore. */
	public get filteredSourceTaskTypes(): SourceTaskType[] {
		return (this.sourceTaskTypes || []).filter((t) => t.status !== 'Delete');
	}

	public appSetting() {
        this.spinnerService.show();
        this.settingService.appSetting()
            .pipe(first())
			.subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.sourceTaskTypes = response.data.sourceTaskTypes;
					this.lookupDatas = response.data.lookupDatas;
				} else {
					this.spinnerService.hide();
					this.alertService.showError(response.message, this.ERROR);
				}
			}, (error) => {
				this.spinnerService.hide();
				this.alertService.showError(error, this.ERROR);
			});
    }

	public addSourceTaskType(): void {
		this.sourceTaskTypeAction = Action.ADD;
	}

	/** Extracts just the topic name out of "topic=X&partitions=[N]" -- same shape ProducerBulkEngine
	 * parses server-side (see SourceTaskType.queueTopicPartition). */
	private topicNameOf(queueTopicPartition: string): string | null {
		if (!queueTopicPartition) {
			return null;
		}
		const match = queueTopicPartition.match(/topic=([^&]*)&partitions=\[/);
		return match && match[1] ? match[1] : null;
	}

	public testSourceTaskTypeConnection(sourceTaskType: SourceTaskType): void {
		const topicName = this.topicNameOf(sourceTaskType.queueTopicPartition);
		if (!topicName) {
			this.alertService.showError('This TaskType has no topic configured yet.', this.ERROR);
			return;
		}
		this.testingTopicRowId = sourceTaskType.sourceTaskTypeId;
		this.kafkaConnectionProfileService.testTopic(topicName)
			.pipe(first())
			.subscribe((response) => {
				this.testingTopicRowId = null;
				if (response.status === ApiCode.SUCCESS) {
					this.alertService.showSuccess(response.message, 'Kafka Connection');
				} else {
					this.alertService.showError(response.message, this.ERROR);
				}
			}, (error) => {
				this.testingTopicRowId = null;
				this.alertService.showError(error, this.ERROR);
			});
	}

	public editSourceTaskType(sourceTaskType: SourceTaskType): void {
		this.sourceTaskTypeAction = Action.EDIT;
		this.sourceTaskType = sourceTaskType;
	}

	public addLookupDatas(): void {
		this.lookupAction = Action.ADD;
	}

	public editLookupData(lookupData: LookupData): void {
		this.lookupAction = Action.EDIT;
		this.lookupData = lookupData;
	}

	public editSubLookupData(lookupData: LookupData): void {
		this.router.navigate(['/setting/subLookup'],{queryParams: {lookupId: lookupData.lookupId }});
	}

	public viewLinkSourceTaskWithSourceTaskType(sourceTaskTaype: SourceTaskType): void {
		this.sourceTaskType = sourceTaskTaype;
		this.linkedSourceTaskGroupFilter = 'All';
		this.linkedSourceTaskSearch = '';
		this.linkedSourceTasksLoading = true;
		this.sourceTaskService.fetchAllLinkSourceTaskWithSourceTaskTypeId(sourceTaskTaype.sourceTaskTypeId)
			.pipe(first())
			.subscribe((response) => {
				this.linkedSourceTasksLoading = false;
				if (response.status === ApiCode.SUCCESS) {
					this.linkedSourceTasks = response.data || [];
				} else {
					this.alertService.showError(response.message, this.ERROR);
				}
			}, (error) => {
				this.linkedSourceTasksLoading = false;
				this.alertService.showError(error, this.ERROR);
			});
	}

	/** Distinct group labels present in the currently loaded linked-task list, for the filter
	 * dropdown -- "Ungrouped" stands in for tasks with no groupId, same as any other optional
	 * lookup field elsewhere in the app defaults to a plain dash rather than being hidden. */
	public get linkedSourceTaskGroups(): string[] {
		const groups = new Set<string>();
		this.linkedSourceTasks.forEach((task) => groups.add(task.groupLabel || 'Ungrouped'));
		return Array.from(groups).sort();
	}

	/** linkedSourceTasks filtered by the Group dropdown and the search box (task id or name) --
	 * single source of truth for both the visible rows and the "N of M" count in the toolbar. */
	public get filteredLinkedSourceTasks(): any[] {
		const search = (this.linkedSourceTaskSearch || '').trim().toLowerCase();
		return this.linkedSourceTasks.filter((task) => {
			if (task.taskStatus === 'Delete') {
				return false;
			}
			const group = task.groupLabel || 'Ungrouped';
			if (this.linkedSourceTaskGroupFilter !== 'All' && group !== this.linkedSourceTaskGroupFilter) {
				return false;
			}
			if (!search) {
				return true;
			}
			return String(task.taskDetailId).includes(search) ||
				String(task.taskName || '').toLowerCase().includes(search);
		});
	}

	/** "Select" on a Link Source Task row -- takes the user straight to that task's edit page,
	 * same as clicking Edit from the Task List itself. */
	public selectLinkedSourceTask(task: any): void {
		this.router.navigate(['/editTask', task.taskDetailId]);
	}

	public deleteSourceTaskType(sourceTaskTypeId: any, selectedIndex: any): void {
		this.deleteSourceTaskTypeId = sourceTaskTypeId;
		this.deleteSelectedIndex = selectedIndex;
	}

	public processDeleteSourceTaskType(): void {
		this.spinnerService.show();
		this.settingService.deleteSourceTaskType(this.deleteSourceTaskTypeId)
		.pipe(first())
		.subscribe((response) => {
			if(response.status === ApiCode.SUCCESS) {
				this.spinnerService.hide();
				this.alertService.showSuccess(response.message, this.DELETE_SOURCE_TASK_TYPE);
				this.showUpdatedSourceTask(this.deleteSourceTaskTypeId);
				this.closebutton.nativeElement.click();
				this.deleteSourceTaskTypeId = null;
				this.deleteSelectedIndex = null;
			} else {
				this.spinnerService.hide();
				this.alertService.showError(response.message, this.ERROR);
			}
		}, (error) => {
			this.spinnerService.hide();
			this.alertService.showError(error, this.ERROR);
		});
	}

	public downloadSourceTaskType(sourceTaskTaype: SourceTaskType): void {
		this.spinnerService.show();
		this.commomService.createFile(sourceTaskTaype);
		this.spinnerService.hide();
	}

	public showUpdatedSourceTask(sourceTaskTypeId: any): void {
		// look up by id, not by the *ngFor index that was passed in from deleteSourceTaskType --
		// that index is into the searchFilter-filtered view, not this.sourceTaskTypes itself,
		// so it pointed at the wrong row whenever a search term was active
		let selectedObject: SourceTaskType = this.sourceTaskTypes.find(
			(taskType) => taskType.sourceTaskTypeId === sourceTaskTypeId);
		if (selectedObject) {
			selectedObject.status = 'Delete';
		}
	}

	public receiverEvent(action: Action): void {
		this.sourceTaskTypeAction = null;
		this.lookupAction = null;
		this.lookupData = null;
		this.sourceTaskType = null;
		if (action == Action.ADD || action == Action.EDIT) {
			this.appSetting();
		}
	}
}