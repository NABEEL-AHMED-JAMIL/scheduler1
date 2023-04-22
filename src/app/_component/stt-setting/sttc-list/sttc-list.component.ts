import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, ApiCode, STTControlList } from '@/_models/index';


@Component({
    selector: 'sttc-list',
    templateUrl: 'sttc-list.component.html'
})
export class STTCListComponent implements OnInit {

    public title: any = 'Delete STT';
    public subTitle: any = 'Note :- All link job will be disable link with current source task';

    public searchLookup: any = '';
    public sttControl: STTControlList;
    public sttControls: STTControlList[] = [];

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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sttControls = response.data;
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
            ['/sstf/editSttc'],
            { 
                queryParams: {
                    sttCId: payload.sttCId
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
        }
        this.sttService.deleteSTTC(payload)
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