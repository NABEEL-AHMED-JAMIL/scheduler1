import { Component, Input, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, STTService,
    AlertService, LookupService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, ApiCode, Action, LOOKUP_TYPES } from '@/_models';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'view-sttc',
    templateUrl: 'view-sttc.component.html'
})
export class ViewSTTCComponent implements OnInit {

    @Input()
    public searchSttcId: any;
    @Input()
    public formTitle: any;

    public formControlType: any;
    public FORM_CONTROL_TYPE: LOOKUP_TYPES;

    public sttcForm: FormGroup;
    public currentActiveProfile: AuthResponse;

    constructor(
		private route: ActivatedRoute,
        private sttService: STTService,
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private lookupService: LookupService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.FORM_CONTROL_TYPE = LOOKUP_TYPES.FORM_CONTROL_TYPE;
        this.route.queryParams.subscribe((params: any) => {
            this.searchSttcId = params.sttcId;
        });
    }

    ngOnInit() {
        this.getFormControlTypeByLookupType();
        this.fetchSTTCBySttcId(this.searchSttcId);
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttcForm.controls;
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
                sttCId: [
                    {
                        value: response.sttCId,
                        disabled: true
                    },
                    [Validators.required]
                ],
                filedType: [
                    {
                        value: response.filedType.lookupValue,
                        disabled: true
                    },
                    [Validators.required]
                ],
                sttCName: [
                    {
                        value: response.sttCName,
                        disabled: true
                    },
                    [Validators.required]
                ],
                description: [
                    {
                        value: response.description,
                        disabled: true
                    },
                    [Validators.required]]
                });
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }


}