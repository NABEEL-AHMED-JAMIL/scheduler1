import { Component, Input, OnInit } from '@angular/core';
import { TaskTypeSidebar } from '@/_models';


@Component({
    selector: 'task-header',
    templateUrl: 'task-header.component.html'
})
export class TaskHeaderComponent implements OnInit {

    @Input()
    public selectedMenu: TaskTypeSidebar;

    constructor() {
        console.log(this.selectedMenu);
    }

    ngOnInit() {
    }

}