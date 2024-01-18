import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode, STTSLinkSTTCList, STTControlList } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'stts-link-sttc',
    templateUrl: 'stts-link-sttc.component.html'
})
export class STTSLinkSTTCComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttsLinkSttc', { static: false })
    public closeSttsLinkSttc: any;

    public title: any = 'Delete STTS Link STTC';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttsLinkSTTC: STTSLinkSTTCList;
    public sttsLinkSTTCList: STTSLinkSTTCList[] = [];
    public pageSttsLinkSTT: STTSLinkSTTCList[] = [];

    public tempSttControlList: STTControlList[] = [];
    public sttControlList: STTControlList[] = [];

    public sttsLinkSttcForm: FormGroup;

    public querySttsid: any;
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
                this.querySttsid = params.sttsId;
            });
            this.formInit();
        });
    }

    ngOnInit() {
        this.fetchSTTC();
        this.fetchSTTSLinkSTTC(this.querySttsid);
    }

    public formInit(): void {
        this.sttsLinkSttcForm = this.formBuilder.group({
            sttsId: [this.querySttsid, [Validators.required]],
            sttcId: ['', [Validators.required]],
            sttcOrder: [1, [Validators.required]]
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttsLinkSttcForm.controls;
    }

    public fetchSTTC(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTC(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttControlList = response.data;
                this.tempSttControlList = this.sttControlList;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchSTTSLinkSTTC(sttsId: any): void {
        this.spinnerService.show();
        let payload = {
            sttsId: sttsId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTSLinkSTTC(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttsLinkSTTCList = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public deleteAction(sttsLinkSTTC: STTSLinkSTTCList): void {
        this.sttsLinkSTTC = sttsLinkSTTC;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            sttsId: this.querySttsid,
            sttcId: this.sttsLinkSTTC.sttcId,
            appUserId: this.sttsLinkSTTC.appUserid,
            auSttcId: this.sttsLinkSTTC.sttsLinkSttcId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.deleteSTTSLinkSTTC(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.fetchSTTSLinkSTTC(this.querySttsid);
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    /**
     * Get only those user which are not in the link list
     */
    public addAction(): any {
        this.sttControlList = this.tempSttControlList;
        this.sttControlList = this.sttControlList.filter((sttControl: STTControlList) => {
            return !this.sttsLinkSTTCList.find((sttsLinkSTTC: STTSLinkSTTCList) => {
                return sttsLinkSTTC.sttcId === sttControl.sttcId;
            });
        });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.sttsLinkSttcForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            ...this.sttsLinkSttcForm.value
        }
        this.sttService.addSTTSLinkSTTC(payload)
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
                this.closeSttsLinkSttc.nativeElement.click();
                this.formInit();
                this.fetchSTTSLinkSTTC(this.querySttsid);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public refreshAction(): void {
        this.fetchSTTSLinkSTTC(this.querySttsid);
    }

    public onChangePage(pageSttsLinkSTT: Array<any>) {
        // update current page of items
        this.pageSttsLinkSTT = pageSttsLinkSTT;
    }

}