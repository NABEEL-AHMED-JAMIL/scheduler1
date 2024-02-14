import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import {
    AuthenticationService, STTService,
    AlertService, LookupService
} from '@/_services';
import { Location } from '@angular/common';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, ApiCode, Action, LOOKUP_TYPES } from '@/_models';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'cu-sttc',
    templateUrl: 'cu-sttc.component.html'
})
export class CUSTTCComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    public hasKey: any = false;
    public fieldTypeForLkValue: any = false;
    public isMinAllow: any = true;
    public isMaxAllow: any = true;
    public isPatternAllow: any = false;

    public title: any;
    public action: Action;
    public breadcrumb: any;
    public topHeader: any;

    public editSttcId: any;
    public statusList: any;
    public defultOption: any;
    public mandatoryOption: any;
    public formControlType: any;
    public fieldLkValueOption: any;

    public ISDEFAULT: LOOKUP_TYPES;
    public APPLICATION_STATUS: LOOKUP_TYPES;
    public FORM_CONTROL_TYPE: LOOKUP_TYPES;

    public sttcForm: FormGroup;
    public currentActiveProfile: AuthResponse;

    constructor(
        private location: Location,
        private route: ActivatedRoute,
        private sttService: STTService,
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private lookupService: LookupService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.ISDEFAULT = LOOKUP_TYPES.ISDEFAULT;
        this.APPLICATION_STATUS = LOOKUP_TYPES.APPLICATION_STATUS;
        this.FORM_CONTROL_TYPE = LOOKUP_TYPES.FORM_CONTROL_TYPE;
        this.route.data.subscribe((data: any) => {
            this.title = data.title;
            this.action = data.action;
            this.breadcrumb = data.breadcrumb;
            this.topHeader = data.topHeader;
            if (this.action === Action.EDIT) {
                this.route.queryParams.subscribe((params: any) => {
                    this.editSttcId = params.sttcId;
                });
            }
        });
    }

    ngOnInit() {
        this.getFormControlTypeByLookupType();
        this.getDefultOptionByLookuptype();
        if (this.action === Action.ADD) {
            this.sttcForm = this.formBuilder.group({
                fieldType: ['text', [Validators.required]],
                sttcName: ['', [Validators.required]],
                description: ['', [Validators.required]],
                fieldName: ['', [Validators.required]],
                fieldTitle: ['', [Validators.required]],
                placeHolder: [''],
                pattern: [''],
                fieldLookUp: [''],
                fieldWidth: ['', [Validators.required]],
                minLength: [''],
                maxLength: [''],
                mandatory: ['true', [Validators.required]],
                sttcDisabled: ['false', [Validators.required]],
                sttcDefault: ['false', [Validators.required]],
                defaultValue: [''],
            });
        } else if (this.action === Action.EDIT) {
            this.getApplicationStatusByLookupType();
            this.fetchSTTCBySttcId(this.editSttcId);
        }
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttcForm.controls;
    }

    public fetchSTTCBySttcId(sttcId: any): any {
        this.spinnerService.show();
        let payload = {
            sttcId: sttcId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTCBySttcId(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                response = response.data;
                this.sttcForm = this.formBuilder.group({
                    sttcId: [response.sttcId, [Validators.required]],
                    fieldType: [response.fieldType.lookupValue, [Validators.required]],
                    sttcName: [response.sttcName, [Validators.required]],
                    description: [response.description, [Validators.required]],
                    fieldName: [response.fieldName, [Validators.required]],
                    fieldTitle: [response.fieldTitle, [Validators.required]],
                    placeHolder: [response.placeHolder],
                    pattern: [response.pattern],
                    fieldLookUp: [response.fieldLookUp],
                    fieldWidth: [response.fieldWidth, [Validators.required]],
                    minLength: [response.minLength],
                    maxLength: [response.maxLength],
                    mandatory: [response.mandatory.lookupValue, [Validators.required]],
                    status: [response.status.lookupValue, [Validators.required]],
                    sttcDefault: [response.sttcDefault.lookupValue, [Validators.required]],
                    sttcDisabled: [response.sttcDisabled.lookupValue, [Validators.required]],
                    defaultValue: [response.defaultValue],
                });
                if (response.fieldType.lookupValue === 'radio' ||
                    response.fieldType.lookupValue === 'checkbox' ||
                    response.fieldType.lookupValue === 'select' ||
                    response.fieldType.lookupValue === 'multi-select' ||
                    response.fieldType.lookupValue === 'color' ||
                    response.fieldType.lookupValue === 'date' ||
                    response.fieldType.lookupValue === 'time' ||
                    response.fieldType.lookupValue === 'month') {
                    if (response.fieldType.lookupValue !== 'color'
                        && response.fieldType.lookupValue !== 'date'
                        && response.fieldType.lookupValue !== 'time'
                        && response.fieldType.lookupValue !== 'month') {
                        this.fieldTypeForLkValue = true;
                    }
                    this.isMinAllow = false;
                    this.isMaxAllow = false;
                    this.isPatternAllow = false;
                    this.onChangefieldLkValue(response.fieldLookUp);
                    return;
                } else if (response.fieldType.lookupValue === 'url' ||
                    response.fieldType.lookupValue === 'email' || 
                    response.fieldType.lookupValue === 'password' || 
                    response.fieldType.lookupValue === 'tel' ||
                    response.fieldType.lookupValue === 'text' ||
                    response.fieldType.lookupValue === 'textarea') {
                    if (response.fieldType.lookupValue === 'text' ||
                        response.fieldType.lookupValue === 'textarea') {
                        this.isPatternAllow = false;
                    } else {
                        this.isPatternAllow = true;
                    }
                    this.isMinAllow = true;
                    this.isMaxAllow = true;
                    return;
                }
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public getFormControlTypeByLookupType(): any {
        this.spinnerService.show();
        let payload = {
            lookupType: this.FORM_CONTROL_TYPE,
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
                this.formControlType = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public getApplicationStatusByLookupType(): any {
        this.spinnerService.show();
        let payload = {
            lookupType: this.APPLICATION_STATUS,
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
                this.mandatoryOption = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public onfieldType(payload: any): void {
        if (payload === 'radio' || payload === 'checkbox' ||
            payload === 'select' || payload === 'multi-select' || payload === 'color') {
            if (payload !== 'color') {
                this.fieldTypeForLkValue = true;
            }
            this.isMinAllow = false;
            this.isMaxAllow = false;
            this.isPatternAllow = false;
            return;
        } else if (payload === 'url' || payload === 'email' || payload === 'password'
            || payload === 'tel' || payload === 'text' || payload === 'textarea'
            || payload === 'number') {
            if (payload === 'text' || payload === 'textarea') {
                this.isPatternAllow = false;
            } else {
                this.isPatternAllow = true;
            }
            this.isMinAllow = true;
            this.isMaxAllow = true;
        } else {
            this.isMinAllow = false;
            this.isMaxAllow = false;
            this.isPatternAllow = false;
        }
        this.hasKey = false;
        this.fieldTypeForLkValue = false;
        this.fieldLkValueOption = [];
        this.sttcForm.controls['fieldLookUp'].setValue(null);
    }

    public patternfieldHidShow(payload: any): boolean {
        return false;
    }

    public onChangefieldLkValue(value: any): void {
        if (value != null && value != '') {
            this.hasKey = false;
            this.spinnerService.show();
            let payload = {
                lookupType: value,
                validate: true, // auth process required so we send true
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
                        this.alertService.showError('No lookup found', ApiCode.ERROR);
                        return;
                    } else if (response.data?.subLookupData.length === 0) {
                        this.alertService.showError('Lookup not valid', ApiCode.ERROR);
                        return;
                    }
                    this.hasKey = true;
                    this.fieldLkValueOption = response.data;
                }, (error: any) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error.message, ApiCode.ERROR);
                });
        } else {
            this.hasKey = false;
            this.fieldLkValueOption = [];
        }
    }

    public onSubmit(): any {
        this.spinnerService.show();
        this.submitted = true;
        // stop here if form is invalid
        if (this.sttcForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            ...this.sttcForm.value
        }
        if (this.action === Action.ADD) {
            this.sttService.addSTTC(payload)
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
            this.sttService.editSTTC(payload)
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