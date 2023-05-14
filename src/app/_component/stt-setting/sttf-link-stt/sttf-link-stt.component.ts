import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode,
    STTList, AppUserList } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService,
    AppUserService,  STTService } from '@/_services';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
    selector: 'sttf-link-stt',
    templateUrl: 'sttf-link-stt.component.html'
})
export class STTFLinkSTTComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeSttLinkSttf', {static: false})
	public closeSttLinkSttf: any;

    public title: any = 'Delete STTF Link STT';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';

    public sttLists: STTList[] = [];
    public appUserList: AppUserList[] = [];

    public sttfLinkSttForm: FormGroup;

    public querySttfid: any;
    public formTitle: any;
    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(
        private route:ActivatedRoute,
        private sttService: STTService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private appUserService: AppUserService,
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
        });
    }

    ngOnInit() {
        this.fetchSTT();
        this.getSubAppUserAccount(this.currentActiveProfile.username);
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
            this.sttLists = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public getSubAppUserAccount(payload: any): void {
        this.spinnerService.show();
        this.appUserService.getSubAppUserAccount(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            let tempAppUserList = response.data.subAppUser;
            this.appUserList = tempAppUserList
            .map((appUser: any) => {
                return {
                    appUserId: appUser.appUserId,
                    username: appUser.username,
                    email: appUser.email
                }
            })
            this.appUserList.push({
                appUserId: response.data.appUserId,
                username: response.data.username,
                email: response.data.email
            });
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }


}