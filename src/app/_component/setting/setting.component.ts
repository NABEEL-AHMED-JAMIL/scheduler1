import { Component, OnInit, ViewChild } from '@angular/core';
import { AlertService, CommomService, SettingService } from '@/_services';
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
	public APPSETTING_FETCH: string = 'AppSetting Fetch';
	public DELETE_SOURCE_TASK_TYPE = "Source TaskType Delete";
	// source tasktype
	public sourceTaskTypeAction: Action;
	public sourceTaskType: SourceTaskType;
	// source task type
	public sourceTaskTaypes: SourceTaskType[] = [];
    // lookup
	public lookupAction: Action;
	public lookupData: LookupData;
	public lookupDatas: LookupData[] = [];
	public deleteSourceTaskTypeId:any;
	public deleteSelectedIndex:any;

	constructor(
		private router: Router,
		private commomService: CommomService,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private settingService: SettingService){
	}

    ngOnInit() {
		this.appSetting();
    }

	public appSetting() {
        this.spinnerService.show();
        this.settingService.appSetting()
            .pipe(first())
			.subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.sourceTaskTaypes = response.data.sourceTaskTaypes;
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

	public addSourceTaskTaype(): void {
		this.sourceTaskTypeAction = Action.ADD;
	}

	public editSourceTaskTaype(sourceTaskTaype: SourceTaskType): void {
		this.sourceTaskTypeAction = Action.EDIT;
		this.sourceTaskType = sourceTaskTaype;
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
				this.showUpdatedSourceTask(this.deleteSelectedIndex);
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

	public showUpdatedSourceTask(selectedIndex: any): void {
		let selectedObject: SourceTaskType = this.sourceTaskTaypes[selectedIndex];
		selectedObject.status = 'Delete';
		this.sourceTaskTaypes[selectedIndex] = selectedObject;
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