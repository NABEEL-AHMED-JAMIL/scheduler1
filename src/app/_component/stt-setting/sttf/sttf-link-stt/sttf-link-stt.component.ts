import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode, STTList, STTFLinkSTTList } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'sttf-link-stt',
    templateUrl: 'sttf-link-stt.component.html'
})
export class STTFLinkSTTComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttfLinkStt', { static: false })
    public closeSttfLinkStt: any;

    public title: any = 'Delete STTF Link STT';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sttfLinkSTT: STTFLinkSTTList;
    public sttfLinkSTTList: STTFLinkSTTList[] = [];
    public pageSttfLinkSTT: STTFLinkSTTList[] = [];

    public tempSttList: STTList[] = [];
    public sttList: STTList[] = [];

    public sttfLinkSttForm: FormGroup;

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
            this.route.queryParams.subscribe((params: any) => {
                this.querySttfid = params.sttfId;
            });
            this.formInit();
        });
    }

    ngOnInit() {
        this.fetchSTT();
        this.fetchSTTFLinkSTT(this.querySttfid);
    }

    public formInit(): void {
        this.sttfLinkSttForm = this.formBuilder.group({
            sttId: ['', [Validators.required]],
            sttfId: [this.querySttfid, [Validators.required]],
            sttfOrder: [1, [Validators.required]]
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.sttfLinkSttForm.controls;
    }

    public fetchSTT(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTT(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttList = response.data;
                this.tempSttList = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchSTTFLinkSTT(sttfId: any): void {
        this.spinnerService.show();
        let payload = {
            sttfId: sttfId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTFLinkSTT(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttfLinkSTTList = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public deleteAction(sttfLinkSTT: STTFLinkSTTList): void {
        this.sttfLinkSTT = sttfLinkSTT;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            sttfId: this.querySttfid,
            sttId: this.sttfLinkSTT.sttId,
            appUserId: this.sttfLinkSTT.appUserid,
            auSttfId: this.sttfLinkSTT.sttfLinkSttId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.deleteSTTFLinkSTT(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.fetchSTTFLinkSTT(this.querySttfid);
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    /**
     * Get only those user which are not in the link list
     */
    public addAction(): any {
        this.sttList = this.tempSttList;
        this.sttList = this.sttList.filter((stt: STTList) => {
            return !this.sttfLinkSTTList.find((sttfLinkSTT: STTFLinkSTTList) => {
                return sttfLinkSTT.sttId === stt.sttId;
            });
        });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.sttfLinkSttForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            ...this.sttfLinkSttForm.value
        }
        this.sttService.addSTTFLinkSTT(payload)
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
                this.closeSttfLinkStt.nativeElement.click();
                this.formInit();
                this.fetchSTTFLinkSTT(this.querySttfid);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public refreshAction(): void {
        this.fetchSTTFLinkSTT(this.querySttfid);
    }

    public onChangePage(pageSttfLinkSTT: Array<any>) {
        // update current page of items
        this.pageSttfLinkSTT = pageSttfLinkSTT;
    }

}