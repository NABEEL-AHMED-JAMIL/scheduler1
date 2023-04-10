import { Component, Input, OnInit } from '@angular/core';
import { STTSidebar } from '@/_models';


@Component({
    selector: 'stt-header',
    templateUrl: 'stt-header.component.html'
})
export class STTHeaderComponent implements OnInit {

    @Input()
    public selectedMenu: STTSidebar;

    constructor() {
        console.log(this.selectedMenu);
    }

    ngOnInit() {
    }

}