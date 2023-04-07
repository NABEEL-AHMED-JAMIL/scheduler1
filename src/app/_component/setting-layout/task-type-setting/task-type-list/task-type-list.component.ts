import { Component, OnInit } from '@angular/core';
import { STTList } from '@/_models';


@Component({
    selector: 'task-type-list',
    templateUrl: 'task-type-list.component.html',
    
})
export class TaskTypeListComponent implements OnInit {


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
            sourceTaskTypeId: 1001,
            serviceName: 'Test1 Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sttType: 'Aws',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: false                              
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
        },        {
            sourceTaskTypeId: 1001,
            serviceName: 'Test1 Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sttType: 'Aws',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: false                              
        },
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
            sourceTaskTypeId: 1001,
            serviceName: 'Test1 Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sttType: 'Aws',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: false                              
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
        },
        {
            sourceTaskTypeId: 1001,
            serviceName: 'Test1 Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sttType: 'Aws',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: false                              
        },
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
            sourceTaskTypeId: 1001,
            serviceName: 'Test1 Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sttType: 'Aws',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: false                              
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
        },        {
            sourceTaskTypeId: 1001,
            serviceName: 'Test1 Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sttType: 'Aws',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: false                              
        },
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
            sourceTaskTypeId: 1001,
            serviceName: 'Test1 Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sttType: 'Aws',
            totalTask: 19,
            totalUser: 91,
            totalForm: 23,
            isdefult: false                              
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
        },
        {
            sourceTaskTypeId: 1001,
            serviceName: 'Test1 Service',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
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