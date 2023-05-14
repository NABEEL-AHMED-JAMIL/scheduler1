import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService,
    STTService, AppUserService } from '@/_services';
import { STTLinkSTTFList, STTFormList, AppUserList } from '@/_models';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
    

@Component({
    selector: 'stt-link-sttf',
    templateUrl: 'stt-link-sttf.component.html'
})
export class STTLinkSTTFComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttLinkSTTF', {static: false})
	public closeSttLinkSTTF: any;

    public title: any = 'Delete STT Link STTF';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttLinkSTTF: STTLinkSTTFList;
    public sttLinkSTTFLists: STTLinkSTTFList[] = [];
    public sttFormList: STTFormList[] = [];
    public appUserList: AppUserList[] = [];

    public sttLinkSTTFForm: FormGroup;

    public querySttid: any;
    public formTitle: any;
    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(
        private route:ActivatedRoute,
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
                this.topHeader.forEach(header => {
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
            this.formInit();
        });
    }

    ngOnInit() {
        this.fetchSTTF();
        this.fetchSTTLinkSTTF(this.querySttid);
        this.getSubAppUserAccount(this.currentActiveProfile.username);
    }

    public formInit(): void {
        this.sttLinkSTTFForm = this.formBuilder.group({
            sttId: [this.querySttid, [Validators.required]],
            appUserId: [ '', [Validators.required]],
            sttfId: [ '', [Validators.required]]
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttLinkSTTFForm.controls;
    }

    public fetchSTTF(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.fetchSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.sttFormList = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public fetchSTTLinkSTTF(sttId: any): void {
        this.spinnerService.show();
        let payload = {
            sttId: sttId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.fetchSTTLinkSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.sttLinkSTTFLists = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
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
            let tempAppUserList = response.data.subAppUser;
            this.appUserList = tempAppUserList
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
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public deleteAction(sttLinkSTTF: STTLinkSTTFList): void {
        this.sttLinkSTTF = sttLinkSTTF;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            sttId: this.querySttid,
            sttfId: this.sttLinkSTTF.formId,
            appUserId: this.sttLinkSTTF.appUserid,
            auSttfId: this.sttLinkSTTF.sttLinkSttfId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.deleteSTTLinkSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
            this.fetchSTTLinkSTTF(this.querySttid);
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.sttLinkSTTFForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           ...this.sttLinkSTTFForm.value
        }
        this.sttService.addSTTLinkSTTF(payload)
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
            this.closeSttLinkSTTF.nativeElement.click();
            this.formInit();
            this.fetchSTTLinkSTTF(this.querySttid);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public refreshAction(): void {
        this.fetchSTTLinkSTTF(this.querySttid);
    }




}