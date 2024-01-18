import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import {
    AuthResponse, ApiCode,
    STTSectionList, STTCLinkSTTSList, STTSLinkSTTFList
} from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
    selector: 'sttc-link-stts',
    templateUrl: 'sttc-link-stts.component.html'
})
export class STTCLinkSTTSComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttcLinkStts', { static: false })
    public closeSttcLinkStts: any;

    public title: any = 'Delete STTC Link STTS';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttcLinkSTTS: STTCLinkSTTSList;
    public sttcLinkSTTSList: STTCLinkSTTSList[] = [];
    public pageOfsttcLinkSTTS: Array<STTCLinkSTTSList>;

    public tempSttSectionList: STTSectionList[] = [];
    public sttSectionList: STTSectionList[] = [];

    public sttcLinkSttsForm: FormGroup;

    public querySttcid: any;
    public formTitle: any;
    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(
        private route: ActivatedRoute,
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
                this.querySttcid = params.sttcId;
            });
            this.formInit();
        });
    }

    ngOnInit() {
        this.fetchSTTS();
        this.fetchSTTCLinkSTTS(this.querySttcid);
    }

    public formInit(): void {
        this.sttcLinkSttsForm = this.formBuilder.group({
            sttsId: ['', [Validators.required]],
            sttcId: [this.querySttcid, [Validators.required]],
            sttcOrder: [1, [Validators.required]]
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttcLinkSttsForm.controls;
    }

    public fetchSTTS(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTS(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttSectionList = response.data;
                this.tempSttSectionList = this.sttSectionList;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchSTTCLinkSTTS(sttcId: any): void {
        this.spinnerService.show();
        let payload = {
            sttcId: sttcId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTCLinkSTTS(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttcLinkSTTSList = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public deleteAction(sttcLinkSTTS: STTCLinkSTTSList): void {
        this.sttcLinkSTTS = sttcLinkSTTS;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            sttcId: this.querySttcid,
            sttsId: this.sttcLinkSTTS.sttsId,
            appUserId: this.sttcLinkSTTS.appUserid,
            auSttcId: this.sttcLinkSTTS.sttcLinkSttsId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.deleteSTTCLinkSTTS(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.fetchSTTCLinkSTTS(this.querySttcid);
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    /**
     * Get only those user which are not in the link list
     */
    public addAction(): any {
        this.sttSectionList = this.tempSttSectionList;
        this.sttSectionList = this.sttSectionList.filter((sttSection: STTSectionList) => {
            return !this.sttcLinkSTTSList.find((sttcLinkSTTS: STTCLinkSTTSList) => {
                return sttcLinkSTTS.sttsId === sttSection.sttsId;
            });
        });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.sttcLinkSttsForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            ...this.sttcLinkSttsForm.value
        }
        this.sttService.addSTTCLinkSTTS(payload)
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
                this.closeSttcLinkStts.nativeElement.click();
                this.formInit();
                this.fetchSTTCLinkSTTS(this.querySttcid);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public refreshAction(): void {
        this.fetchSTTCLinkSTTS(this.querySttcid);
    }

    public onChangePage(pageOfsttcLinkSTTS: Array<any>): any {
        // update current page of items
        this.pageOfsttcLinkSTTS = pageOfsttcLinkSTTS;
    }

}