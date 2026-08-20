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
    AuthService,
    TenantService
} from '@/_services/index';
import { first } from 'rxjs/operators';

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

    public isDragging = false;
    public selectedFileName: string | null = null;
    public isUploading = false;

    public lastUploadOk: boolean | null = null;
    public lastUploadMessage = '';

    public readonly isPlatformAdmin: boolean;
    public readonly tenantId: any;
    public tenants: any[] = [];
    public selectedTenantId: any = '';

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService,
        private sourceTaskService: SourceTaskService,
        private authService: AuthService,
        private tenantService: TenantService) {
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

    public get needsTenantPicker(): boolean {
        return this.isPlatformAdmin && this.action === 'sourceTask';
    }

    ngOnInit() {
        if (this.needsTenantPicker) {
            this.tenantService.listTenants()
                .pipe(first())
                .subscribe((response: any) => {
                    if (response.status === this.SUCCESS) {
                        this.tenants = response.data || [];
                    } else {
                        this.alertService.showError(response.message, this.ERROR);
                    }
                }, (error: any) => {
                    this.alertService.showError(error, this.ERROR);
                });
        }
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
        if (this.needsTenantPicker && !this.selectedTenantId) {
            this.alertService.showError('Pick a tenant before uploading -- these tasks need to belong to one.', this.ERROR);
            return;
        }
        this.selectedFileName = fileToUpload.name;
        this.isUploading = true;
        this.lastUploadOk = null;
        this.spinnerService.show();
        this.errors = [];
        const uploadCall = this.action === 'sourceJob'
            ? this.sourceJobService.uploadSourceJob(fileToUpload)
            : this.sourceTaskService.uploadSourceTask(fileToUpload, this.selectedTenantId);
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
                this.downLoadFile(response, `${this.buttonMessage}List.xlsx`);
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
                this.downLoadFile(response, `${this.buttonMessage}Template.xlsx`);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public backClicked(): void {
        this._router.navigateByUrl(this.router);
    }

    public downLoadFile(data: any, fileName: string): void {
        const blob = new Blob([data], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

}
