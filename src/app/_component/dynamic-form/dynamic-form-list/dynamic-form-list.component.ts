import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AlertService, DynamicFormService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode } from '@/_models';
import { DynamicForm, formShareUrl } from '@/_models/dynamic-form.model';

/**
 * Lists dynamic forms -- create a new one, edit its fields, fill it in, or delete it.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'dynamic-form-list',
    templateUrl: 'dynamic-form-list.component.html'
})
export class DynamicFormListComponent implements OnInit {

    @ViewChild('closebutton', {static: false})
    public closebutton: any;

    public ERROR: string = 'Error';
    public searchDynamicForm: any = '';
    public dynamicForms: DynamicForm[] = [];
    public deleteDynamicFormId: any;
    public deleteSelectedIndex: any;
    // 'Delete' left out on purpose -- a deleted form is never shown (see filteredDynamicForms).
    public readonly statusOptions = ['Active', 'Inactive'];
    // '' means "no filter" -- applied before the free-text search box (see filteredDynamicForms).
    public filterStatus: string = '';

    constructor(
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private dynamicFormService: DynamicFormService) {
    }

    ngOnInit() {
        this.fetchAllForms();
    }

    public get filteredDynamicForms(): DynamicForm[] {
        return this.dynamicForms.filter((form) =>
            form.status !== 'Delete' && (!this.filterStatus || form.status === this.filterStatus));
    }

    public get hasActiveFilters(): boolean {
        return !!(this.filterStatus || this.searchDynamicForm);
    }

    public clearFilters(): void {
        this.filterStatus = '';
        this.searchDynamicForm = '';
    }

    public fetchAllForms(): void {
        this.spinnerService.show();
        this.dynamicFormService.fetchAllForms()
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.dynamicForms = response.data;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public addDynamicForm(): void {
        this.router.navigate(['/dynamicForm/new']);
    }

    public editDynamicForm(dynamicForm: DynamicForm): void {
        this.router.navigate(['/dynamicForm/edit', dynamicForm.dynamicFormId]);
    }

    public fillDynamicForm(dynamicForm: DynamicForm): void {
        this.router.navigate(['/dynamicForm/fill', dynamicForm.dynamicFormId]);
    }

    public viewSubmissions(dynamicForm: DynamicForm): void {
        this.router.navigate(['/dynamicForm/submissions', dynamicForm.dynamicFormId]);
    }

    /** Same "Copy API link" idea already used for a single submission (see
     * dynamic-form-submissions.component.ts#copyShareUrl), but for the whole form definition --
     * meant to be pasted into Postman, a source task config, etc. */
    public copyShareUrl(dynamicForm: DynamicForm): void {
        let url = formShareUrl(dynamicForm);
        if (!url) {
            return;
        }
        navigator.clipboard.writeText(url).then(() => {
            this.alertService.showSuccess('API link copied to clipboard', 'Copied');
        }, () => {
            this.alertService.showError('Could not copy to clipboard', this.ERROR);
        });
    }

    public deleteDynamicForm(dynamicFormId: any, selectedIndex: any): void {
        this.deleteDynamicFormId = dynamicFormId;
        this.deleteSelectedIndex = selectedIndex;
    }

    public processDeleteDynamicForm(): void {
        this.spinnerService.show();
        this.dynamicFormService.deleteForm(this.deleteDynamicFormId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, 'Form Delete');
                    // look up by id, not the stale searchFilter-view index -- deleteSelectedIndex
                    // is captured from the *ngFor over the filtered view, so it doesn't line up
                    // with this.dynamicForms itself whenever a search term is active
                    const realIndex = this.dynamicForms.findIndex(
                        (form: any) => form.dynamicFormId === this.deleteDynamicFormId);
                    if (realIndex > -1) {
                        this.dynamicForms.splice(realIndex, 1);
                    }
                    this.closebutton.nativeElement.click();
                    this.deleteDynamicFormId = null;
                    this.deleteSelectedIndex = null;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

}
