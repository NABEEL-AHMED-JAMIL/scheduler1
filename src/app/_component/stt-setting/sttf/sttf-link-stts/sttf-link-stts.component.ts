import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode, STTSectionList, STTFLinkSTTSList } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'sttf-link-stts',
    templateUrl: 'sttf-link-stts.component.html'
})
export class STTFLinkSTTSComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttfLinkStts', { static: false })
    public closeSttfLinkStts: any;

    public title: any = 'Delete STTF Link STTS';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttfLinkSTTS: STTFLinkSTTSList;
    public sttfLinkSTTSList: STTFLinkSTTSList[] = [];
    public pageSttfLinkSTTS: STTFLinkSTTSList[] = [];

    public tempSttSectionList: STTSectionList[] = [];
    public sttSectionList: STTSectionList[] = [];
    public sttfLinkSectionForm: FormGroup;

    public querySttfid: any;
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
            this.route.queryParams
                .subscribe((params: any) => {
                    this.querySttfid = params.sttfId;
                });
            this.formInit();
        });
    }

    ngOnInit() {
        this.fetchSTTS();
        this.fetchSTTFLinkSTTS(this.querySttfid);
    }

    public formInit(): void {
        this.sttfLinkSectionForm = this.formBuilder.group({
            sttsId: ['', [Validators.required]],
            sttfId: [this.querySttfid, [Validators.required]],
            sttsOrder: [1, [Validators.required]]
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttfLinkSectionForm.controls;
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
                this.tempSttSectionList = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchSTTFLinkSTTS(sttfId: any): void {
        this.spinnerService.show();
        let payload = {
            sttfId: sttfId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTFLinkSTTS(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttfLinkSTTSList = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public deleteAction(sttfLinkSTTS: STTFLinkSTTSList): void {
        this.sttfLinkSTTS = sttfLinkSTTS;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            sttfId: this.querySttfid,
            sttsId: this.sttfLinkSTTS.sttsId,
            appUserId: this.sttfLinkSTTS.appUserid,
            auSttsId: this.sttfLinkSTTS.sttfLinkSttsId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.deleteSTTFLinkSTTS(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.fetchSTTFLinkSTTS(this.querySttfid);
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
            return !this.sttfLinkSTTSList.find((sttfLinkSTTS: STTFLinkSTTSList) => {
                return sttfLinkSTTS.sttsId === sttSection.sttsId;
            });
        });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.sttfLinkSectionForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            ...this.sttfLinkSectionForm.value
        }
        this.sttService.addSTTFLinkSTTS(payload)
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
                this.closeSttfLinkStts.nativeElement.click();
                this.formInit();
                this.fetchSTTFLinkSTTS(this.querySttfid);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public refreshAction(): void {
        this.fetchSTTFLinkSTTS(this.querySttfid);
    }

    public onChangePage(pageSttfLinkSTTS: Array<any>) {
        // update current page of items
        this.pageSttfLinkSTTS = pageSttfLinkSTTS;
    }

}