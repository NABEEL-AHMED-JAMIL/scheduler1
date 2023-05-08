import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService,
    STTService, CommomService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, ApiCode, STTFormList } from '@/_models/index';


@Component({
    selector: 'sttf-list',
    templateUrl: 'sttf-list.component.html'
})
export class STTFListComponent implements OnInit {

    public title: any = 'Delete STTF';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';
    public sstForm: STTFormList;
    public sstForms: STTFormList[] = [];

    public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;
    public topHeader: any = [];
    public actionMenu: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(private router:Router,
        private route:ActivatedRoute,
        private alertService: AlertService,
        private commomService: CommomService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService,
        private sttService: STTService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.topHeader = data.topHeader;
            this.actionMenu = data.action;
            if (this.topHeader) {
                this.topHeader.forEach(header => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    } else if (header.type === 'menus') {
                        this.dropdownButton = header;
                        this.dropdownButton.menus = this.dropdownButton.menus
                        .filter(menu => {
                            return menu.active;
                        });
                    }
                });
            }
        });
    }

    ngOnInit() {
        this.fetchSTTF();
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
            this.sstForms = response.data;
        },
        (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public menuAction(payload: any): any {
        if (payload.router) {
            this.router.navigate([payload.router]);
        } else if (payload.targetEvent) {
            if (payload.targetEvent === 'downloadData') {
                this.downloadData();
            } else if (payload.targetEvent === 'downloadTemplate') {
                this.downloadTemplate();
            }
        }
    }

    public addAction(): void {
        this.router.navigate([this.addButton.router]);
    }

    public editAction(payload: any): void {
        this.router.navigate(
            ['/sttf/editSttf'],
            { 
                queryParams: {
                    sttFId: payload.sttFId
                }
            });
    }

    public refreshAction(): void {
        this.fetchSTTF();
    }

    public deleteAction(payload: any): void {
        this.sstForm = payload;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           sttfId: this.sstForm.sttFId
        }
        this.sttService.deleteSTTF(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
            this.refreshAction();
        },
        (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public downloadData(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           downloadType: 'SourceTaskTypeForm'
        }
        this.sttService.downloadSTTCommon(payload)
        .pipe(first())
        .subscribe((response) => {
            this.commomService.downLoadFile(response);
            this.spinnerService.hide();
        }, (error) => {
            this.spinnerService.hide();
            this.alertService.showError(error, ApiCode.ERROR);
        });
    }

    public downloadTemplate(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           downloadType: 'SourceTaskTypeForm'
        }
        this.sttService.downloadSTTCommonTemplateFile(payload)
        .pipe(first())
        .subscribe((response) => {
            this.commomService.downLoadFile(response);
            this.spinnerService.hide();
        }, (error) => {
            this.spinnerService.hide();
            this.alertService.showError(error, ApiCode.ERROR);
        });
    }

}