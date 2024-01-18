import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { STTLinkUserList, AppUserList } from '@/_models';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import {
    AuthenticationService, AlertService,
    AppUserService, STTService
} from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'stt-link-user',
    templateUrl: 'stt-link-user.component.html'
})
export class STTLinkUserComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttLinkUser', { static: false })
    public closeSttLinkUser: any;

    public title: any = 'Delete STT Link User';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttLinkUser: STTLinkUserList;
    public sttLinkUserLists: STTLinkUserList[] = [];
    public pageOfSttLinkUser: Array<STTLinkUserList>;

    public tempAppUserList: AppUserList[] = [];
    public appUserList: AppUserList[] = [];
    public sttLinkUserForm: FormGroup;

    public querySttid: any;
    public formTitle: any;
    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(
        private route: ActivatedRoute,
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sttService: STTService,
        private appUserService: AppUserService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.formTitle = data.breadcrumb;
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach((header: any) => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    }
                });
            }
            this.route.queryParams.subscribe((params: any) => {
                this.querySttid = params.sttId;
            });
        });
        this.formInit();
    }

    ngOnInit() {
        this.fetchSTTLinkUser(this.querySttid);
        this.getSubAppUserAccount(this.currentActiveProfile.username);
    }

    public formInit(): void {
        this.sttLinkUserForm = this.formBuilder.group({
            sttId: [this.querySttid, [Validators.required]],
            appUserId: ['', [Validators.required]],
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttLinkUserForm.controls;
    }

    public getSubAppUserAccount(payload: any): void {
        this.spinnerService.show();
        this.appUserService.getSubAppUserAccount(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.appUserList = [];
                this.tempAppUserList = response.data.subAppUser;
                this.appUserList = this.tempAppUserList
                    .map((appUser: any) => {
                        return {
                            appUserId: appUser.appUserId,
                            username: appUser.username,
                            email: appUser.email
                        }
                    })
                this.appUserList.push({
                    appUserId: response.data.appUserId,
                    username: response.data.username,
                    email: response.data.email
                });
                this.tempAppUserList = this.appUserList;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchSTTLinkUser(sttId: any): void {
        this.spinnerService.show();
        let payload = {
            sttId: sttId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTLinkUser(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttLinkUserLists = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public deleteAction(sttLinkUser: any): void {
        this.sttLinkUser = sttLinkUser;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            auSttId: this.sttLinkUser.sttLinkUserId,
            appUserId: this.sttLinkUser.appUserid,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.deleteSTTLinkUser(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.fetchSTTLinkUser(this.querySttid);
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    /**
     * Get only those user which are not in the link list
     */
    public addAction(): any {
        this.appUserList = this.tempAppUserList;
        this.appUserList = this.appUserList.filter((appUser: AppUserList) => {
            return !this.sttLinkUserLists.find((sttLinkUser: STTLinkUserList) => {
                return sttLinkUser.appUserid === appUser.appUserId;
            });
        });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.sttLinkUserForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            ...this.sttLinkUserForm.value
        }
        this.sttService.addSTTLinkUser(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.closeSttLinkUser.nativeElement.click();
                this.formInit();
                this.fetchSTTLinkUser(this.querySttid);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public refreshAction(): void {
        this.fetchSTTLinkUser(this.querySttid);
    }

    public onChangePage(pageOfSttLinkUser: Array<any>): any {
        // update current page of items
        this.pageOfSttLinkUser = pageOfSttLinkUser;
    }

}