import { Component, OnInit } from '@angular/core';
import { SttFormList } from '@/_models/index'


@Component({
    selector: 'task-form-list',
    templateUrl: 'task-form-list.component.html'
})
export class TaskFormListComponent implements OnInit {

    public sstForms: SttFormList[] = [
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
            formId: 1002,
            formName: 'Kafka Web Scraping Table',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            totalStt: 2,
            totalSection: 9,
            totalControl: 1
        },
        {
            formId: 1000,
            formName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            totalStt: 1,
            totalSection: 9,
            totalControl: 5
        },
        {
            formId: 1001,
            formName: 'Kafka Web Scraping',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Active',
            totalStt: 0,
            totalSection: 8,
            totalControl: 3
        },
        {
            formId: 1002,
            formName: 'Kafka Web Scraping Table',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            totalStt: 2,
            totalSection: 9,
            totalControl: 1
        },
        {
            formId: 1000,
            formName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            totalStt: 1,
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
            formId: 1002,
            formName: 'Kafka Web Scraping Table',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            totalStt: 2,
            totalSection: 9,
            totalControl: 1
        },
        {
            formId: 1000,
            formName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            totalStt: 1,
            totalSection: 9,
            totalControl: 5
        },
        {
            formId: 1001,
            formName: 'Kafka Web Scraping',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Active',
            totalStt: 0,
            totalSection: 8,
            totalControl: 3
        },
        {
            formId: 1001,
            formName: 'Kafka Web Scraping',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Active',
            totalStt: 0,
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
            formId: 1002,
            formName: 'Kafka Web Scraping Table',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Inactive',
            totalStt: 2,
            totalSection: 9,
            totalControl: 1
        },
        {
            formId: 1000,
            formName: 'Test Loop Form',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Delete',
            totalStt: 1,
            totalSection: 9,
            totalControl: 5
        },
        {
            formId: 1001,
            formName: 'Kafka Web Scraping',
            description: 'Service use to test default kafka',
            dateCreated: '2023-04-06',
            status: 'Active',
            totalStt: 0,
            totalSection: 8,
            totalControl: 3
        }
    ]



    constructor() {
    }

    ngOnInit() {
        console.log("task-form");
    }

}