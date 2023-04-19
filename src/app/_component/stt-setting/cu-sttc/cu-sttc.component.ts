import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, 
    LookupService, DataShareService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, LookupData } from '@/_models/index';
import { Router, ActivatedRoute } from '@angular/router';


@Component({
    selector: 'cu-sttc',
    templateUrl: 'cu-sttc.component.html'
})
export class CUSTTCComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;

    public title: any;
    public action: Action;
    public breadcrumb: any;
    public topHeader: any;

    public currentActiveProfile: AuthResponse;

    constructor(private router: Router,
		private activatedRoute: ActivatedRoute,
        private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService,
        private dataShareService: DataShareService) {
        this.currentActiveProfile = authenticationService.currentUserByProfile;
        this.activatedRoute.data.subscribe((data: any) => {
            this.title = data.title;
            this.action = data.action;
            this.breadcrumb = data.breadcrumb;
            this.topHeader = data.topHeader;
        });
    }

    ngOnInit() {
    }


}