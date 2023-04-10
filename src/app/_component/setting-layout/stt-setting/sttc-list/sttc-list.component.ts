import { Component, OnInit } from '@angular/core';
import { STTControlList } from '@/_models';

@Component({
    selector: 'sttc-list',
    templateUrl: 'sttc-list.component.html'
})
export class STTCListComponent implements OnInit {

    public searchLookup: any = '';

    public sttControls: STTControlList[] = [
        {
            controlId: 1000,
            controlOrder: 1,
            controlName: 'User Name',
            filedName: 'userName',
            filedType: 'text',
            description: 'Filed use to get the detial of user name',
            mandatory: true,
            status: 'Active',
            dateCreated: '2023-04-06',
            totalStt: 12,
            totalSection: 2,
            totalForm: 6
        },
        {
            controlId: 1001,
            controlOrder: 2,
            controlName: 'First Name',
            filedName: 'firstName',
            filedType: 'text',
            description: 'Filed use to get the detial of first name',
            mandatory: true,
            status: 'Active',
            dateCreated: '2023-04-06',
            totalStt: 12,
            totalSection: 2,
            totalForm: 6
        }
    ];

    constructor() {
    }

    ngOnInit() {
        console.log("task-control");
    }

}