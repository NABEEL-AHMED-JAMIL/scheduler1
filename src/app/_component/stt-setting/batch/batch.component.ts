import { Component, OnInit, ViewChild } from '@angular/core';
import { LookupService, AlertService, AuthenticationService } from '@/_services/index';
import { Router, ActivatedRoute } from '@angular/router';
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

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private lookupService: LookupService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this._activatedRoute.data
        .subscribe((data: any) => {
            this.title = data.breadcrumb;
            this.router = data.router;
            this.action = data.action;
            this.buttonMessage = data.action;
        });
        this._activatedRoute.queryParams
		.subscribe(params => {
            if (this.action === 'SubLookup') {
                this.parentLookupId = params['lookupId'];
            }
		});
    }

    ngOnInit() {
    }

    public uploadBulkData(fileToUpload: File): void {
        this.spinnerService.show();
        this.errors = [];
        if (this.action === 'Lookup' || this.action === 'SubLookup') {
            let payload = {
                parentLookupId: this.parentLookupId,
                accessUserDetail: {
                    appUserId: this.currentActiveProfile.appUserId,
                    username: this.currentActiveProfile.username
               }
            }
            const formData = new FormData();
            formData.append("file", fileToUpload);
            formData.append("data", JSON.stringify(payload));
            this.lookupService.uploadLookup(formData)
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
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
        }
    }

    public downloadData(): void {
        this.spinnerService.show();
        if (this.action === 'Lookup' || this.action === 'SubLookup') {
            let payload = {
                parentLookupId: this.parentLookupId,
                accessUserDetail: {
                    appUserId: this.currentActiveProfile.appUserId,
                    username: this.currentActiveProfile.username
               }
            }
            this.lookupService.downloadLookup(payload)
            .pipe(first())
            .subscribe((response) => {
                this.downLoadFile(response);
                this.spinnerService.hide();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
        }
    }

    public downloadTemplate(): void {
        this.spinnerService.show();
        if (this.action === 'Lookup' || this.action === 'SubLookup') {
            this.lookupService.downloadLookupTemplateFile()
            .pipe(first())
            .subscribe((response) => {
                this.downLoadFile(response);
                this.spinnerService.hide();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
        }
    }

    public backClicked(): void {
        this._router.navigateByUrl(this.router);
    }

    /**
     * Method is use to download file.
     * @param data - Array Buffer data
     */
    public downLoadFile(data: any): void {
        let blob = new Blob([data], { 
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        let url = window.URL.createObjectURL(blob);
        let pwa = window.open(url);
        if (!pwa || pwa.closed || typeof pwa.closed == 'undefined') {
            alert( 'Please disable your Pop-up blocker and try again.');
        }
    }

}