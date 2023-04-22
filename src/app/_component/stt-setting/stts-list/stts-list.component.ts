import { Component, OnInit } from '@angular/core';
import { STTSectionList } from '@/_models/index'
import { Router, ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import { AuthResponse } from '@/_models/index';


@Component({
    selector: 'stts-list',
    templateUrl: 'stts-list.component.html'
})
export class STTSListComponent implements OnInit {

    public title: any = 'Delete STTS';
    public subTitle: any = 'Note :- All STTF will delink the Section';

    public searchLookup: any = '';
    public sttSection: STTSectionList;
    public sttSections: STTSectionList[] = [];

    public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;
    public topHeader: any = [];
    public actionMenu: any = [];

    public currentActiveProfile: AuthResponse;


    constructor(private router:Router,
        private route:ActivatedRoute,
        private alertService: AlertService,
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttSections = response.data;
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public addAction(): void {
        this.router.navigate([this.addButton.router]);
    }

    public editAction(payload: any): void {
        this.router.navigate(
            ['/ssts/editStts'],
            { 
                queryParams: {
                    sttSId: payload.sttSId
                }
            });
    }

    public refreshAction(): void {
        this.fetchSTTS();
    }

    public deleteAction(payload: any): void {
        this.sttSection = payload;
        console.log(this.sttSection);
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           sttsId: this.sttSection.sttSId
        }
        this.sttService.deleteSTTS(payload)
        .pipe(first())
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.refreshAction();
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }


}