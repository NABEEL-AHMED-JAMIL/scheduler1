import { Component, Input, OnInit } from '@angular/core';
import { STTSidebar } from '@/_models';
import { Router, ActivatedRoute } from '@angular/router';
import { DataShareService } from '@/_services';

@Component({
    selector: 'stt-header',
    templateUrl: 'stt-header.component.html'
})
export class STTHeaderComponent implements OnInit {

    @Input()
    public selectedMenu: STTSidebar;
    public topHeader: any = [];
    public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;

    constructor(private dataShareService: DataShareService,
        private route:ActivatedRoute, private router: Router) {

    }

    ngOnInit() {
        this.dataShareService.selectedTopHeader$
        .subscribe((value) => {
            this.resetHeaderButton();
            this.topHeader = value;
            if (this.topHeader) {
                this.topHeader.forEach(header => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    } else if (header.type === 'menus') {
                        this.dropdownButton = header;
                    }
                });
            }
        });
    }

    public addAction(): void {
        this.router.navigate([this.addButton.router]);
    }

    public refreshAction(): void {
        this.router.navigate([this.selectedMenu.router]);
    }

    public resetHeaderButton() {
        this.addButton = null;
        this.refreshButton = null;
        this.dropdownButton = null;
    }

}