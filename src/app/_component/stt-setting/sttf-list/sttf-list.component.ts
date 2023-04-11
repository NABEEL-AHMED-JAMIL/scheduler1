import { Component, OnInit } from '@angular/core';
import { STTFormList } from '@/_models/index'


@Component({
    selector: 'sttf-list',
    templateUrl: 'sttf-list.component.html'
})
export class STTFListComponent implements OnInit {

    public searchLookup: any = '';
    public sstForms: STTFormList[] = [
        {
            formId: 1000,
            formName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            totalStt: 10,
            totalSection: 9,
            totalControl: 5
        },
        {
            formId: 1000,
            formName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            totalStt: 10,
            totalSection: 9,
            totalControl: 5
        },
        {
            formId: 1000,
            formName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            totalStt: 10,
            totalSection: 9,
            totalControl: 5
        },
        {
            formId: 1001,
            formName: 'Kafka Web Scraping',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Active',
            totalStt: 7,
            totalSection: 8,
            totalControl: 3
        },
        {
            formId: 1000,
            formName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            totalStt: 10,
            totalSection: 9,
            totalControl: 5
        }
    ]



    constructor() {
    }

    ngOnInit() {
        console.log("task-form");
    }

}