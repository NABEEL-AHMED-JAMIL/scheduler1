import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AppUserList } from '@/_models';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService,
    AppUserService } from '@/_services';

@Component({
    selector: 'manage-user',
    templateUrl: 'manage-user.component.html'
})
export class ManageUserComponent implements OnInit {

    @Input()
    public title: any = 'Main User';
    public searchUser: any = '';
    public appUser: AppUserList;
    public appUserList: AppUserList[] = [];
    public currentActiveProfile: AuthResponse;

    public refreshButton: any;
    public topHeader: any = [];

    constructor(private route:ActivatedRoute,
        private spinnerService: SpinnerService,
        private appUserService: AppUserService,
        private alertService: AlertService,
        private authenticationService: AuthenticationService) {
            this.currentActiveProfile = authenticationService.currentUserValue;
            this.route.data.subscribe((data: any) => {
                this.topHeader = data.topHeader;
                if (this.topHeader) {
                    this.topHeader.forEach(header => {
                        if (header.type === 'refresh') {
                            this.refreshButton = header;
                        }
                    });
                }
            });
    }

    ngOnInit() {
        this.getSubAppUserAccount(this.currentActiveProfile.username);
    }

    public refreshAction(): void {
        this.getSubAppUserAccount(this.currentActiveProfile.username);
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
            this.appUserList = response.data.subAppUser;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public deleteAction(payload: any): void {
        this.appUser = payload;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
           appUserId: this.appUser.appUserId,
           username: this.appUser.username
        }
        this.appUserService.closeAppUserAccount(payload)
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

}