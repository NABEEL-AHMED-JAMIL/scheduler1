import { Component, Input, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, LookupService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { Router } from '@angular/router';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, LookupData } from '@/_models/index';

@Component({
    selector: 'lookup',
    templateUrl: 'lookup.component.html'
})
export class LookupComponent implements OnInit {

    @Input()
    public title: any = 'Main Lookup';
    public searchLookup: any = '';
    public currentActiveProfile: AuthResponse;
    // lookup
    public lookupAction: Action;
    public lookupData: LookupData;
    public lookupDatas: LookupData[];

    constructor(
        private router: Router,
        private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserByProfile;
    }

    ngOnInit() {
        this.fetchAllLookup();
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.lookupDatas = response.data;
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public addLookupDatas(): void {
		this.lookupAction = Action.ADD;
	}

    public editLookupData(lookupData: LookupData): void {
		this.lookupAction = Action.EDIT;
		this.lookupData = lookupData;
	}

    public editSubLookupData(lookupData: LookupData): void {
		this.router.navigate(['/profile/sublookup'],
            {
                queryParams: {
                    lookupId: lookupData.lookupId
                }
            });
	}

    public receiverEvent(action: Action): void {
		this.lookupAction = null;
		this.lookupData = null;
		if (action == Action.ADD || action == Action.EDIT) {
            this.fetchAllLookup();
		}
	}
    
}