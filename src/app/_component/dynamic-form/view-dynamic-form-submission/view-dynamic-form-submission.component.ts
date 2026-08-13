import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { first } from 'rxjs/operators';
import { AlertService, DynamicFormService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import {
    DynamicForm, DynamicFormField, DynamicFormSubmission,
    submissionFieldDisplayValue, isSubmissionFieldTruncated, submissionShareUrl
} from '@/_models/dynamic-form.model';

@Component({
    selector: 'view-dynamic-form-submission',
    templateUrl: 'view-dynamic-form-submission.component.html'
})
export class ViewDynamicFormSubmissionComponent implements OnInit {

    @ViewChild('closeDeleteSubmissionModal', {static: false})
    public closeDeleteSubmissionModal: any;

    public ERROR: string = 'Error';
    public dynamicFormId: any;
    public submissionId: any;

    public dynamicForm: DynamicForm;
    public submission: DynamicFormSubmission;
    public otherSubmissions: DynamicFormSubmission[] = [];

    public deleteSubmissionId: any;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private dynamicFormService: DynamicFormService) {
    }

    ngOnInit(): void {

        this.route.params.subscribe((params) => {
            this.dynamicFormId = params.dynamicFormId;
            this.submissionId = params.submissionId;
            this.submission = null;
            this.fetchSubmission();
            if (!this.dynamicForm) {
                this.fetchFormByFormId();
            }
            this.fetchOtherSubmissions();
        });
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

    public fetchSubmission(): void {
        this.spinnerService.show();
        this.dynamicFormService.fetchSubmissionBySubmissionId(this.submissionId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.submission = response.data;
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public fetchOtherSubmissions(): void {
        this.dynamicFormService.fetchSubmissionsByFormId(this.dynamicFormId)
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.otherSubmissions = response.data;
                }
            }, () => {  });
    }

    public selectSubmission(submission: DynamicFormSubmission): void {

        if (submission.dynamicFormSubmissionId == this.submissionId) {
            return;
        }
        this.router.navigate(['/dynamicForm/submissions', this.dynamicFormId, submission.dynamicFormSubmissionId]);
    }

    public displayValue(field: DynamicFormField, submission: DynamicFormSubmission): string {
        return submissionFieldDisplayValue(field, submission, this.dynamicForm.fields);
    }

    public isTruncated(field: DynamicFormField, submission: DynamicFormSubmission): boolean {
        return isSubmissionFieldTruncated(field, submission, this.dynamicForm.fields);
    }

    public previewValue(submission: DynamicFormSubmission): string {
        for (let field of (this.dynamicForm?.fields || [])) {
            let value = submissionFieldDisplayValue(field, submission, this.dynamicForm.fields);
            if (value && value !== '—') {
                return value.length > 40 ? value.substring(0, 40) + '…' : value;
            }
        }
        return '—';
    }

    public editSubmission(): void {
        this.router.navigate(['/dynamicForm/fill', this.dynamicFormId, 'edit', this.submissionId]);
    }

    public get shareUrl(): string {
        return submissionShareUrl(this.submission);
    }

    public copyShareUrl(): void {
        if (!this.shareUrl) {
            return;
        }
        navigator.clipboard.writeText(this.shareUrl).then(() => {
            this.alertService.showSuccess('API link copied to clipboard', 'Copied');
        }, () => {
            this.alertService.showError('Could not copy to clipboard', this.ERROR);
        });
    }

    public get shareToken(): string {
        return (this.submission && this.submission.uuid) || '';
    }

    public copyShareToken(): void {
        if (!this.shareToken) {
            return;
        }
        navigator.clipboard.writeText(this.shareToken).then(() => {
            this.alertService.showSuccess('Token copied to clipboard', 'Copied');
        }, () => {
            this.alertService.showError('Could not copy to clipboard', this.ERROR);
        });
    }

    public confirmDelete(): void {
        this.deleteSubmissionId = this.submissionId;
    }

    public processDelete(): void {
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
                this.closeDeleteSubmissionModal.nativeElement.click();
                this.back();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public back(): void {
        this.router.navigate(['/dynamicForm/submissions', this.dynamicFormId]);
    }

}
