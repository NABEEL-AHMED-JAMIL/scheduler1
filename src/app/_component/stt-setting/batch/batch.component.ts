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
    }

    ngOnInit() {
    }

    public uploadBulkData(fileToUpload: File): void {
        this.spinnerService.show();
        this.errors = [];

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