import { Component, OnInit, Input, Inject, HostListener, Output, EventEmitter } from '@angular/core';
import { ApiCode, Paging, QueryCriteria, SourceTask, SourceJobDetail } from '@/_models/index';
import { DOCUMENT } from '@angular/common';
import { Action } from '@/_models';
import { SpinnerService } from '@/_helpers';
import { AlertService, SourceTaskService } from '@/_services';
import { first } from 'rxjs/operators';

@Component({
    selector: 'view-link-job',
    templateUrl: 'view-link-job.componenet.html',
})
export class ViewLinkJobsComponent implements OnInit {

    public ERROR = 'Error';
    public elem: any;
    public isFullScreen: boolean = false;
    // pagint
    public paging: Paging;
    public queryCriteria: QueryCriteria;
    @Input()
    public sourceTask:SourceTask;
    @Output()
	public cancelSourceTask: EventEmitter<Action> = new EventEmitter();
    public sourceJobDetails: SourceJobDetail[];
    public VIEW_LINK_JOBS_TITLE: any = 'View Link Jobs With Task Id ';

    constructor(@Inject(DOCUMENT) private document:any,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceTaskService: SourceTaskService) {
    }

    ngOnInit() {
        this.elem = document.documentElement;
        if (this.sourceTask) {
          this.queryCriteria = {
            page: 1,
            limit: 5000,
            order: 'DESC',
            columnName: 'st.task_detail_id',
            taskDetailId: this.sourceTask.taskDetailId
          };
          this.fetchAllLinkJobsWithSourceTaskId(this.queryCriteria);
        }
    }

    public fetchAllLinkJobsWithSourceTaskId(queryCriteria:QueryCriteria) {
        this.spinnerService.show();
        this.sourceTaskService.fetchAllLinkJobsWithSourceTaskId(queryCriteria)
          .pipe(first()).subscribe((response) => {
            if(response.status === ApiCode.SUCCESS) {
                this.sourceJobDetails = response.data;
                this.paging = response.paging;
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
  		this.cancelSourceTask.emit(Action.CLEAR);
	}

}
