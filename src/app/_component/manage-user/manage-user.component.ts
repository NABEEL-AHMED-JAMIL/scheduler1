import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Action, AppUserList } from '@/_models';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import {
    AuthenticationService, AlertService,
    AppUserService, CommomService
} from '@/_services';


@Component({
    selector: 'manage-user',
    templateUrl: 'manage-user.component.html'
})
export class ManageUserComponent implements OnInit {

    @Input()
    public title: any = 'Main User';
    @Input()
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';
    public searchUser: any = '';

    public userAction: Action;
    public appUser: AppUserList;
    public appUserList: AppUserList[] = [];
    public pageOfAppUserData: Array<AppUserList>;
    public currentActiveProfile: AuthResponse;

    public refreshButton: any;
    public addButton: any;
    public dropdownButton: any;
    public topHeader: any = [];

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private spinnerService: SpinnerService,
        private appUserService: AppUserService,
        private commomService: CommomService,
        private alertService: AlertService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach(header => {
                    if (header.type === 'refresh') {
                        this.refreshButton = header;
                    } else if (header.type === 'add') {
                        this.addButton = header;
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
        this.getSubAppUserAccount();
    }

    public refreshAction(): void {
        this.getSubAppUserAccount();
    }

    public getSubAppUserAccount(): void {
        this.spinnerService.show();
        this.appUserService.getSubAppUserAccount(this.currentActiveProfile.username)
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

    public onChangePage(pageOfAppUserData: Array<any>) {
        // update current page of items
        this.pageOfAppUserData = pageOfAppUserData;
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

    public downloadData(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.appUserService.downloadAppUser(payload)
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
        this.appUserService.downloadAppUserTemplateFile()
            .pipe(first())
            .subscribe((response: any) => {
                this.commomService.downLoadFile(response);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public addUser(): void {
        this.userAction = Action.ADD;
    }

    public editUser(payload: any): void {
        this.userAction = Action.EDIT;
        this.appUser = payload;
    }

    public receiverEvent(action: Action): void {
        this.userAction = null;
        this.appUser = null;
        if (action == Action.ADD || action == Action.EDIT) {
            this.getSubAppUserAccount();
        }
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