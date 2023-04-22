import { Component, OnInit, Input,
    Output, EventEmitter, ViewChild } from '@angular/core';

@Component({
    selector: 'del-box',
    templateUrl: 'del-box.component.html'
})
export class DeleteBoxComponent implements OnInit {

    @Input()
    public title: any;
    @Input()
    public subTitle: any;
    @Output()
    public deleteEvent = new EventEmitter<void>();
    @ViewChild('closebutton', {static: false})
	public closeButton: any;

    constructor() {
    }

    ngOnInit() {
    }

    public deleteAction(): any {
        this.closeButton.nativeElement.click();
        this.deleteEvent.emit();
    }

}