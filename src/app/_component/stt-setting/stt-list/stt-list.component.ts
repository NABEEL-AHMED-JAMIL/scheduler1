import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { STTList } from '@/_models';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, STTService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, ApiCode } from '@/_models/index';


@Component({
    selector: 'stt-list',
    templateUrl: 'stt-list.component.html',
    
})
export class STTListComponent implements OnInit {

    public title: any = 'Delete STT';
    public subTitle: any = 'Note :- Action may stop linked process';

    public searchValue: any = '';
    public sourceTaskType: STTList;
    public sourceTaskTypes: STTList[] = [];

    public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;
    public topHeader: any = [];
    public actionMenu: any = [];

    public currentActiveProfile: AuthResponse;

    constructor(private router: Router,
        private route:ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sttService: STTService,
        private authenticationService: AuthenticationService) {
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
        this.fetchSTT();
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
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sourceTaskTypes = response.data;
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
        console.log(payload);
        this.router.navigate(
            ['/stt/editStt'],
            { 
                queryParams: {
                    sttId: payload.sttId
                }
            });
    }

    public deleteAction(payload: any): void {
        this.sourceTaskType = payload;
    }

    public refreshAction(): void {
        this.fetchSTT();
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           sttId: this.sourceTaskType.sttId
        }
        this.sttService.deleteSTT(payload)
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