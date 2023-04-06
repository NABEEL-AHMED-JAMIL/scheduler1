import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, LookupService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, LookupData } from '@/_models/index';


@Component({
    selector: 'sub-lookup',
    templateUrl: 'sub-lookup.component.html'
})
export class SubLookupComponent implements OnInit {

    public title: any = 'Sub Lookup';
    public searchLookup: any = '';
    public currentActiveProfile: AuthResponse;
    // source lookup
	public lookupId: any;
	public lookupAction: Action;
	public lookupData: LookupData;
	public parentLookupDate: LookupData;
	public lookupDatas: LookupData[] = [];

    constructor(private router: Router,
		private activatedRoute: ActivatedRoute,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private lookupService: LookupService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserByProfile;
		this.activatedRoute.queryParams
		.subscribe(params => {
			this.lookupId = params['lookupId'];
			this.fetchSubLookupByParentId(this.lookupId);
		});
    }

    ngOnInit() {
    }

	public subLookupBatch(): void {
		this.router.navigate(['/profile/sublookupBatch'],
            {
                queryParams: {
                    lookupId: this.lookupId
                }
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

	public fetchAllSubLookup(): void {
		this.fetchSubLookupByParentId(this.lookupId);
	}


    public fetchSubLookupByParentId(parentLookUpId: any): void {
		this.spinnerService.show();
		let payload = {
			parentLookupId: parentLookUpId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
		this.lookupService.fetchSubLookupByParentId(payload)
		.pipe(first())
		.subscribe((response) => {
            this.spinnerService.hide();
			if(response.status === ApiCode.ERROR) {
				this.alertService.showError(response?.message, ApiCode.ERROR);
                return;
			}
            this.parentLookupDate = response?.data?.parentLookupData;
            this.lookupDatas = response.data?.subLookupData;
		}, (error) => {
			this.spinnerService.hide();
			this.alertService.showError(error, ApiCode.ERROR);
		});
    }

    public deleteLookupData(lookupData: LookupData, index: any): void {
		this.spinnerService.show();
		let payload = {
			lookupId: lookupData.lookupId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
		this.lookupService.deleteLookupData(payload)
		.pipe(first())
		.subscribe((response) => {
			this.spinnerService.hide();
			if(response.status === ApiCode.ERROR) {
				this.alertService.showError(response.message, ApiCode.ERROR);
				return;
			}
			this.lookupDatas.splice(index, 1); 
			this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
		}, (error) => {
			this.spinnerService.hide();
			this.alertService.showError(error, ApiCode.ERROR);
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