import { Component, OnInit } from '@angular/core';
import { STTList } from '@/_models';


@Component({
    selector: 'stt-list',
    templateUrl: 'stt-list.component.html',
    
})
export class STTListComponent implements OnInit {

    public searchLookup: any = '';

    public sourceTaskTypes: STTList[] = [
        {
            sourceTaskTypeId: 1000,
            serviceName: 'Test Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sttType: 'Kafka',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: true                                     
        },
        {
            sourceTaskTypeId: 1002,
            serviceName: 'Kafka Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Active',
            sttType: 'Aws',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: false                              
        }
    ];


    constructor() {
        console.log("task-type");
    }

    ngOnInit() {
    }

}