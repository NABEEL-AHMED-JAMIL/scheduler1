import { Component, OnInit, ViewChild } from '@angular/core';
import {
    LookupService, AlertService,
    AuthenticationService, AppUserService
} from '@/_services/index';
import { ActivatedRoute } from '@angular/router';
import { ApiCode } from '@/_models/index';
import { SpinnerService, } from '@/_helpers';
import { first } from 'rxjs/operators';
import { AuthResponse } from '@/_models/index';


@Component({
    selector: 'batch-action',
    templateUrl: 'batch-action.component.html'
})
export class BatchActionComponent implements OnInit {

    public action: any;
    public errors: any;

    public currentTaskState: any = 'Batch Action';
    @ViewChild('inputUpload', { static: false })
    public inputUpload: any;
    public parentId: any;
    // current user
    public currentActiveProfile: AuthResponse;

    constructor(
        private route: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private lookupService: LookupService,
        private appUserService: AppUserService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.action = data.action;
        });
        this.route.queryParams.subscribe(params => {
            if (this.action === 'SubLookup') {
                this.parentId = params['lookupId'];
            } else if (this.action = "AppUser") {
                this.parentId = params['adminId'];
            }
        });
    }

    ngOnInit() {
    }

    public uploadBulkData(fileToUpload: File): void {
        this.spinnerService.show();
        this.errors = [];
        if (this.action === 'Lookup' || this.action === 'SubLookup') {
            let payload = {
                parentLookupId: this.action === 'SubLookup' ? this.parentId : null,
                accessUserDetail: {
                    appUserId: this.currentActiveProfile.appUserId,
                    username: this.currentActiveProfile.username
                }
            }
            const formData = new FormData();
            formData.append("file", fileToUpload);
            formData.append("data", JSON.stringify(payload));
            this.lookupService.uploadLookup(formData)
                .pipe(first())
                .subscribe((response: any) => {
                    this.spinnerService.hide();
                    this.inputUpload.nativeElement.value = '';
                    if (response?.status === ApiCode.ERROR) {
                        this.errors = response.data;
                        this.alertService.showError(response.message, ApiCode.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                }, (error: any) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error, ApiCode.ERROR);
                });
        } else if (this.action === 'AppUser') {
            let payload = {
                accessUserDetail: {
                    rootUser: this.hasAccess(['ROLE_MASTER_ADMIN']),
                    appUserId: this.currentActiveProfile.appUserId,
                    username: this.currentActiveProfile.username
                }
            }
            const formData = new FormData();
            formData.append("file", fileToUpload);
            formData.append("data", JSON.stringify(payload));
            this.appUserService.uploadAppUser(formData)
                .pipe(first())
                .subscribe((response: any) => {
                    this.spinnerService.hide();
                    this.inputUpload.nativeElement.value = '';
                    if (response?.status === ApiCode.ERROR) {
                        this.errors = response.data;
                        this.alertService.showError(response.message, ApiCode.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                }, (error: any) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error, ApiCode.ERROR);
                });
        }
    }

    public hasAccess(roleList: any): void {
        return this.currentActiveProfile.roles.some(r => roleList.includes(r));
    }

}