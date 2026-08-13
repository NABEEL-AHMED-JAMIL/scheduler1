import { Component, OnInit } from '@angular/core';
import { AlertService, SettingService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, Action } from '@/_models';
import { Router } from '@angular/router';
import { LookupData } from '@/_models/index';

@Component({
    selector: 'setting-lookup',
    templateUrl: 'setting-lookup.component.html'
})
export class SettingLookupComponent implements OnInit {

    public ERROR: string = 'Error';
    public searchLookupDataForm: any = '';

    public lookupAction: Action | null = null;
    public lookupData: LookupData | null = null;
    public lookupDatas: LookupData[] = [];

    constructor(
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private settingService: SettingService) {
    }

    ngOnInit() {
        this.fetchLookupDatas();
    }

    public fetchLookupDatas(): void {
        this.spinnerService.show();
        this.settingService.appSetting()
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.lookupDatas = response.data.lookupDatas;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public addLookupDatas(): void {
        this.lookupAction = Action.ADD;
    }

    public editLookupData(lookupData: LookupData): void {
        this.lookupAction = Action.EDIT;
        this.lookupData = lookupData;
    }

    public editSubLookupData(lookupData: LookupData): void {
        this.router.navigate(['/setting/subLookup'], { queryParams: { lookupId: lookupData.lookupId } });
    }

    public receiverEvent(action: Action): void {
        this.lookupAction = null;
        this.lookupData = null;
        if (action == Action.ADD || action == Action.EDIT) {
            this.fetchLookupDatas();
        }
    }

}
