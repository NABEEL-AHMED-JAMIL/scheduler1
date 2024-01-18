import { Component, OnInit } from '@angular/core';
import { STTSectionList } from '@/_models/index'
import { Router, ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import {
    AuthenticationService, AlertService,
    STTService, CommomService
} from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import { AuthResponse } from '@/_models/index';


@Component({
    selector: 'stts-list',
    templateUrl: 'stts-list.component.html'
})
export class STTSListComponent implements OnInit {

    public title: any = 'Delete STTS';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchSTTS: any = '';
    public sttSection: STTSectionList;
    public sttSectionList: STTSectionList[] = [];
    public pageOfSttSections: Array<STTSectionList>;

    public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;
    public topHeader: any = [];
    public actionMenu: any = [];
    public currentActiveProfile: AuthResponse;


    constructor(private router: Router,
        private route: ActivatedRoute,
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
                            .filter((menu: any) => {
                                return menu.active;
                            });
                    }
                });
            }
        });
    }

    ngOnInit() {
        this.fetchSTTS();
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
                            sttsId: payload.sttsId
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
            ['/stts/editStts'],
            {
                queryParams: {
                    sttsId: payload.sttsId
                }
            });
    }

    public refreshAction(): void {
        this.fetchSTTS();
    }

    public deleteAction(payload: any): void {
        this.sttSection = payload;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            sttsId: this.sttSection.sttsId
        }
        this.sttService.deleteSTTS(payload)
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
            downloadType: 'SourceTaskTypeSection'
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
            downloadType: 'SourceTaskTypeSection'
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

    public onChangePage(pageOfSttSections: Array<any>) {
        // update current page of items
        this.pageOfSttSections = pageOfSttSections;
    }

}