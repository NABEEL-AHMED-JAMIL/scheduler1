import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import {
    AuthenticationService, AlertService,
    LookupService, STTService
} from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, AuthResponse, LOOKUP_TYPES } from '@/_models/index';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'view-stt',
    templateUrl: 'view-stt.component.html'
})
export class ViewSTTComponent implements OnInit {

    @Input()
    public searchSttId: any;
    @Input()
    public formTitle: any;

    public taskTypeOption: any;
    public TASKTYPE_OPTION: LOOKUP_TYPES;

    public sttForm: FormGroup;
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
        this.TASKTYPE_OPTION = LOOKUP_TYPES.TASKTYPE_OPTION;
        this.route.queryParams.subscribe((params: any) => {
            this.searchSttId = params.sttId;
        });
    }

    ngOnInit() {
        this.getTaskTypeByLookupType();
        this.fetchSTTBySttId(this.searchSttId);
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttForm.controls;
    }

    public fetchSTTBySttId(sttId: any): any {
        this.spinnerService.show();
        let payload = {
            sttId: sttId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTBySttId(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                response = response.data
                this.sttForm = this.formBuilder.group({
                    sttId: [
                        {
                            value: response.sttId,
                            disabled: true
                        },
                        [Validators.required]
                    ],
                    serviceName: [
                        {
                            value: response.serviceName,
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
                    status: [
                        {
                            value: response.status.lookupValue,
                            disabled: true
                        },
                        [Validators.required]
                    ],
                    taskType: [
                        {
                            value: response.taskType.lookupValue,
                            disabled: true
                        },
                        [Validators.required]
                    ],
                    defaultStt: [
                        {
                            value: response.defaultStt.lookupValue,
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

    public getTaskTypeByLookupType(): any {
        this.spinnerService.show();
        let payload = {
            lookupType: this.TASKTYPE_OPTION,
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
                this.taskTypeOption = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

}