import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, LookupService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { STTSidebar, ApiCode, AuthResponse, LOOKUP_TYPES } from '@/_models';
import { EnvVarService } from '@/_services/env-var.service';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';


@Component({
    selector: 'stt-setting',
    templateUrl: 'stt-setting.component.html'
})
export class SttSettingComponent implements OnInit {

    public currentActiveProfile: AuthResponse;
    public STT_SIDEBAR: LOOKUP_TYPES;

    public selectedMenu: STTSidebar;
    public sttSidebar: STTSidebar[] = [];
    public envVarForm: FormGroup;

    constructor(
        private route: ActivatedRoute,
        public fb: FormBuilder,
        private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private envVarService: EnvVarService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.STT_SIDEBAR = LOOKUP_TYPES.STT_SIDEBAR
        this.route.data.subscribe((data: any) => {
            this.selectedMenu = data.selectedMenu;
        });
    }

    ngOnInit() {
        this.getSttSidebarByLookupType();
        this.fetchAllEnvWithAppUserId();

    }

    public getSttSidebarByLookupType(): any {
        this.spinnerService.show();
        let payload = {
            lookupType: this.STT_SIDEBAR,
            validate: false,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.lookupService.fetchLookupByLookupType(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                let parentLookupData = response.data?.parentLookupData;
                let lookupValue = parentLookupData?.lookupValue;
                this.sttSidebar = JSON.parse(lookupValue);
                this.sttSidebar.map((sttSide: any) => {
                    if (this.currentActiveProfile.roles[0] === 'ROLE_USER') {
                        sttSide.disable = true;
                    }
                    return sttSide;
                });
                // check the type and map it wit with as
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public fetchAllEnvWithAppUserId(): any {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.envVarService.fetchAllEnvWithAppUserId(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.envVarForm = this.fb.group({
                    envVaraibles: this.fb.array([])
                });
                response.data
                    .forEach((env: any) => {
                        this.envVarFormList.push(new FormGroup({
                            auEnvId: new FormControl(env.auEnvId),
                            envKey: new FormControl(env.envKey),
                            envValue: new FormControl(env.envValue)
                        }));
                    });
                // check the type and map it wit with as
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public get envVarFormList(): FormArray {
        return this.envVarForm.get('envVaraibles') as FormArray;
    }

    public updateAppUserEnvWithUserId(envVaraible: any): any {
        this.spinnerService.show();
        let payload = {
            ...envVaraible,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
        };
        this.envVarService.updateAppUserEnvWithUserId(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.fetchAllEnvWithAppUserId();
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public changeTask(changeTask: STTSidebar, index: any): any {
        this.sttSidebar = this.sttSidebar.map(stt => {
            stt.active = false;
            return stt;
        });
        changeTask.active = true;
        this.sttSidebar[index] = changeTask;
        this.selectedMenu = this.sttSidebar[index];
    }

}