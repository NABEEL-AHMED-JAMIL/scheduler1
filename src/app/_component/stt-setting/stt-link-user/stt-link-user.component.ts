import { Component, OnInit } from '@angular/core';
import { AuthResponse, ApiCode } from '@/_models/index';


@Component({
    selector: 'stt-link-user',
    templateUrl: 'stt-link-user.component.html'
})
export class STTLinkUserComponent implements OnInit {

    public title: any = 'Delete STT Link User';
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