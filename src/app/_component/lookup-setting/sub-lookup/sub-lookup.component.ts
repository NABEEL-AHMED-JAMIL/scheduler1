import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService,
	LookupService, CommomService } from '@/_services';
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
    public selectedLookup: LookupData;
	public lookupDatas: LookupData[] = [];
    public pageOfLookupData: Array<LookupData>;

	public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;
    public topHeader: any = [];

    constructor(private router: Router,
		private route: ActivatedRoute,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private lookupService: LookupService,
		private commomService: CommomService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
		this.route.data.subscribe((data: any) => {
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach(header => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    } else if (header.type === 'menus') {
                        this.dropdownButton = header;
                        this.dropdownButton.menus = this.dropdownButton.menus
                        .filter(menu => {
                            return menu.active;
                        });
                    }
                });
            }
        });
		this.route.queryParams
		.subscribe(params => {
			this.lookupId = params['lookupId'];
			this.fetchSubLookupByParentId(this.lookupId);
		});
    }

    ngOnInit() {
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

	public refreshAction(): void {
		this.fetchSubLookupByParentId(this.lookupId);
	}

	public menuAction(payload: any): any {
        if (payload.router) {
            this.router.navigate([payload.router],
				{
					queryParams: {
						lookupId: this.lookupId
					}
                });
        } else if (payload.targetEvent) {
            if (payload.targetEvent === 'downloadData') {
                this.downloadData();
            } else if (payload.targetEvent === 'downloadTemplate') {
                this.downloadTemplate();
            }
        }
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
		.subscribe((response: any) => {
            this.spinnerService.hide();
			if(response.status === ApiCode.ERROR) {
				this.alertService.showError(response?.message, ApiCode.ERROR);
                return;
			}
            this.parentLookupDate = response?.data?.parentLookupData;
            this.lookupDatas = response.data?.subLookupData;
		}, (error: any) => {
			this.spinnerService.hide();
			this.alertService.showError(error, ApiCode.ERROR);
		});
    }

	public downloadData(): void {
        this.spinnerService.show();
        let payload = {
			parentLookupId: this.lookupId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.lookupService.downloadLookup(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.commomService.downLoadFile(response);
            this.spinnerService.hide();
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error, ApiCode.ERROR);
        });
    }

    public downloadTemplate(): void {
        this.spinnerService.show();
        this.lookupService.downloadLookupTemplateFile()
        .pipe(first())
        .subscribe((response: any) => {
            this.commomService.downLoadFile(response);
            this.spinnerService.hide();
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error, ApiCode.ERROR);
        });
    }

    public deleteLookupData(lookupData: LookupData, index: any): void {
        this.selectedLookup = lookupData;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
		let payload = {
			lookupId: this.selectedLookup.lookupId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
		this.lookupService.deleteLookupData(payload)
		.pipe(first())
		.subscribe((response: any) => {
			this.spinnerService.hide();
			if(response.status === ApiCode.ERROR) {
				this.alertService.showError(response.message, ApiCode.ERROR);
				return;
			}
            this.refreshAction();
			this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
		}, (error: any) => {
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

    public onChangePage(pageOfLookupData: Array<any>) {
        // update current page of items
        this.pageOfLookupData = pageOfLookupData;
    }
    
}