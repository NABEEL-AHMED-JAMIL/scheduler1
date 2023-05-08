import { Component, OnInit } from '@angular/core';
import { AuthResponse, ApiCode } from '@/_models/index';


@Component({
    selector: 'sttf-link-stts',
    templateUrl: 'sttf-link-stts.component.html'
})
export class STTFLinkSTTSComponent implements OnInit {

    public title: any = 'Delete STTF Link STTS';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchValue: any = '';

    public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;
    public topHeader: any = [];
    public actionMenu: any = [];
    public currentActiveProfile: AuthResponse;

    constructor() {
    }

    ngOnInit() {

    }




}