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
            title: 'STT',
            router: '/profile/sourcetask/sstList',
            active: true,
            subLink: {
                type: 1,
                title: 'Add STT',
                router: '/profile/sourcetask/addStt',
                active: true
            }
        },
        {
            type: 2,
            title: 'STT Form',
            router: '/profile/sourcetask/sstfList',
            active: false,
            subLink: {
                type: 1,
                title: 'Add STTF',
                router: '/profile/sourcetask/addSttf',
                active: true
            }
        },
        {
            type: 3,
            title: 'STT Section',
            router: '/profile/sourcetask/sstsList',
            active: false,
            subLink: {
                type: 1,
                title: 'Add STTS',
                router: '/profile/sourcetask/addStts',
                active: true
            }
        },
        {
            type: 4,
            router: '/profile/sourcetask/sstcList',
            title: 'STT Control',
            active: false,
            subLink: {
                type: 1,
                title: 'Add STTC',
                router: '/profile/sourcetask/addSttc',
                active: true
            }
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