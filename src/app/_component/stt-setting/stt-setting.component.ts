import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, LookupService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { STTSidebar, ApiCode, AuthResponse, LOOKUP_TYPES } from '@/_models';


@Component({
    selector: 'stt-setting',
    templateUrl: 'stt-setting.component.html'
})
export class SttSettingComponent implements OnInit {

    public currentActiveProfile: AuthResponse;
    public STT_SIDEBAR: LOOKUP_TYPES;

    public selectedMenu: STTSidebar;
    public sttSidebar: STTSidebar[] = [];

    constructor(private route:ActivatedRoute,
        private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.STT_SIDEBAR = LOOKUP_TYPES.STT_SIDEBAR;
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.getSttSidebarByLookupType();
        this.route.data.subscribe((data: any) => {
            this.selectedMenu = data.selectedMenu;
        });
    }

    ngOnInit() {
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
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public changeTask(changeTask: STTSidebar, index: any): any{
        this.sttSidebar = this.sttSidebar.map(stt => {
            stt.active = false;
            return stt;
        });
        changeTask.active = true;
        this.sttSidebar[index] = changeTask;
        this.selectedMenu = this.sttSidebar[index];
    }

}