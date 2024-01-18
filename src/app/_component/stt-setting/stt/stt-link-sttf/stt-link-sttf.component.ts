import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { STTLinkUserList, AppUserList, STTLinkSTTFList, STTFormList } from '@/_models';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService, AppUserService, STTService } from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'stt-link-sttf',
    templateUrl: 'stt-link-sttf.component.html'
})
export class STTLinkSTTFComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttLinkForm', { static: false })
    public closeSttLinkForm: any;

    public title: any = 'Delete STT Link Form';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttLinkSTTF: STTLinkSTTFList;
    public sttLinkSTTFLists: STTLinkSTTFList[] = [];
    public pageOfSttLinkSTTF: Array<STTLinkSTTFList>;

    public tempSTTFormList: STTFormList[] = [];
    public sttFormList: STTFormList[] = [];
    public sttLinkSTTFForm: FormGroup;

    public querySttid: any;
    public formTitle: any;
    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(
        private route: ActivatedRoute,
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sttService: STTService,
        private appUserService: AppUserService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.formTitle = data.breadcrumb;
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach((header: any) => {
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
        });
        this.formInit();
    }

    ngOnInit() {
        this.fetchSTTLinkSTTF(this.querySttid);
        this.fetchSTTF();
    }

    public formInit(): void {
        this.sttLinkSTTFForm = this.formBuilder.group({
            sttId: [this.querySttid, [Validators.required]],
            sttfId: ['', [Validators.required]],
            sttfOrder: [1, [Validators.required]]
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
                this.tempSTTFormList = this.sttFormList;
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
            sttfId: this.sttLinkSTTF.sttfId,
            auSttfId: this.sttLinkSTTF.sttfLinkSttId,
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
        this.sttFormList = this.tempSTTFormList;
        this.sttFormList = this.sttFormList.filter((sttFrom: STTFormList) => {
            return !this.sttLinkSTTFLists.find((sttLinkSTTF: STTLinkSTTFList) => {
                return sttLinkSTTF.sttfId === sttFrom.sttfId;
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
                this.closeSttLinkForm.nativeElement.click();
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

    public onChangePage(pageOfSttLinkSTTF: Array<any>): any {
        // update current page of items
        this.pageOfSttLinkSTTF = pageOfSttLinkSTTF;
    }

}