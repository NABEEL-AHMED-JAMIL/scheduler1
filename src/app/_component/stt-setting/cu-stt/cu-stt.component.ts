import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthenticationService,
    AlertService, LookupService, STTService 
} from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, LOOKUP_TYPES } from '@/_models/index';
import { Location } from '@angular/common';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'cu-stt',
    templateUrl: 'cu-stt.component.html'
})
export class CUSTTComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;

    public title: any;
    public action: Action;
    public breadcrumb: any;
    public topHeader: any;

    public editSttId: any;
    public hasKey: any = false;
    public securityLkDetail: any;
    public selectedTaskType: any = '3';
    public topicName: any = '%s';
    public topicPattern: any = `topic=${this.topicName}&partitions=[*]`;

    public statusList: any;
    public httpMethodOption: any;
    public taskTypeOption: any;
    public defultOption: any;

    public ISDEFAULT: LOOKUP_TYPES;
    public APPLICATION_STATUS: LOOKUP_TYPES;
    public TASKTYPE_OPTION: LOOKUP_TYPES;
    public REQUEST_METHOD: LOOKUP_TYPES;

    public sttForm: FormGroup;
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
            this.currentActiveProfile = authenticationService.currentUserByProfile;
            this.ISDEFAULT = LOOKUP_TYPES.ISDEFAULT;
            this.REQUEST_METHOD = LOOKUP_TYPES.REQUEST_METHOD;
            this.TASKTYPE_OPTION = LOOKUP_TYPES.TASKTYPE_OPTION;
            this.APPLICATION_STATUS = LOOKUP_TYPES.APPLICATION_STATUS;
            this.route.data.subscribe((data: any) => {
                this.title = data.title;
                this.action = data.action;
                this.breadcrumb = data.breadcrumb;
                this.topHeader = data.topHeader;
                if (this.action === Action.EDIT) {
                    this.route.queryParams.subscribe((params: any) => {
                        this.editSttId = params.sttId;
                    });
                }
            });
    }

    ngOnInit() {
        this.getTaskTypeByLookupType();
        this.getHttpMethodByLookupType();
        if (this.action === Action.ADD) {
            this.sttForm = this.formBuilder.group({
                description: ['', [Validators.required]],
                serviceName: ['', [Validators.required]],
                taskType: [this.selectedTaskType, [Validators.required]]
            });
            this.addKafkaTaskType();
        } else if (this.action === Action.EDIT) {
            this.getApplicationStatusByLookupType();
            this.getDefultOptionByLookuptype();
            this.fetchSTTBySttId(this.editSttId);
        }
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttForm.controls;
    }

    get kafkaTaskType() {
        return this.sttForm.get('kafkaTaskType');
    }

    get apiTaskType() {
        return this.sttForm.get('apiTaskType');
    }

    public fetchSTTBySttId(sttId: any) {
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.selectedTaskType = response.data.taskType.lookupValue+'';
                this.sttForm = this.formBuilder.group({
                    sttId: [response.data.sttId, [Validators.required]],
                    serviceName: [response.data.serviceName, [Validators.required]],
                    description: [response.data.description, [Validators.required]],
                    status: [response.data.status.lookupValue, [Validators.required]],
                    taskType: [response.data.taskType.lookupValue, [Validators.required] ],
                    defaultStt: [response.data.defaultStt.lookupValue, [Validators.required]]
                });
                // edit case no need to enable
                if (this.selectedTaskType === '3') {
                    this.editKafkaTaskType(response.data?.kafkaTaskType);
                    return;
                }
                this.editApiTaskType(response.data?.apiTaskType);
            },
            error => {
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.taskTypeOption = response.data;
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public getHttpMethodByLookupType(): any {
        this.spinnerService.show();
        let payload = {
            lookupType: this.REQUEST_METHOD,
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
                this.httpMethodOption = response.data;
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

    public onTaskTypeSelected(event: any): void {
        const value = event.target.value;
        this.selectedTaskType = value;
        if (this.selectedTaskType === '3') {
            this.sttForm.removeControl('apiTaskType');
            this.addKafkaTaskType();
            return;
        }
        this.sttForm.removeControl('kafkaTaskType');
        this.addApiTaskType();
    }

    public getTitleDetali() {
        return this.taskTypeOption.subLookupData.find(
            x => x.lookupValue == this.selectedTaskType)?.description;
     }

    public changeOnTopicNameValue(value: any): void {
        this.topicName = value;
        this.topicPattern = `topic=${this.topicName}&partitions=[*]`;
     }

    public changeOnSecurityLkValue(value: any): void {
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
                this.securityLkDetail = response.data
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public addKafkaTaskType(): void {
        this.sttForm.addControl('kafkaTaskType', 
            this.formBuilder.group({
                numPartitions: ['', [Validators.required, Validators.min(1), Validators.max(5)]],
                topicName: ['', [Validators.required, Validators.pattern('^[-a-zA-Z0-9@\.+_]+$')]],
                topicPattern: [this.topicPattern]
            }
        ));
     }

    public editKafkaTaskType(payload: any): void {
        this.sttForm.addControl('kafkaTaskType',
            this.formBuilder.group({
                numPartitions: [payload.numPartitions, [Validators.required, Validators.min(1), Validators.max(5)]],
                topicName: [payload.topicName, [Validators.required, Validators.pattern('^[-a-zA-Z0-9@\.+_]+$')]],
                topicPattern: [payload.topicPattern]
            }
        ));
     }

    public addApiTaskType(): void {
        this.sttForm.addControl('apiTaskType', 
            this.formBuilder.group({
                apiUrl: ['', [Validators.required, 
                    Validators.pattern('(https?://)?([\\da-z.-]+)\\.([a-z.]{2,6})[/\\w .-]*/?')]],
                httpMethod: ['2', [Validators.required]],
                apiSecurityLkValue: [],
                apiSecurityLkDetail: []
            }
        ));
    }

    public editApiTaskType(payload: any): void {
        this.sttForm.addControl('apiTaskType', 
            this.formBuilder.group({
                apiUrl: [payload.apiUrl, [Validators.required, 
                    Validators.pattern('(https?://)?([\\da-z.-]+)\\.([a-z.]{2,6})[/\\w .-]*/?')]],
                httpMethod: [payload.httpMethod.lookupValue, [Validators.required]],
                apiSecurityLkValue: [payload.apiSecurityLkValue],
                apiSecurityLkDetail: []
            }
        ));
        if (payload.apiSecurityLkValue) {
            this.changeOnSecurityLkValue(payload.apiSecurityLkValue);
        }
    }

    public onSubmit(): any {
        this.spinnerService.show();
        this.submitted = true;
        // stop here if form is invalid
        if (this.sttForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           ...this.sttForm.value
        }
        if (this.action === Action.ADD) {
            this.sttService.addSTT(payload)
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
            this.sttService.editSTT(payload)
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