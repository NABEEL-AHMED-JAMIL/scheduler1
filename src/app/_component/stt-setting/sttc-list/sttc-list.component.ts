import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService,
    STTService, CommomService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, ApiCode, STTControlList } from '@/_models/index';


@Component({
    selector: 'sttc-list',
    templateUrl: 'sttc-list.component.html'
})
export class STTCListComponent implements OnInit {

    public title: any = 'Delete STTC';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchSttc: any = '';
    public sttControl: STTControlList;
    public sttControlList: STTControlList[] = [];
    public pageOfSttControls: Array<STTControlList>;

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
        this.fetchSTTC();
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
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public menuAction(menu: any, payload: any): any {
        if (menu.router) {
            if (payload) {
                this.router.navigate(
                    [menu.router],
                    { 
                        queryParams: {
                            sttcId: payload.sttcId
                        }
                    });
            } else {
                this.router.navigate([menu.router]);
            }
        } else if (menu.targetEvent) {
            if (menu.targetEvent === 'downloadData') {
                this.downloadData();
            } else if (menu.targetEvent === 'downloadTemplate') {
                this.downloadTemplate();
            }
        }
    }

    public addAction(): void {
        this.router.navigate([this.addButton.router]);
    }

    public editAction(payload: any): void {
        this.router.navigate(
            ['/sttc/editSttc'],
            { 
                queryParams: {
                    sttcId: payload.sttcId
                }
            });
    }

    public refreshAction(): void {
        this.fetchSTTC();
    }

    public deleteAction(payload: any): void {
        this.sttControl = payload;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           sttcId: this.sttControl.sttcId
        }
        this.sttService.deleteSTTC(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
            this.refreshAction();
        }, (error: any) => {
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
           downloadType: 'SourceTaskTypeControl'
        }
        this.sttService.downloadSTTCommon(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.commomService.downLoadFile(response);
            this.spinnerService.hide();
        }, (error: any) => {
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
           downloadType: 'SourceTaskTypeControl'
        }
        this.sttService.downloadSTTCommonTemplateFile(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.commomService.downLoadFile(response);
            this.spinnerService.hide();
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error, ApiCode.ERROR);
        });
    }

    public onChangePage(pageOfStts: Array<any>) {
        // update current page of items
        this.pageOfSttControls = pageOfStts;
    }

}