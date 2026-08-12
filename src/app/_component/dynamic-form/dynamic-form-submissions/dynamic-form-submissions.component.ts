import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { first } from 'rxjs/operators';
import { AlertService, DynamicFormService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import {
    DynamicForm, DynamicFormField, DynamicFormSubmission,
    submissionFieldDisplayValue, submissionShareUrl
} from '@/_models/dynamic-form.model';

/**
 * Lists every filled-in submission for a form -- clicking a submission's #id
 * opens its own detail page, edit navigates to the fill screen preloaded
 * with that submission, delete removes it after confirmation.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'dynamic-form-submissions',
    templateUrl: 'dynamic-form-submissions.component.html'
})
export class DynamicFormSubmissionsComponent implements OnInit {

    @ViewChild('closeDeleteSubmissionModal', {static: false})
    public closeDeleteSubmissionModal: any;

    public ERROR: string = 'Error';
    public searchSubmission: any = '';

    public dynamicFormId: any;
    public dynamicForm: DynamicForm;
    public submissions: DynamicFormSubmission[] = [];

    public deleteSubmissionId: any;
    public deleteSubmissionIndex: any;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private dynamicFormService: DynamicFormService) {
    }

    ngOnInit(): void {
        this.dynamicFormId = this.route.snapshot.paramMap.get('dynamicFormId');
        this.fetchFormByFormId();
        this.fetchSubmissions();
    }

    public fetchFormByFormId(): void {
        this.spinnerService.show();
        this.dynamicFormService.fetchFormByFormId(this.dynamicFormId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.dynamicForm = response.data;
                (this.dynamicForm.fields || []).forEach((field: DynamicFormField) => {
                    field.options = this.parseOptions(field.fieldOptions);
                });
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    private parseOptions(fieldOptions: any): any[] {
        if (!fieldOptions) {
            return [];
        }
        try {
            return JSON.parse(fieldOptions);
        } catch (e) {
            return [];
        }
    }

    public fetchSubmissions(): void {
        this.spinnerService.show();
        this.dynamicFormService.fetchSubmissionsByFormId(this.dynamicFormId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.submissions = response.data;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public addSubmission(): void {
        this.router.navigate(['/dynamicForm/fill', this.dynamicFormId]);
    }

    public editSubmission(submission: DynamicFormSubmission): void {
        this.router.navigate(['/dynamicForm/fill', this.dynamicFormId, 'edit', submission.dynamicFormSubmissionId]);
    }

    public viewSubmission(submission: DynamicFormSubmission): void {
        this.router.navigate(['/dynamicForm/submissions', this.dynamicFormId, submission.dynamicFormSubmissionId]);
    }

    public copyShareUrl(submission: DynamicFormSubmission): void {
        let url = submissionShareUrl(submission);
        if (!url) {
            return;
        }
        navigator.clipboard.writeText(url).then(() => {
            this.alertService.showSuccess('API link copied to clipboard', 'Copied');
        }, () => {
            this.alertService.showError('Could not copy to clipboard', this.ERROR);
        });
    }

    public confirmDeleteSubmission(submission: DynamicFormSubmission, index: any): void {
        this.deleteSubmissionId = submission.dynamicFormSubmissionId;
        this.deleteSubmissionIndex = index;
    }

    public processDeleteSubmission(): void {
        this.spinnerService.show();
        this.dynamicFormService.deleteSubmission(this.deleteSubmissionId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                // look up by id, not the stale searchFilter-view index -- deleteSubmissionIndex
                // is captured from the *ngFor over the filtered view, so it doesn't line up
                // with this.submissions itself whenever a search term is active
                const realIndex = this.submissions.findIndex(
                    (submission: any) => submission.dynamicFormSubmissionId === this.deleteSubmissionId);
                if (realIndex > -1) {
                    this.submissions.splice(realIndex, 1);
                }
                this.closeDeleteSubmissionModal.nativeElement.click();
                this.deleteSubmissionId = null;
                this.deleteSubmissionIndex = null;
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    /** One-line, at-a-glance summary for the table row -- first couple of filled-in fields, each capped short. */
    public previewValue(submission: DynamicFormSubmission): string {
        let parts: string[] = [];
        for (let field of (this.dynamicForm?.fields || [])) {
            let value = submissionFieldDisplayValue(field, submission, this.dynamicForm.fields);
            if (!value || value === '—') {
                continue;
            }
            parts.push(value.length > 30 ? value.substring(0, 30) + '…' : value);
            if (parts.length === 2) {
                break;
            }
        }
        return parts.length ? parts.join('  ·  ') : '—';
    }

    public back(): void {
        this.router.navigate(['/dynamicForm']);
    }

}
