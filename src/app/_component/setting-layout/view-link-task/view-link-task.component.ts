import { Component, OnInit, Input, Inject, HostListener, Output, EventEmitter } from '@angular/core';
import { ApiCode, SourceTask, SourceTaskType } from '@/_models/index';
import { DOCUMENT } from '@angular/common';
import { Action } from '@/_models';
import { SpinnerService } from '@/_helpers';
import { AlertService, SourceTaskService } from '@/_services';
import { first } from 'rxjs/operators';

@Component({
    selector: 'view-link-task',
    templateUrl: 'view-link-task.component.html'
})
export class ViewLinkTaskComponent implements OnInit {	

    public ERROR = 'Error';
    public elem: any;
    public isFullScreen: boolean = false;
    @Input()
    public sourceTaskType:SourceTaskType;
    @Output()
	public cancelSourceTaskType: EventEmitter<Action> = new EventEmitter();

    public sourceTasks: SourceTask[];
    public VIEW_LINK_TASK_TITLE: any = 'View Link Task With TaskType Id ';

    constructor(@Inject(DOCUMENT) private document:any,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceTaskService: SourceTaskService) {
    }

    ngOnInit() {
        this.elem = document.documentElement;
        if (this.sourceTaskType) {
          this.fetchAllLinkSourceTaskWithSourceTaskTypeId(this.sourceTaskType?.sourceTaskTypeId);
        }
    }
  
    public fetchAllLinkSourceTaskWithSourceTaskTypeId(sourceTaskTypeId: any) {
        this.spinnerService.show();
        this.sourceTaskService.fetchAllLinkSourceTaskWithSourceTaskTypeId(sourceTaskTypeId)
          .pipe(first())
          .subscribe((response) => {
            if(response.status === ApiCode.SUCCESS) {
                this.sourceTasks = response.data;
                this.spinnerService.hide();
            } else {
                this.alertService.showError(response.message, this.ERROR);
                this.spinnerService.hide();
            }
        }, (error) => {
            this.alertService.showError(error, this.ERROR);
            this.spinnerService.hide();
        });
    }

    @HostListener('document.fullscreenchange', ['$event'])
    @HostListener('document.webkitfullscreenchange', ['$event'])
    @HostListener('document.mozfullscreenchange', ['$event'])
    @HostListener('document.MSFullscreenChange', ['$event'])
    public fullScreenModes(even: any) {
        this.chkScreenMode();
    }
  
    public chkScreenMode() {
        if (document.fullscreenElement) {
            this.isFullScreen = true;
        } else {
            this.isFullScreen = false;
        }
    }
  
    public openFullScreen(): void {
        if (this.elem.requestFullscreen) {
          this.elem.requestFullscreen();
        } else if (this.elem.mozRequestFullScreen) {
          this.elem.mozRequestFullScreen();
        } else if (this.elem.webkitRequestFullscreen) {
          this.elem.webkitRequestFullscreen();
        } else if (this.elem.msRequestFullscreen) {
          this.elem.msRequestFullscreen();   
        }
        this.isFullScreen = true;
    }
  
    public closeFullScreen(): void {
        if (this.document.exitFullscreen) {
            this.document.exitFullscreen();
        } else if (this.document.mozCancelFullScreen) {
            this.document.mozCancelFullScreen();
        } else if (this.document.webkitExitFullscreen) {
            this.document.webkitExitFullscreen();
        } else if (this.document.msExitFullscreen) {
            this.document.msExitFullscreen();   
        }
        this.isFullScreen = false;
    }

    public resetSourceTaskEvent(): void {
  		  this.cancelSourceTaskType.emit(Action.CLEAR);
	}

}