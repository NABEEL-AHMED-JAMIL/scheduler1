import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode, STTFormList, STTSLinkSTTFList } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'stts-link-sttf',
    templateUrl: 'stts-link-sttf.component.html'
})
export class STTSLinkSTTFComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttsLinkSttf', {static: false})
	public closeSttsLinkSttf: any;

    public title: any = 'Delete STTS Link STTF';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttsLinkSTTF: STTSLinkSTTFList;
    public sttsLinkSTTFList: STTSLinkSTTFList[] = [];

    public tempSttFormList: STTFormList[] = [];
    public sttFormList: STTFormList[] = [];

    public sttsLinkSttfForm: FormGroup;

    public querySttsid: any;
    public formTitle: any;
    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(
        private route:ActivatedRoute,
        private formBuilder: FormBuilder,
        private sttService: STTService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.formTitle = data.breadcrumb;
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach(header => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    }
                });
            }
            this.route.queryParams.subscribe((params: any) => {
                this.querySttsid = params.sttsId;
            });
            this.formInit();
        });
    }

    ngOnInit() {
        this.fetchSTTF();
        this.fetchSTTSLinkSTTF(this.querySttsid);
    }

    public formInit(): void {
        this.sttsLinkSttfForm = this.formBuilder.group({
            sttsId: [this.querySttsid, [Validators.required]],
            sttfId: ['', [Validators.required]]
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttsLinkSttfForm.controls;
    }

    public fetchSTTF(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.fetchSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.sttFormList = response.data;
            this.tempSttFormList = this.sttFormList;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public fetchSTTSLinkSTTF(sttsId: any): void {
        this.spinnerService.show();
        let payload = {
            sttsId: sttsId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.fetchSTTSLinkSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.sttsLinkSTTFList = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public deleteAction(sttsLinkSTTF: STTSLinkSTTFList): void {
        this.sttsLinkSTTF = sttsLinkSTTF;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            sttsId: this.querySttsid,
            sttfId: this.sttsLinkSTTF.formId,
            appUserId: this.sttsLinkSTTF.appUserid,
            auSttsId: this.sttsLinkSTTF.sttsLinkSttfId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.deleteSTTSLinkSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
            this.fetchSTTSLinkSTTF(this.querySttsid);
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    /**
     * Get only those user which are not in the link list
     */
    public addAction(): any {
        this.sttFormList =  this.tempSttFormList;
        this.sttFormList = this.sttFormList.filter((sttFrom: STTFormList) => {
            return !this.sttsLinkSTTFList.find((sttsLinkSTTF: STTSLinkSTTFList) => {
                return sttsLinkSTTF.formId === sttFrom.sttfId;
            });
        });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.sttsLinkSttfForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           ...this.sttsLinkSttfForm.value
        }
        this.sttService.addSTTSLinkSTTF(payload)
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
            this.closeSttsLinkSttf.nativeElement.click();
            this.formInit();
            this.fetchSTTSLinkSTTF(this.querySttsid);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public refreshAction(): void {
        this.fetchSTTSLinkSTTF(this.querySttsid);
    }

}