import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { AlertService, SettingService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, Action } from '@/_models';
import { first } from 'rxjs/operators';
import { LookupData } from '@/_models/index';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
    selector: 'sub-lookup',
    templateUrl: 'sub-lookup.component.html'
})
export class SubLookupComponent implements OnInit {	

	public ERROR: string = 'Error';
    public searchLookupDataForm: any = '';
    // source lookup
	public lookupId: any;
	public lookupAction: Action;
	public lookupData: LookupData;
	public parentLookupDate: LookupData;
	public lookupDatas: LookupData[] = [];
	@Output()
	public senderEvent: EventEmitter<Action> = new EventEmitter();

	constructor(private router: Router,
		private activatedRoute: ActivatedRoute,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private settingService: SettingService) {
	}

    ngOnInit() {
		this.activatedRoute.queryParams
		.subscribe(params => {
			this.lookupId = params['lookupId'];
			this.fetchSubLookupByParentId(this.lookupId);
		});
    }

    public addLookupDatas(): void {
		this.lookupAction = Action.ADD;
		this.lookupData = this.parentLookupDate;
	}

	public editLookupData(lookupData: LookupData): void {
		this.lookupAction = Action.EDIT;
		lookupData.parent = this.parentLookupDate;
		this.lookupData = lookupData;
	}

    public deleteLookupData(lookupData: LookupData, index: any): void {
		this.spinnerService.show();
		this.settingService.deleteLookupData(lookupData)
		.pipe(first())
		.subscribe((response) => {
			if(response.status === ApiCode.SUCCESS) {
				this.spinnerService.hide();
				// remove the target index
				this.lookupDatas.splice(index, 1); 
			} else {
				this.spinnerService.hide();
				this.alertService.showError(response.message, this.ERROR);
			}
		}, (error) => {
			this.spinnerService.hide();
			this.alertService.showError(error, this.ERROR);
		});
    }

    public fetchSubLookupByParentId(parentLookUpId: any): void {
		this.spinnerService.show();
		this.settingService.fetchSubLookupByParentId(parentLookUpId)
		.pipe(first())
		.subscribe((response) => {
			if(response.status === ApiCode.SUCCESS) {
				this.spinnerService.hide();
				this.parentLookupDate = response?.data?.parentLookupData;
				this.lookupDatas = response.data?.lookupDatas;
			} else {
				this.spinnerService.hide();
				this.alertService.showError(response?.message, this.ERROR);
			}
		}, (error) => {
			this.spinnerService.hide();
			this.alertService.showError(error, this.ERROR);
		});
    }

	public resetEvent(action:Action): void {
		this.lookupAction = null;
		this.lookupData = null;
		if (action === Action.ADD || action === Action.EDIT) {
			this.fetchSubLookupByParentId(this.lookupId);
		}
	}

}