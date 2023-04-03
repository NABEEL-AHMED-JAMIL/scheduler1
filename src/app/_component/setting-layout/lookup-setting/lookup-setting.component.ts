import { Component, Input, OnInit } from '@angular/core';

@Component({
    selector: 'lookup-setting',
    templateUrl: 'lookup-setting.component.html'
})
export class LookupSettingComponent implements OnInit {

    @Input()
    public title: any;
    @Input()
    public isSubLookup: any;
    @Input()
    public isEdit: any;
    public editLookupDetail: any;

    constructor() {
    }

    ngOnInit() {
    }
    
}