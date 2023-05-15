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

    public editSttcId: any;
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
                filedType: ['text', [Validators.required]],
                sttcName: ['', [Validators.required]],
                sttcOrder: ['', [Validators.required]],
                description: ['', [Validators.required]],
                filedName: ['', [Validators.required]],
                filedTitle: ['', [Validators.required]],
                placeHolder: [''],
                pattern: [''],
                filedLookUp: [''],
                filedLkDetail: [''],
                filedWidth: ['', [Validators.required]],
                minLength: [''],
                maxLength: [''],
                mandatory: ['true', [Validators.required]]
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
                filedType: [response.filedType.lookupValue, [Validators.required]],
                sttcName: [response.sttcName, [Validators.required]],
                sttcOrder: [response.sttcOrder, [Validators.required]],
                description: [response.description, [Validators.required]],
                filedName: [response.filedName, [Validators.required]],
                filedTitle: [response.filedTitle, [Validators.required]],
                placeHolder: [response.placeHolder],
                pattern: [response.pattern],
                filedLookUp: [response.filedLookUp],
                filedLkDetail: [],
                filedWidth: [response.filedWidth, [Validators.required]],
                minLength: [response.minLength],
                maxLength: [response.maxLength],
                mandatory: [response.mandatory.lookupValue, [Validators.required]],
                status: [response.status.lookupValue, [Validators.required]],
                defaultSttc: [response.defaultSttc.lookupValue, [Validators.required]]
            });
            if (response.filedType.lookupValue === 'radio' ||
                response.filedType.lookupValue === 'checkbox' ||
                response.filedType.lookupValue === 'select' ||
                response.filedType.lookupValue === 'multi-select') {
                this.filedTypeForLkValue = true;
                this.onChangeFiledLkValue(response.filedLookUp);
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

    public onFiledType(payload: any): void {
        if (payload === 'radio' || payload === 'checkbox' ||
            payload === 'select' || payload === 'multi-select') {
                this.filedTypeForLkValue = true;
                return;
        }
        this.hasKey = false;
        this.filedTypeForLkValue = false;
        this.filedLkValueOption = undefined;
        this.sttcForm.controls['filedLookUp'].setValue(undefined);
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
            this.filedLkValueOption = response.data;
        }, (error: any) => {
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