import { Component, OnInit, ViewChild } from '@angular/core';
import {
    Router,
    ActivatedRoute
} from '@angular/router';
import { SpinnerService } from '@/_helpers';
import {
    SourceJobService,
    SourceTaskService,
    AlertService,
    AuthService
} from '@/_services/index';
import { first } from 'rxjs/operators';


/**
 * Batch Action -- bulk Upload/Download/Template for Source Job and Source Task, driven by the
 * ':action' route data (see app.routing.ts: 'sourceJob' -> Job, anything else -> Task). Every
 * record this creates is scoped to the uploader's own tenant server-side (see
 * SourceJobBulkServiceImpl.uploadSourceJob / SourceTaskServiceImpl.uploadSourceTask) -- the
 * banner here just makes that boundary visible instead of silent, and a Platform Admin gets
 * its own copy since their uploads are tenant-less by design (see AppUser's own javadoc).
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'batch-action',
    templateUrl: 'batch-action.component.html'
})
export class SourceBatchActionComponent implements OnInit {

    public SUCCESS = 'SUCCESS';
    public ERROR = 'Error';
    public currentTaskState = 'Batch Action';
    public buttonMessage = '';
    @ViewChild('inputUpload', {static: false})
    public inputUpload!: { nativeElement: { value: string, click: () => void } };
    public router = '';
    public action = '';
    public errors: any[] = [];
    // Drag-and-drop state for the upload zone -- isDragging only drives the hover style,
    // selectedFileName lets the zone show what's queued/just finished instead of going blank
    // the instant the native <input> is cleared for a re-upload.
    public isDragging = false;
    public selectedFileName: string | null = null;
    public isUploading = false;
    // Last upload outcome, shown as a result banner above the error table (or in place of it,
    // when there were no row-level errors to list) -- null before the first upload this visit.
    public lastUploadOk: boolean | null = null;
    public lastUploadMessage = '';

    public readonly isPlatformAdmin: boolean;
    public readonly tenantId: any;

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService,
        private sourceTaskService: SourceTaskService,
        private authService: AuthService) {
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
        const user = this.authService.currentUser;
        this.isPlatformAdmin = user?.userRole === 'PLATFORM_ADMIN';
        this.tenantId = user?.tenantId;
    }

    ngOnInit() {
    }

    public onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = true;
    }

    public onDragLeave(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;
    }

    public onDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            this.uploadBulk(file);
        }
    }

    public uploadBulk(fileToUpload: File): void {
        if (!fileToUpload) {
            return;
        }
        this.selectedFileName = fileToUpload.name;
        this.isUploading = true;
        this.lastUploadOk = null;
        this.spinnerService.show();
        this.errors = [];
        const uploadCall = this.action === 'sourceJob'
            ? this.sourceJobService.uploadSourceJob(fileToUpload)
            : this.sourceTaskService.uploadSourceTask(fileToUpload);
        uploadCall
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                this.isUploading = false;
                this.lastUploadOk = response?.status === this.SUCCESS;
                this.lastUploadMessage = response.message;
                if (this.lastUploadOk) {
                    this.alertService.showSuccess(response.message, 'Message');
                } else {
                    this.errors = response.data || [];
                    this.alertService.showError(response.message, this.ERROR);
                }
                if (this.inputUpload) {
                    this.inputUpload.nativeElement.value = '';
                }
            }, (error: any) => {
                this.spinnerService.hide();
                this.isUploading = false;
                this.lastUploadOk = false;
                this.lastUploadMessage = error;
                this.alertService.showError(error, this.ERROR);
                if (this.inputUpload) {
                    this.inputUpload.nativeElement.value = '';
                }
            });
    }

    public downloadList(): void {
        this.spinnerService.show();
        const downloadCall = this.action === 'sourceJob'
            ? this.sourceJobService.downloadListSourceJob()
            : this.sourceTaskService.downloadListSourceTask();
        downloadCall
            .pipe(first())
            .subscribe((response) => {
                this.downLoadFile(response);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public downloadSourceTemplate(): void {
        this.spinnerService.show();
        const templateCall = this.action === 'sourceJob'
            ? this.sourceJobService.downloadSourceJobTemplateFile()
            : this.sourceTaskService.downloadSourceTaskTemplate();
        templateCall
            .pipe(first())
            .subscribe((response) => {
                this.downLoadFile(response);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
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
            // Nothing ended up using the blob URL -- release it right away instead of leaking it.
            window.URL.revokeObjectURL(url);
            return;
        }
        // Revoke once the popup has actually loaded the blob URL, not immediately -- unlike
        // object-browser.component.ts's anchor-click download (synchronous, safe to revoke right
        // after), this opens a real new tab that asynchronously navigates to the blob URL; an
        // immediate revoke could race that and break the download.
        pwa.onload = () => window.URL.revokeObjectURL(url);
    }

}
