import { Component, Input, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, CredentailService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, Credential } from '@/_models/index';


@Component({
    selector: 'credential-list',
    templateUrl: 'credential-list.component.html',    
})
export class CredentialListComponent implements OnInit {

    @Input()
    public title: any = 'Delete Credentials'
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';
    public searchCredentail: any = '';
    public currentActiveProfile: AuthResponse;

    public credentailAction: Action;
    public credentialData: Credential;
    public credentialDatas: Credential[];
    public pageOfCredentials: Array<Credential>;

    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];


    constructor(private router: Router,
        private route: ActivatedRoute,
        private credentailService: CredentailService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
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
                    }
                });
            }
        });
    }

    ngOnInit() {
        this.fetchAllCredential();
    }

    public refreshAction(): void {
        this.fetchAllCredential();
    }

    public addCredentail(): void {
        this.router.navigate([this.addButton.router]);
	}

    public editAction(payload: any): void {
        this.router.navigate(
            ['/credential/editCred'],
            { 
                queryParams: {
                    credentialId: payload.credentialId
                }
            });
    }

    // fetch all lookup
    public fetchAllCredential(): any {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.credentailService.fetchAllCredential(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.credentialDatas = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public deleteCredentail(credentialData: Credential, index: any): void {
        this.credentialData = credentialData;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
		let payload = {
			credentialId: this.credentialData.credentialId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
		this.credentailService.deleteCredential(payload)
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

    public onChangePage(pageOfCredentials: Array<any>) {
        // update current page of items
        this.pageOfCredentials = pageOfCredentials;
    }

}