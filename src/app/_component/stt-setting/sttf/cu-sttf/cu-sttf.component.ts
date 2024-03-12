import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import {
    AuthenticationService, AlertService,
    LookupService, STTService
} from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SpinnerService } from '@/_helpers';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, LOOKUP_TYPES } from '@/_models/index';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { EnvVarService } from '@/_services/env-var.service';


@Component({
    selector: 'cu-sttf',
    templateUrl: 'cu-sttf.component.html'
})
export class CUSTTFComponent implements OnInit {

    public ENV_HOME_PAGE = 'ENV_HOME_PAGE';

    public loading: any = false;
    public submitted: any = false;

    public title: any;
    public breadcrumb: any;
    public topHeader: any;
    public action: Action;

    public editSttfId: any;
    public statusList: any;
    public formTypeList: any;
    public defultOption: any;
    public homePageOption: any;

    public APPLICATION_STATUS: LOOKUP_TYPES;
    public FORM_TYPE: LOOKUP_TYPES;
    public ISDEFAULT: LOOKUP_TYPES;
    public HOME_PAGE: LOOKUP_TYPES;
    public sttfForm: FormGroup;
    public currentActiveProfile: AuthResponse;

    constructor(
        private location: Location,
        private route: ActivatedRoute,
        private formBuilder: FormBuilder,
        private sttService: STTService,
        private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private envVarService: EnvVarService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.ISDEFAULT = LOOKUP_TYPES.ISDEFAULT;
        this.APPLICATION_STATUS = LOOKUP_TYPES.APPLICATION_STATUS;
        this.FORM_TYPE = LOOKUP_TYPES.FORM_TYPE;
        this.HOME_PAGE = LOOKUP_TYPES.HOME_PAGE;
        this.route.data.subscribe((data: any) => {
            this.title = data.title;
            this.action = data.action;
            this.breadcrumb = data.breadcrumb;
            this.topHeader = data.topHeader;
            if (this.action === Action.EDIT) {
                this.route.queryParams.subscribe((params: any) => {
                    this.editSttfId = params.sttfId;
                });
            }
        });
    }

    ngOnInit() {
        this.getApplicationFormTypeByLookupType();
        this.fetchUserEnvByEnvKey();
        this.getDefultOptionByLookuptype();
        if (this.action === Action.ADD) {
            this.sttfForm = this.formBuilder.group({
                sttfName: ['', Validators.required],
                description: ['', [Validators.required]],
                formType: ['', [Validators.required]],
                homePage: [''],
                serviceId: [''],
                defaultSttf: ['false', [Validators.required]],
            });
        } else if (this.action === Action.EDIT) {
            this.getApplicationStatusByLookupType();
            this.fetchSTTFBySttfId(this.editSttfId);
        }
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttfForm.controls;
    }

    public getHomePageByLookupType(envValue: any): any {
        this.spinnerService.show();
        let payload = {
            lookupType: envValue,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.lookupService.fetchLookupByLookupType(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.homePageOption = response.data;
            }, (error: any) => {
                this.homePageOption = [];
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchUserEnvByEnvKey(): any {
        this.spinnerService.show();
        let payload = {
            envKey: this.ENV_HOME_PAGE,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
        };
        this.envVarService.fetchUserEnvByEnvKey(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.getHomePageByLookupType(response.data.envValue);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public getApplicationStatusByLookupType(): any {
        this.spinnerService.show();
        let payload = {
            lookupType: this.APPLICATION_STATUS,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.lookupService.fetchLookupByLookupType(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.statusList = response.data;
                this.statusList.subLookupData = this.statusList.subLookupData
                    .filter(lookup => {
                        return lookup.lookupValue != '2';
                    });
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public getApplicationFormTypeByLookupType(): any {
        this.spinnerService.show();
        let payload = {
            lookupType: this.FORM_TYPE,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.lookupService.fetchLookupByLookupType(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.formTypeList = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public getDefultOptionByLookuptype(): any {
        this.spinnerService.show();
        let payload = {
            lookupType: this.ISDEFAULT,
            validate: false,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.lookupService.fetchLookupByLookupType(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.defultOption = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchSTTFBySttfId(sttfId: any) {
        this.spinnerService.show();
        let payload = {
            sttfId: sttfId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTFBySttfId(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                response = response.data;
                this.sttfForm = this.formBuilder.group({
                    sttfId: [response.sttfId, [Validators.required]],
                    sttfName: [response.sttfName, Validators.required],
                    description: [response.description, [Validators.required]],
                    status: [response.status.lookupValue, [Validators.required]],
                    formType: [response.formType.lookupValue, [Validators.required]],
                    defaultSttf: [response.defaultSttf.lookupValue, [Validators.required]],
                    homePage: [response.homePage ? response.homePage.lookupType : ''],
                    serviceId: [response.serviceId]
                });
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public onSubmit(): any {
        this.spinnerService.show();
        this.submitted = true;
        // stop here if form is invalid
        if (this.sttfForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            lookupType: this.APPLICATION_STATUS,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            ...this.sttfForm.value
        }
        if (this.action === Action.ADD) {
            this.sttService.addSTTF(payload)
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
                    this.back();
                }, (error: any) => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    this.alertService.showError(error.message, ApiCode.ERROR);
                });
        } else if (this.action === Action.EDIT) {
            this.sttService.editSTTF(payload)
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
                    this.back();
                }, (error: any) => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    this.alertService.showError(error.message, ApiCode.ERROR);
                });
        }
    }

    public back(): any {
        this.location.back();
    }

}