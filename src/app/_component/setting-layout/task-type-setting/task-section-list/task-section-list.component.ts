import { Component, OnInit } from '@angular/core';
import { STTSectionList } from '@/_models/index'


@Component({
    selector: 'task-section-list',
    templateUrl: 'task-section-list.component.html'
})
export class TaskSectionListComponent implements OnInit {

    public sttSections: STTSectionList[] = [
        {
            sectionId: 1000,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 1,
            totalForm: 2,
            totalControl: 6
        },
        {
            sectionId: 1001,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 12,
            totalForm: 4,
            totalControl: 3
        },
        {
            sectionId: 1002,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Active',
            sectionOrder: 1,
            totalStt: 12,
            totalForm: 6,
            totalControl: 15
        },
        {
            sectionId: 1003,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sectionOrder: 1,
            totalStt: 7,
            totalForm: 6,
            totalControl: 5
        },
        {
            sectionId: 1000,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 9,
            totalForm: 1,
            totalControl: 6
        },
        {
            sectionId: 1001,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 7,
            totalForm: 2,
            totalControl: 3
        },
        {
            sectionId: 1000,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 9,
            totalForm: 1,
            totalControl: 6
        },
        {
            sectionId: 1001,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 7,
            totalForm: 2,
            totalControl: 3
        },
        {
            sectionId: 1000,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 1,
            totalForm: 2,
            totalControl: 6
        },
        {
            sectionId: 1001,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 12,
            totalForm: 4,
            totalControl: 3
        },
        {
            sectionId: 1002,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Active',
            sectionOrder: 1,
            totalStt: 12,
            totalForm: 6,
            totalControl: 15
        },
        {
            sectionId: 1003,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            sectionOrder: 1,
            totalStt: 7,
            totalForm: 6,
            totalControl: 5
        },
        {
            sectionId: 1000,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 9,
            totalForm: 1,
            totalControl: 6
        },
        {
            sectionId: 1001,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 7,
            totalForm: 2,
            totalControl: 3
        },
        {
            sectionId: 1000,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 9,
            totalForm: 1,
            totalControl: 6
        },
        {
            sectionId: 1001,
            sectionName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            sectionOrder: 1,
            totalStt: 7,
            totalForm: 2,
            totalControl: 3
        }
    ]


    constructor() {
    }

    ngOnInit() {
        console.log("task-section");
    }

}