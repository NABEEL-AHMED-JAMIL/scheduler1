import { Component, Input, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import {
    AuthenticationService, AlertService,
    LookupService, STTService
} from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import { AuthResponse, LOOKUP_TYPES } from '@/_models/index';
import { ActivatedRoute } from '@angular/router';


@Component({
    selector: 'view-sttf',
    templateUrl: 'view-sttf.component.html'
})
export class ViewSTTFComponent implements OnInit {

    @Input()
    public searchSttfId: any;
    @Input()
    public formTitle: any;

    public formTypeList: any;
    public FORM_TYPE: LOOKUP_TYPES;

    public sttfForm: FormGroup;
    public currentActiveProfile: AuthResponse;

    constructor(
        private route: ActivatedRoute,
        private formBuilder: FormBuilder,
        private sttService: STTService,
        private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.FORM_TYPE = LOOKUP_TYPES.FORM_TYPE;
        this.route.queryParams.subscribe((params: any) => {
            this.searchSttfId = params.sttId;
        });
    }

    ngOnInit() {
        this.getApplicationFormTypeByLookupType();
        this.fetchSTTFBySttfId(this.searchSttfId);
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttfForm.controls;
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
                    sttfId: [
                        {
                            value: response.sttfId,
                            disabled: true
                        },
                        [Validators.required]
                    ],
                    sttfName: [
                        {
                            value: response.sttfName,
                            disabled: true
                        },
                        [Validators.required]
                    ],
                    description: [
                        {
                            value: response.description,
                            disabled: true
                        },
                        [Validators.required]
                    ],
                    formType: [
                        {
                            value: response.formType.lookupValue,
                            disabled: true
                        },
                        [Validators.required]
                    ],
                });
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

}