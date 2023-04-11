import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AuthenticationService, AlertService, LookupService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, Action } from '@/_models';
import { AuthResponse, LookupData } from '@/_models/index';

@Component({
    selector: 'cu-stt',
    templateUrl: 'cu-stt.component.html',
    
})
export class CUSTTComponent implements OnInit {

    public title: any = "Add";
    public currentActiveProfile: AuthResponse;
    public taskTypeOption: any = [
        {
            key: 'API',
            value: 0
        },
        {
            key: 'AWS SQS',
            value: 1
        },
        {
            key: 'WEB SOCKET',
            value: 2
        },
        {
            key: 'KAFKA',
            value: 3
        }
    ];
    public httpMethod: any = [
        {
            key: 'GET',
            value: 0
        },
        {
            key: 'POST',
            value: 2
        }
    ];   

    constructor(private lookupService: LookupService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserByProfile;
    }

    ngOnInit() {
    }

}