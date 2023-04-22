import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService,
    AlertService, LookupService } from '@/_services';
import { Location } from '@angular/common';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, LookupData, ApiCode, Action } from '@/_models';
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

    constructor(
        private location: Location,
        private router: Router,
		private route: ActivatedRoute,
        private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.title = data.title;
            this.action = data.action;
            this.breadcrumb = data.breadcrumb;
            this.topHeader = data.topHeader;
        });
    }

    ngOnInit() {
    }

    public back(): any {
        this.location.back();
    }


}