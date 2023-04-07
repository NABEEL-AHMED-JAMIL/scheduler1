import { Component, OnInit } from '@angular/core';
import { TaskTypeSidebar } from '@/_models';


@Component({
    selector: 'task-type-setting',
    templateUrl: 'task-type-setting.component.html'
})
export class TaskTypeSettingComponent implements OnInit {

    public selectedMenu: TaskTypeSidebar;
    public sttSidebar: TaskTypeSidebar[] = [
        {
            type: 1,
            title: 'Task Type',
            router: 'apple',
            active: true
        },
        {
            type: 2,
            title: 'Task Form',
            router: 'apple',
            active: false
        },
        {
            type: 3,
            router: 'apple',
            title: 'Form Section',
            active: false
        },
        {
            type: 4,
            router: 'apple',
            title: 'Form Control',
            active: false
        }
    ];

    constructor() {
        if (localStorage.getItem('selectedMenu')) {
            this.selectedMenu = JSON.parse(localStorage.getItem('selectedMenu'));
        } else {
            this.selectedMenu = this.sttSidebar[0];
            localStorage.setItem('selectedMenu', JSON.stringify(this.selectedMenu));
        }
    }

    ngOnInit() {
    }

    public changeTask(changeTask: TaskTypeSidebar, index: any) {
        this.sttSidebar = this.sttSidebar.map(stt => {
            stt.active = false;
            return stt;
        });
        changeTask.active = true;
        this.sttSidebar[index] = changeTask;
        this.selectedMenu = this.sttSidebar[index];
        localStorage.setItem('selectedMenu', JSON.stringify(this.selectedMenu));
    }

}