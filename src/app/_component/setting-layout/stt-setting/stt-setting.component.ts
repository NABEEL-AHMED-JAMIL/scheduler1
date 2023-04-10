import { Component, OnInit } from '@angular/core';
import { STTSidebar } from '@/_models';


@Component({
    selector: 'stt-setting',
    templateUrl: 'stt-setting.component.html'
})
export class SttSettingComponent implements OnInit {

    public selectedMenu: STTSidebar;
    public sttSidebar: STTSidebar[] = [
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
        this.selectedMenu = this.sttSidebar[0];
    }

    ngOnInit() {
    }

    public changeTask(changeTask: STTSidebar, index: any) {
        this.sttSidebar = this.sttSidebar.map(stt => {
            stt.active = false;
            return stt;
        });
        changeTask.active = true;
        this.sttSidebar[index] = changeTask;
        this.selectedMenu = this.sttSidebar[index];
    }

}