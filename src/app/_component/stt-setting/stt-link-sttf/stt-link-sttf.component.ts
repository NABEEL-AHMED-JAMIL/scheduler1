import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { STTLinkSTTFList, STTFormList } from '@/_models';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
    

@Component({
    selector: 'stt-link-sttf',
    templateUrl: 'stt-link-sttf.component.html'
})
export class STTLinkSTTFComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttLinkSTTF', {static: false})
	public closeSttLinkSTTF: any;

    public title: any = 'Delete STT Link STTF';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttLinkSTTF: STTLinkSTTFList;
    public sttLinkSTTFLists: STTLinkSTTFList[] = [];

    public tempSttFormList: STTFormList[] = [];
    public sttFormList: STTFormList[] = [];
    public sttLinkSTTFForm: FormGroup;

    public querySttid: any;
    public formTitle: any;
    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(
        private route:ActivatedRoute,
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sttService: STTService,
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
                this.querySttid = params.sttId;
            });
            this.formInit();
        });
    }

    ngOnInit() {
        this.fetchSTTF();
        this.fetchSTTLinkSTTF(this.querySttid);
    }

    public formInit(): void {
        this.sttLinkSTTFForm = this.formBuilder.group({
            sttId: [this.querySttid, [Validators.required]],
            sttfId: [ '', [Validators.required]]
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttLinkSTTFForm.controls;
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

    public fetchSTTLinkSTTF(sttId: any): void {
        this.spinnerService.show();
        let payload = {
            sttId: sttId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.fetchSTTLinkSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.sttLinkSTTFLists = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public deleteAction(sttLinkSTTF: STTLinkSTTFList): void {
        this.sttLinkSTTF = sttLinkSTTF;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            sttId: this.querySttid,
            sttfId: this.sttLinkSTTF.formId,
            auSttfId: this.sttLinkSTTF.sttLinkSttfId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.sttService.deleteSTTLinkSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
            this.fetchSTTLinkSTTF(this.querySttid);
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    /**
     * Get only those user which are not in the link list
    */
    public addAction(): any {
        this.sttFormList = this.tempSttFormList;
        this.sttFormList = this.sttFormList.filter((sttForm: STTFormList) => {
            return !this.sttLinkSTTFLists.find((sttLinkSTTF: STTLinkSTTFList) => {
                return sttForm.sttfId === sttLinkSTTF.formId;
            });
        });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.sttLinkSTTFForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           ...this.sttLinkSTTFForm.value
        }
        this.sttService.addSTTLinkSTTF(payload)
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
            this.closeSttLinkSTTF.nativeElement.click();
            this.formInit();
            this.fetchSTTLinkSTTF(this.querySttid);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public refreshAction(): void {
        this.fetchSTTLinkSTTF(this.querySttid);
    }

}