import { Component, Input, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService,
    LookupService, CommomService, EnvVarService
} from '@/_services';
import { SpinnerService } from '@/_helpers';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, LookupData, EnvVaraible } from '@/_models/index';


@Component({
    selector: 'lookup',
    templateUrl: 'lookup.component.html'
})
export class LookupComponent implements OnInit {

    @Input()
    public title: any = 'Main Lookup';
    public searchLookup: any = '';
    public searchEvn: any = '';
    public currentActiveProfile: AuthResponse;
    // lookup
    public lookupAction: Action;
    public lookupData: LookupData;
    public lookupDatas: LookupData[];
    public pageOfLookupData: Array<LookupData>;
    // env
    public envAction: Action;
    public envVaraibleData: EnvVaraible;
    public envVaraibleDatas: EnvVaraible[];
    public pageOfEnvVaraibleData: Array<EnvVaraible>;

    public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;
    public topHeader: any = [];

    constructor(private router: Router,
        private route: ActivatedRoute,
        private lookupService: LookupService,
        private envVarService: EnvVarService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
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
                        .filter((menu: any) => {
                            return menu.active;
                        });
                    }
                });
            }
        });
    }

    ngOnInit() {
        this.refreshAction();
    }

    public refreshAction(): void {
        this.fetchAllLookup();
        if (this.hasAccess(this.currentActiveProfile.roles, ['ROLE_MASTER_ADMIN'])) {
            this.fetchAllEvn();
        }
    }

    // fetch all lookup
    public fetchAllLookup(): any {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.lookupService.fetchAllLookup(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.lookupDatas = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public fetchAllEvn(): any {
        this.spinnerService.show();
        this.envVarService.fetchAllEvn()
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.envVaraibleDatas = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public menuAction(payload: any): any {
        if (payload.router) {
            this.router.navigate([payload.router]);
        } else if (payload.targetEvent) {
            if (payload.targetEvent === 'downloadData') {
                this.downloadData();
            } else if (payload.targetEvent === 'downloadTemplate') {
                this.downloadTemplate();
            }
        }
    }

    public downloadData(): void {
        this.spinnerService.show();
        let payload = {
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

    public addLookupDatas(): void {
		this.lookupAction = Action.ADD;
	}

    public editLookupData(payload: LookupData): void {
		this.lookupAction = Action.EDIT;
		this.lookupData = payload;
	}

    public addEnvVaraible(): void {
		this.envAction = Action.ADD;
	}

    public editEnvVaraible(payload: EnvVaraible): void {
		this.envAction = Action.EDIT;
		this.envVaraibleData = payload;
	}

    public deleteEnvVaraible(payload: EnvVaraible): void {
		this.envVaraibleData = payload;
	}

    public deleteActionTriger(): void {
        this.spinnerService.show();
		let payload = {
			envKeyId: this.envVaraibleData.envKeyId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
		this.envVarService.deleteEnv(payload)
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

    public addSubLookupData(payload: LookupData): void {
		this.router.navigate(['/sublookup'],
            {
                queryParams: {
                    lookupId: payload.lookupId
                }
            });
	}

    public assignEvnToUser(payload: EnvVaraible): void {
        this.router.navigate(['/envUsers'],
        {
            queryParams: {
                envKeyId: payload.envKeyId
            }
        });
	}

    public receiveLookupEvent(action: Action): void {
		this.lookupAction = null;
		this.lookupData = null;
		if (action == Action.ADD || action == Action.EDIT) {
            this.fetchAllLookup();
		}
	}

    public receiveEnvEvent(action: Action): void {
		this.envAction = null;
		this.envVaraibleData = null;
		if (action == Action.ADD || action == Action.EDIT) {
            this.fetchAllEvn();
		}
	}

    public onChangePage(pageOfLookupData: Array<any>) {
        // update current page of items
        this.pageOfLookupData = pageOfLookupData;
    }

    public onEnvPageChange(pageOfEnvVaraibleData: Array<any>) {
        // update current page of items
        this.pageOfEnvVaraibleData = pageOfEnvVaraibleData;
    }

    public hasAccess(userRoles: any, routeRoles: any) {
        return userRoles.some((role:any)=> routeRoles.includes(role));
    }
    
}