import { Component, OnInit, ViewChild } from '@angular/core';
import { slideInOutAnimation } from '../../_content/slide-in-out.animation';
import { SourceJobService, SourceTaskService, AlertService } from '@/_services/index';
import { Router, ActivatedRoute } from '@angular/router';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';

@Component({
    selector: 'batch-action',
    templateUrl: 'batch-action.component.html',
    animations: [slideInOutAnimation],
    host: {
        '[@slideInOutAnimation]': ''
    }
})
export class SourceBatchActionComponent implements OnInit {

    public SUCCESS = 'SUCCESS';
    public ERROR = 'Error';
    public currentTaskState: any = 'Batch Action';
    public buttonMessage: any;
    @ViewChild('inputUpload', {static: false})
    public inputUpload;
    public router: any;
    public action: any;
    public errors: any;

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService,
        private sourceTaskService: SourceTaskService) {
        this._activatedRoute.data
        .subscribe((data: any) => {
            this.router = data.router;
            this.action = data.action;
            if (this.action === 'sourceJob') {
               this.buttonMessage = 'Job';
            } else {
                this.buttonMessage = 'Task';
            }
        });
    }

    ngOnInit() {
    }

    public uploadBulk(fileToUpload: File): void {
        this.spinnerService.show();
        this.errors = [];
        if (this.action === 'sourceJob') {
            this.sourceJobService.uploadSourceJob(fileToUpload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response?.status === this.SUCCESS) {
                    this.alertService.showSuccess(response.message, 'Message');
                } else {
                    this.errors = response.data;
                    this.alertService.showError(response.message, this.ERROR);
                }
                this.inputUpload.nativeElement.value = '';
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        } else {
            this.sourceTaskService.uploadSourceTask(fileToUpload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response?.status === this.SUCCESS) {
                    this.alertService.showSuccess(response.message, 'Message');
                } else {
                    this.errors = response.data;
                    this.alertService.showError(response.message, this.ERROR);
                }
                this.inputUpload.nativeElement.value = '';
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        }
    }

    public downloadList(): void {
        this.spinnerService.show();
        if (this.action === 'sourceJob') {
            this.sourceJobService.downloadListSourceJob()
            .pipe(first())
            .subscribe((response) => {
                this.downLoadFile(response);
                this.spinnerService.hide();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        } else {
            this.sourceTaskService.downloadListSourceTask()
            .pipe(first())
            .subscribe((response) => {
                this.downLoadFile(response);
                this.spinnerService.hide();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        }
    }

    public downloadSourceTemplate(): void {
        this.spinnerService.show();
        if (this.action === 'sourceJob') {
            debugger
            this.sourceJobService.downloadSourceJobTemplateFile()
            .pipe(first())
            .subscribe((response) => {
                this.downLoadFile(response);
                this.spinnerService.hide();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        } else {
            this.sourceTaskService.downloadSourceTaskTemplate()
            .pipe(first())
            .subscribe((response) => {
                this.downLoadFile(response);
                this.spinnerService.hide();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
        }
    }

    public backClicked(): void {
        this._router.navigateByUrl(this.router);
    }

    /**
     * Method is use to download file.
     * @param data - Array Buffer data
     */
    public downLoadFile(data: any): void {
        let blob = new Blob([data], { 
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        let url = window.URL.createObjectURL(blob);
        let pwa = window.open(url);
        if (!pwa || pwa.closed || typeof pwa.closed == 'undefined') {
            alert( 'Please disable your Pop-up blocker and try again.');
        }
    }

}
