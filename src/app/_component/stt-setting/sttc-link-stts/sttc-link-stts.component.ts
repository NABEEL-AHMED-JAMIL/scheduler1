import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { AuthResponse, ApiCode } from '@/_models/index';
import { SpinnerService } from '@/_helpers';
import { AuthenticationService, AlertService,
    STTService } from '@/_services';


@Component({
    selector: 'sttc-link-stts',
    templateUrl: 'sttc-link-stts.component.html'
})
export class STTCLinkSTTSComponent implements OnInit {

    public title: any = 'Delete STTC Link STTS';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';

    public querySttcid: any;
    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];
    public currentActiveProfile: AuthResponse;

    constructor(private router: Router,
        private route:ActivatedRoute,
        private sttService: STTService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach(header => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    }
                });
            }
            this.route.queryParams.subscribe((params: any) => {
                this.querySttcid = params.sttcId;
            });
        });
    }

    ngOnInit() {

    }




}