import { Component, OnInit } from '@angular/core';
import { AuthResponse, ApiCode } from '@/_models/index';


@Component({
    selector: 'stts-link-sttf',
    templateUrl: 'stts-link-sttf.component.html'
})
export class STTSLinkSTTFComponent implements OnInit {

    public title: any = 'Delete STTS Link STTF';
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