import { Component, Input, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import {
    AuthenticationService, AlertService,
    STTService,
    LookupService
} from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SpinnerService } from '@/_helpers';
import { ApiCode, LOOKUP_TYPES } from '@/_models';
import { AuthResponse } from '@/_models/index';
import { ActivatedRoute } from '@angular/router';


@Component({
    selector: 'view-stts',
    templateUrl: 'view-stts.component.html'
})
export class ViewSTTSComponent implements OnInit {


    @Input()
    public searchSttsId: any;
    @Input()
    public formTitle: any;

    public defultOption: any;
    public ISDEFAULT: LOOKUP_TYPES;

    public sttsForm: FormGroup;
    public currentActiveProfile: AuthResponse;

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private lookupService: LookupService,
        private authenticationService: AuthenticationService,
        private sttService: STTService) {
        this.ISDEFAULT = LOOKUP_TYPES.ISDEFAULT;
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.queryParams.subscribe((params: any) => {
            this.searchSttsId = params.sttsId;
        });
    }

    ngOnInit() {
        this.getDefultOptionByLookuptype();
        this.fetchSTTSBySttsId(this.searchSttsId);
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

    // convenience getter for easy access to form fields
    get f() {
        return this.sttsForm.controls;
    }

    public fetchSTTSBySttsId(sttsId: any) {
        this.spinnerService.show();
        let payload = {
            sttsId: sttsId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTSBySttsId(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                response = response.data;
                this.sttsForm = this.formBuilder.group({
                    sttsId: [
                        {
                            value: response.sttsId,
                            disabled: true
                        }
                    ],
                    sttsName: [
                        {
                            value: response.sttsName,
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
                    defaultStts: [
                        {
                            value: response.defaultStts.lookupValue,
                            disabled: true
                        },
                        [Validators.required]
                    ]
                });
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

}