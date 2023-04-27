import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, STTService,
    AlertService, LookupService } from '@/_services';
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
    public filedTypeForLkValue: any = false;

    public title: any;
    public action: Action;
    public breadcrumb: any;
    public topHeader: any;

    public editSttCId: any;
    public statusList: any;
    public defultOption: any;
    public mandatoryOption: any;
    public formControlType: any;
    public filedLkValueOption: any;

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
                    this.editSttCId = params.sttCId;
                });
            }
        });
    }

    ngOnInit() {
        this.getFormControlTypeByLookupType();
        this.getDefultOptionByLookuptype();
        if (this.action === Action.ADD) {
            this.sttcForm = this.formBuilder.group({
                filedType: ['text', [Validators.required]],
                sttCName: ['', [Validators.required]],
                sttCOrder: ['', [Validators.required]],
                description: ['', [Validators.required]],
                filedName: ['', [Validators.required]],
                filedTitle: ['', [Validators.required]],
                placeHolder: [''],
                pattern: [''],
                filedLkValue: [''],
                filedLkDetail: [''],
                filedWidth: ['', [Validators.required]],
                minLength: [''],
                maxLength: [''],
                mandatory: ['true', [Validators.required]]
            });
        } else if (this.action === Action.EDIT) {
            this.getApplicationStatusByLookupType();
            this.fetchSTTCBySttcId(this.editSttCId);
        }
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttcForm.controls;
    }

    public fetchSTTCBySttcId(sttCId: any): any {
        this.spinnerService.show();
        let payload = {
            sttCId: sttCId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.fetchSTTCBySttcId(payload)
        .pipe(first())
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttcForm = this.formBuilder.group({
                    sttCId: [response.data.sttCId, [Validators.required]],
                    filedType: [response.data.filedType.lookupValue, [Validators.required]],
                    sttCName: [response.data.sttCName, [Validators.required]],
                    sttCOrder: [response.data.sttCOrder, [Validators.required]],
                    description: [response.data.description, [Validators.required]],
                    filedName: [response.data.filedName, [Validators.required]],
                    filedTitle: [response.data.filedTitle, [Validators.required]],
                    placeHolder: [response.data.placeHolder],
                    pattern: [response.data.pattern],
                    filedLkValue: [response.data.filedLookUp],
                    filedLkDetail: [],
                    filedWidth: [response.data.filedWidth, [Validators.required]],
                    minLength: [response.data.minLength],
                    maxLength: [response.data.maxLength],
                    mandatory: [response.data.mandatory.lookupValue, [Validators.required]],
                    status: [response.data.status.lookupValue, [Validators.required]],
                    defaultSttc: [response.data.defaultSttc.lookupValue, [Validators.required]]
                });
            },
            error => {
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.formControlType = response.data;
            },
            error => {
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
        .subscribe(
            response => {
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
            },
            error => {
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.defultOption = response.data;
                this.mandatoryOption = response.data;
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public onFiledType(payload: any): void {
        if (payload === 'radio' || payload === 'checkbox' ||
            payload === 'select' || payload === 'multi-select') {
                this.filedTypeForLkValue = true;
                return;
        }
        this.hasKey = false;
        this.filedTypeForLkValue = false;
        this.filedLkValueOption = undefined;
        this.sttcForm.controls['filedLkValue'].setValue(undefined);
        this.sttcForm.controls['filedLkDetail'].setValue(undefined);
    }

    public onChangeFiledLkValue(value: any): void {
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError('No lookup found', ApiCode.ERROR);
                    return;
                }
                this.hasKey = true;
                this.filedLkValueOption = response.data
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
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
            .subscribe(response => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.back();
                },error => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    this.alertService.showError(error.message, ApiCode.ERROR);
                });
        } else if (this.action === Action.EDIT) {
            this.sttService.editSTTC(payload)
            .pipe(first())
            .subscribe(
                response => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    if (response.status === ApiCode.ERROR) {
                        this.alertService.showError(response.message, ApiCode.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                    this.back();
                },
                error => {
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