import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AlertService, PdfHighlighterService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode } from '@/_models';
import { PdfHighlighterTask } from '@/_models/index';

/**
 * Lists PDF highlighter tasks (basic detail only -- task name, highlighter status,
 * status -- no organization/form linkage, that lives on the io-frontend side).
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'pdf-highlighter',
    templateUrl: 'pdf-highlighter.component.html'
})
export class PdfHighlighterComponent implements OnInit {

    @ViewChild('closebutton', {static: false})
    public closebutton: any;

    public ERROR: string = 'Error';
    public searchPdfHighlighterTask: any = '';
    public DELETE_PDF_HIGHLIGHTER_TASK = 'PDF Highlighter Task Delete';
    public pdfHighlighterTasks: PdfHighlighterTask[] = [];
    public deletePdfHighlighterTaskId: any;
    public deleteSelectedIndex: any;
    public readonly highlighterStatusOptions = ['Draft', 'Ready'];
    // 'Delete' left out on purpose -- a deleted task is never shown (see filteredPdfHighlighterTasks).
    public readonly statusOptions = ['Active', 'Inactive'];
    // '' means "no filter" for each -- applied before the free-text search box (see
    // filteredPdfHighlighterTasks).
    public filterHighlighterStatus: string = '';
    public filterStatus: string = '';

    constructor(
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private pdfHighlighterService: PdfHighlighterService) {
    }

    ngOnInit() {
        this.fetchAllPdfHighlighterTask();
    }

    public get filteredPdfHighlighterTasks(): PdfHighlighterTask[] {
        return this.pdfHighlighterTasks.filter((task) =>
            task.status !== 'Delete'
            && (!this.filterHighlighterStatus || task.highlighterStatus === this.filterHighlighterStatus)
            && (!this.filterStatus || task.status === this.filterStatus));
    }

    public get hasActiveFilters(): boolean {
        return !!(this.filterHighlighterStatus || this.filterStatus || this.searchPdfHighlighterTask);
    }

    public clearFilters(): void {
        this.filterHighlighterStatus = '';
        this.filterStatus = '';
        this.searchPdfHighlighterTask = '';
    }

    public fetchAllPdfHighlighterTask(): void {
        this.spinnerService.show();
        this.pdfHighlighterService.fetchAllPdfHighlighterTask()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.spinnerService.hide();
                    this.pdfHighlighterTasks = response.data;
                } else {
                    this.spinnerService.hide();
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public addPdfHighlighterTask(): void {
        this.router.navigate(['/pdfHighlighter/new']);
    }

    public editPdfHighlighterTask(pdfHighlighterTask: PdfHighlighterTask): void {
        this.router.navigate(['/pdfHighlighter', pdfHighlighterTask.pdfHighlighterTaskId]);
    }

    public viewPdfHighlighterTask(pdfHighlighterTask: PdfHighlighterTask): void {
        this.router.navigate(['/pdfHighlighter', pdfHighlighterTask.pdfHighlighterTaskId], { queryParams: { mode: 'view' } });
    }

    public deletePdfHighlighterTask(pdfHighlighterTaskId: any, selectedIndex: any): void {
        this.deletePdfHighlighterTaskId = pdfHighlighterTaskId;
        this.deleteSelectedIndex = selectedIndex;
    }

    /** Bucket key the task's PDF is stored under (etl-bucket/pdf-highlighter/{id}/{fileName}) -- see PdfHighlighterTaskServiceImpl.taskPrefix(). */
    public filePathFor(pdfHighlighterTask: PdfHighlighterTask): string {
        if (!pdfHighlighterTask.fileName) { return ''; }
        return 'pdf-highlighter/' + pdfHighlighterTask.pdfHighlighterTaskId + '/' + pdfHighlighterTask.fileName;
    }

    public copyPath(path: string): void {
        if (!path) { return; }
        navigator.clipboard.writeText(path).then(() => {
            this.alertService.showSuccess('File path copied to clipboard', 'Copied');
        }, () => {
            this.alertService.showError('Could not copy to clipboard', this.ERROR);
        });
    }

    public processDeletePdfHighlighterTask(): void {
        this.spinnerService.show();
        this.pdfHighlighterService.deletePdfHighlighterTask(this.deletePdfHighlighterTaskId)
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.spinnerService.hide();
                    this.alertService.showSuccess(response.message, this.DELETE_PDF_HIGHLIGHTER_TASK);
                    // look up by id, not the stale searchFilter-view index -- deleteSelectedIndex
                    // is captured from the *ngFor over the filtered view, so it doesn't line up
                    // with this.pdfHighlighterTasks itself whenever a search term is active
                    const realIndex = this.pdfHighlighterTasks.findIndex(
                        (task: any) => task.pdfHighlighterTaskId === this.deletePdfHighlighterTaskId);
                    if (realIndex > -1) {
                        this.pdfHighlighterTasks.splice(realIndex, 1);
                    }
                    this.closebutton.nativeElement.click();
                    this.deletePdfHighlighterTaskId = null;
                    this.deleteSelectedIndex = null;
                } else {
                    this.spinnerService.hide();
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }
}
