import { Component, OnInit } from '@angular/core';
import { AuthResponse, ApiCode } from '@/_models/index';


@Component({
    selector: 'stts-link-sttc',
    templateUrl: 'stts-link-sttc.component.html'
})
export class STTSLinkSTTCComponent implements OnInit {

    public title: any = 'Delete STTS Link STTC';
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