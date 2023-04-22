import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService,
    LookupService, STTService } from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SpinnerService } from '@/_helpers';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, LOOKUP_TYPES } from '@/_models/index';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';


@Component({
    selector: 'cu-stts',
    templateUrl: 'cu-stts.component.html'
})
export class CUSTTSComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;

    public title: any;
    public breadcrumb: any;
    public topHeader: any;
    public action: Action;

    public editSttsId: any;
    public statusList: any;
    public defultOption: any;
    public APPLICATION_STATUS: LOOKUP_TYPES;
    public ISDEFAULT: LOOKUP_TYPES;
    public sttsForm: FormGroup;
    public currentActiveProfile: AuthResponse;

    constructor(
        private location: Location,
        private formBuilder: FormBuilder,
		private route: ActivatedRoute,
        private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService,
        private sttService: STTService) {
            this.currentActiveProfile = authenticationService.currentUserValue;
            this.ISDEFAULT = LOOKUP_TYPES.ISDEFAULT;
            this.APPLICATION_STATUS = LOOKUP_TYPES.APPLICATION_STATUS;
            this.route.data.subscribe((data: any) => {
                this.title = data.title;
                this.action = data.action;
                this.breadcrumb = data.breadcrumb;
                this.topHeader = data.topHeader;
                if (this.action === Action.EDIT) {
                    this.route.queryParams.subscribe((params: any) => {
                        this.editSttsId = params.sttSId;
                    });
                }
            });
    }


    ngOnInit() {
        if (this.action === Action.ADD) {
            this.sttsForm = this.formBuilder.group({
                sttsName: ['', Validators.required],
                description: ['', [Validators.required]],
                sttsOrder: [null, [Validators.required]]
            });
        } else if (this.action === Action.EDIT) {
            this.getDefultOptionByLookuptype();
            this.getApplicationStatusByLookupType();
            this.fetchSTTSBySttsId(this.editSttsId);
        }
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttsForm.controls;
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
                debugger
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public getApplicationStatusByLookupType() {
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttsForm = this.formBuilder.group({
                    sttsId: [response.data.sttSId],
                    sttsName: [response.data.sttSName, Validators.required],
                    description: [response.data.description, [Validators.required]],
                    status: [response.data.status.lookupValue, [Validators.required]],
                    sttsOrder: [response.data.sttSOrder, [Validators.required]],
                    defaultStts: [response.data.defaultStts.lookupValue, [Validators.required]]
                });
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
        if (this.sttsForm.invalid) {
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
           ...this.sttsForm.value
        }
        if (this.action === Action.ADD) {
            this.sttService.addSTTS(payload)
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
        } else if (this.action === Action.EDIT) {
            this.sttService.editSTTS(payload)
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