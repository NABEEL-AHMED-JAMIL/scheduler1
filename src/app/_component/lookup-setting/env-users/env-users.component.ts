import { Component, OnInit, ViewChild } from '@angular/core';
import { Action, ApiCode, AppUserList, AuthResponse, EnvVaraible } from '@/_models';
import { ActivatedRoute, Router } from '@angular/router';
import {
    AlertService, AppUserService, AuthenticationService,
    CommomService, EnvVarService
} from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
    selector: 'env-users',
    templateUrl: 'env-users.component.html'
})
export class EnvUsersComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;
    @ViewChild('closeEnvLinkUser', { static: false })
    public closeEnvLinkUser: any;

    public title: any = 'Env User';
    public searchEnvUser: any = '';
    public currentActiveProfile: AuthResponse;

    // EnvVaraible
    public envKeyId: any;
    public envAction: Action;
    public envVaraible: EnvVaraible;
    public selectedEnvVaraible: EnvVaraible;
    public envVaraibles: EnvVaraible[] = [];
    public pageOfEnvVaraible: Array<EnvVaraible>;

    public tempAppUserList: AppUserList[] = [];
    public appUserList: AppUserList[] = [];
    public envLinkUserForm: FormGroup;

    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];

    constructor(private router: Router,
        private route: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private formBuilder: FormBuilder,
        private envVarService: EnvVarService,
        private appUserService: AppUserService,
        private commomService: CommomService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach((header) => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    }
                });
            }
        });
        this.route.queryParams.subscribe(params => {
            this.envKeyId = params['envKeyId'];
            this.fetchEnvById(this.envKeyId);
            this.fetchAllEnvWithEnvKeyId(this.envKeyId);
        });
    }

    ngOnInit() {
        this.formInit();
        this.getSubAppUserAccount(this.currentActiveProfile.username);
    }


    public formInit(): void {
        this.envLinkUserForm = this.formBuilder.group({
            username: ['', [Validators.required]],
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.envLinkUserForm.controls;
    }

    public addAction(): void {
        this.appUserList = this.tempAppUserList;
        this.appUserList = this.appUserList.filter((appUser: AppUserList) => {
            return !this.envVaraibles.find((envLinkUser: EnvVaraible) => {
                return envLinkUser.appUser.username === appUser.username;
            });
        });
    }

    public refreshAction(): void {
        this.fetchEnvById(this.envKeyId);
        this.fetchAllEnvWithEnvKeyId(this.envKeyId);
    }

    public getSubAppUserAccount(payload: any): void {
        this.spinnerService.show();
        this.appUserService.getSubAppUserAccount(payload)
            .pipe(first()).subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.appUserList = [];
                this.tempAppUserList = response.data.subAppUser;
                // add child as well
                this.appUserList = this.tempAppUserList
                    .map((appUser: any) => {
                        return {
                            appUserId: appUser.appUserId,
                            username: appUser.username,
                            email: appUser.email
                        }
                    });
                // add admin as well in the list
                this.appUserList.push({
                    appUserId: response.data.appUserId,
                    username: response.data.username,
                    email: response.data.email
                });
                this.tempAppUserList = this.appUserList;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchEnvById(envKeyId: any): void {
        this.spinnerService.show();
        let payload = {
            envKeyId: envKeyId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.envVarService.fetchEnvById(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response?.message, ApiCode.ERROR);
                    return;
                }
                this.envVaraible = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public fetchAllEnvWithEnvKeyId(envKeyId: any): void {
        this.spinnerService.show();
        let payload = {
            envKeyId: envKeyId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.envVarService.fetchAllEnvWithEnvKeyId(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response?.message, ApiCode.ERROR);
                    return;
                }
                this.envVaraibles = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public deleteEnvUser(envVaraible: EnvVaraible): void {
        this.selectedEnvVaraible = envVaraible;
    }

    public deleteEnvWithUserId(): void {
        this.spinnerService.show();
        let payload = {
            envKeyId: this.selectedEnvVaraible.envKeyId,
            accessUserDetail: this.selectedEnvVaraible.appUser
        }
        this.envVarService.deleteEnvWithUserId(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.refreshAction();
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public onSubmit(): void {
        this.spinnerService.show();
        this.submitted = true;
        if (this.envLinkUserForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            envKeyId: this.envVaraible.envKeyId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            assignUserDetail: this.envLinkUserForm.value
        }
        this.envVarService.linkEnvWithUser(payload)
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
                this.closeEnvLinkUser.nativeElement.click();
                this.formInit();
                this.refreshAction();
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public onChangePage(pageOfEnvVaraible: Array<any>) {
        this.pageOfEnvVaraible = pageOfEnvVaraible;
    }

}