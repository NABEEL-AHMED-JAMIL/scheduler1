import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
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
            router: '/stt',
            active: false,
            subLink: {
                type: 1,
                title: 'Add STT',
                router: '/stt/addStt',
                active: false
            }
        },
        {
            type: 2,
            title: 'STT Form',
            router: '/sstf',
            active: false,
            subLink: {
                type: 1,
                title: 'Add STTF',
                router: '/sstf/addSttf',
                active: false
            }
        },
        {
            type: 3,
            title: 'STT Section',
            router: '/ssts',
            active: false,
            subLink: {
                type: 1,
                title: 'Add STTS',
                router: '/ssts/addStts',
                active: false
            }
        },
        {
            type: 4,
            router: '/sstc',
            title: 'STT Control',
            active: false,
            subLink: {
                type: 1,
                title: 'Add STTC',
                router: '/sstc/addSttc',
                active: false
            }
        }
    ];

    constructor(private route:ActivatedRoute,
        private router:Router) {
        this.selectedMenu = route.snapshot.data['selectedMenu'];
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