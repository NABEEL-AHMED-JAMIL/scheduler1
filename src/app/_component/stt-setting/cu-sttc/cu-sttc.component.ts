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

    public title: any;
    public action: Action;
    public breadcrumb: any;
    public topHeader: any;

    public editSttCId: any;

    public statusList: any;
    public defultOption: any;
    public formControlType: any;

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
        if (this.action === Action.ADD) {
            this.sttcForm = this.formBuilder.group({
                sttCName: ['', [Validators.required]],
                filedTitle: ['', [Validators.required]],
                filedName: ['', [Validators.required]],
                description: ['', [Validators.required]],
                placeHolder: ['', [Validators.required]],
                sttCOrder: ['', [Validators.required]],
                filedType: ['', [Validators.required]],
                filedWidth: ['', [Validators.required]],
                minLength: ['', [Validators.required]],
                maxLength: ['', [Validators.required]],
                filedLookUp: ['', [Validators.required]],
                mandatory: ['', [Validators.required]],
                pattern: ['', [Validators.required]]
            });
        } else if (this.action === Action.EDIT) {

        }
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
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public back(): any {
        this.location.back();
    }


}