import { Component, OnInit, ViewChild } from '@angular/core';
import { STTService, AlertService, AuthenticationService } from '@/_services/index';
import { ActivatedRoute } from '@angular/router';
import { ApiCode } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { AuthResponse } from '@/_models/index';


@Component({
    selector: 'batch',
    templateUrl: 'batch.component.html'
})
export class BatchComponent implements OnInit {

    public title: any;
    public router: any;
    public action: any;
    public errors: any;

    public currentTaskState: any = 'Batch Action';
    public buttonMessage: any;
    @ViewChild('inputUpload', {static: false})
    public inputUpload: any;
    public currentActiveProfile: AuthResponse;
    public parentLookupId: any;

    constructor(
        private _activatedRoute: ActivatedRoute,
        private sttService: STTService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this._activatedRoute.data
        .subscribe((data: any) => {
            this.title = data.breadcrumb;
            this.router = data.router;
            this.action = data.action;
            this.buttonMessage = data.action;
        });
    }

    ngOnInit() {
    }

    public uploadBulkData(fileToUpload: File): void {
        this.spinnerService.show();
        this.errors = [];
        let payload = {
            uploadType: this.action,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        const formData = new FormData();
        formData.append("file", fileToUpload);
        formData.append("data", JSON.stringify(payload));
        this.sttService.uploadSTTCommon(formData)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            this.inputUpload.nativeElement.value = '';
            if (response?.status === ApiCode.ERROR) {
                this.errors = response.data;
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error, ApiCode.ERROR);
        });
    }

}