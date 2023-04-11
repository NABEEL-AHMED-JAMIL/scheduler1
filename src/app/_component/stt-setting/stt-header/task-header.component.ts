import { Component, Input, OnInit } from '@angular/core';
import { STTSidebar } from '@/_models';
import { Router } from '@angular/router';


@Component({
    selector: 'stt-header',
    templateUrl: 'stt-header.component.html'
})
export class STTHeaderComponent implements OnInit {

    @Input()
    public selectedMenu: STTSidebar;

    constructor(private router: Router) {
    }

    ngOnInit() {
    }

    public addAction(): void {
        this.router.navigate([this.selectedMenu.subLink.router]);
    }

    public refreshAction(): void {
        this.router.navigate([this.selectedMenu.router]);
    }

}