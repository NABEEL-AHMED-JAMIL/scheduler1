import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, DynamicFormService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import {
    DynamicForm, DynamicFormField, DynamicFormFieldType, OPTION_BASED_FIELD_TYPES,
    sectionKeyFor, payloadValueFor
} from '@/_models/dynamic-form.model';

/**
 * Renders a dynamic form's fields as a real, validated fillable form.
 * With no :submissionId route param it creates a new submission; with one,
 * it loads that submission and switches into "update" mode. Either way, on
 * success it returns to the submissions screen.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'fill-dynamic-form',
    templateUrl: 'fill-dynamic-form.component.html'
})
export class FillDynamicFormComponent implements OnInit {

    public ERROR: string = 'Error';
    public submitted: any = false;
    public loading: any = false;

    public dynamicFormId: any;
    public dynamicForm: DynamicForm;
    public fillForm: FormGroup;

    /** Non-null when the :submissionId route param is present -- swaps the form into "update" mode. */
    public editingSubmissionId: any = null;

    /** checkbox-group state: fieldName -> Set of checked option values (kept outside the reactive form -- reactive forms don't natively model "N independent checkboxes -> one array value"). */
    public checkboxSelections: { [fieldName: string]: any } = {};

    public OPTION_BASED_FIELD_TYPES = OPTION_BASED_FIELD_TYPES;
    public DynamicFormFieldType = DynamicFormFieldType;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private dynamicFormService: DynamicFormService) {
    }

    ngOnInit(): void {
        this.dynamicFormId = this.route.snapshot.paramMap.get('dynamicFormId');
        this.editingSubmissionId = this.route.snapshot.paramMap.get('submissionId');
        this.fetchFormByFormId();
    }

    public fetchFormByFormId(): void {
        this.spinnerService.show();
        this.dynamicFormService.fetchFormByFormId(this.dynamicFormId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.dynamicForm = response.data;
                (this.dynamicForm.fields || []).forEach((field: DynamicFormField) => {
                    field.options = this.parseOptions(field.fieldOptions);
                });
                this.buildForm();
                if (this.editingSubmissionId) {
                    this.loadSubmissionForEdit();
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    private loadSubmissionForEdit(): void {
        this.spinnerService.show();
        this.dynamicFormService.fetchSubmissionBySubmissionId(this.editingSubmissionId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, this.ERROR);
                    this.editingSubmissionId = null;
                    return;
                }
                let payload = response.data.payload || {};
                (this.dynamicForm.fields || []).forEach((field: DynamicFormField) => {
                    let value = payloadValueFor(field, this.dynamicForm.fields, payload);
                    if (field.fieldType === DynamicFormFieldType.CHECKBOX) {
                        this.checkboxSelections[field.fieldName] = new Set<any>(value || []);
                    } else if (this.fillForm.get(field.fieldName)) {
                        this.fillForm.get(field.fieldName).setValue(value);
                    }
                });
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
                this.editingSubmissionId = null;
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

    private buildForm(): void {
        this.fillForm = this.formBuilder.group({});
        this.checkboxSelections = {};
        (this.dynamicForm.fields || []).forEach((field: DynamicFormField) => {
            if (field.fieldType === DynamicFormFieldType.SECTION) {
                // a heading/divider -- collects no value, so it gets no control and never enters the payload
                return;
            }
            if (field.fieldType === DynamicFormFieldType.CHECKBOX) {
                this.checkboxSelections[field.fieldName] = new Set<any>();
                return;
            }
            let validators = this.buildValidators(field);
            let defaultValue: any = field.defaultValue || '';
            if (field.fieldType === DynamicFormFieldType.MULTI_SELECT) {
                defaultValue = [];
            }
            this.fillForm.addControl(field.fieldName, new FormControl(defaultValue, validators));
        });
    }

    private buildValidators(field: DynamicFormField): any[] {
        let validators = [];
        if (field.mandatory) {
            validators.push(Validators.required);
        }
        if (field.fieldType === DynamicFormFieldType.EMAIL) {
            validators.push(Validators.email);
        }
        if (field.pattern) {
            validators.push(Validators.pattern(field.pattern));
        }
        if (field.minLength) {
            validators.push(Validators.minLength(field.minLength));
        }
        if (field.maxLength) {
            validators.push(Validators.maxLength(field.maxLength));
        }
        return validators;
    }

    public getControl(fieldName: any): FormControl {
        return this.fillForm.get(fieldName) as FormControl;
    }

    public getErrorMessage(field: DynamicFormField): string {
        let control = this.getControl(field.fieldName);
        if (!control || !control.errors) {
            return '';
        }
        if (control.errors.required) {
            return field.fieldLabel + ' is required';
        }
        if (control.errors.email) {
            return 'Not a valid email';
        }
        if (control.errors.pattern) {
            return field.fieldLabel + ' does not match the required pattern';
        }
        if (control.errors.minlength) {
            return 'Minimum length is ' + field.minLength;
        }
        if (control.errors.maxlength) {
            return 'Maximum length is ' + field.maxLength;
        }
        return 'Invalid value';
    }

    public onMultiSelectChange(field: DynamicFormField, event: any): void {
        let selected: any[] = [];
        let options = event.target.options;
        for (let i = 0; i < options.length; i++) {
            if (options[i].selected) {
                selected.push(options[i].value);
            }
        }
        this.getControl(field.fieldName).setValue(selected);
    }

    public isChecked(fieldName: any, value: any): boolean {
        return this.checkboxSelections[fieldName] && this.checkboxSelections[fieldName].has(value);
    }

    public onCheckboxToggle(fieldName: any, value: any, checked: any): void {
        if (!this.checkboxSelections[fieldName]) {
            this.checkboxSelections[fieldName] = new Set<any>();
        }
        if (checked) {
            this.checkboxSelections[fieldName].add(value);
        } else {
            this.checkboxSelections[fieldName].delete(value);
        }
    }

    /** Builds the submitted JSON payload, nesting each field's value under the fieldName of the
     * Section it falls under (e.g. a "session" section wrapping accounts/auth_url produces
     * payload.session = { accounts, auth_url }) -- fields with no owning section stay flat at
     * the top level, so a form with no sections behaves exactly as it always has. */
    private buildPayload(): any {
        let payload: any = {};
        (this.dynamicForm.fields || []).forEach((field: DynamicFormField) => {
            if (field.fieldType === DynamicFormFieldType.SECTION) {
                return;
            }
            let value = field.fieldType === DynamicFormFieldType.CHECKBOX
                ? Array.from(this.checkboxSelections[field.fieldName] || [])
                : this.fillForm.value[field.fieldName];
            let sectionKey = sectionKeyFor(field, this.dynamicForm.fields);
            if (sectionKey) {
                payload[sectionKey] = payload[sectionKey] || {};
                payload[sectionKey][field.fieldName] = value;
            } else {
                payload[field.fieldName] = value;
            }
        });
        return payload;
    }

    public onSubmit(): void {
        this.submitted = true;
        if (this.fillForm.invalid) {
            this.alertService.showError('Please fix the highlighted fields.', this.ERROR);
            return;
        }
        let missingMandatoryCheckbox = (this.dynamicForm.fields || []).find((field: DynamicFormField) =>
            field.fieldType === DynamicFormFieldType.CHECKBOX && field.mandatory &&
            (!this.checkboxSelections[field.fieldName] || this.checkboxSelections[field.fieldName].size === 0));
        if (missingMandatoryCheckbox) {
            this.alertService.showError(missingMandatoryCheckbox.fieldLabel + ' is required', this.ERROR);
            return;
        }
        this.loading = true;
        this.spinnerService.show();
        let payload = this.buildPayload();
        let request = this.editingSubmissionId
            ? this.dynamicFormService.updateSubmission({
                dynamicFormSubmissionId: this.editingSubmissionId,
                dynamicFormId: this.dynamicFormId,
                payload: payload
            })
            : this.dynamicFormService.submitForm({ dynamicFormId: this.dynamicFormId, payload: payload });
        request.pipe(first())
            .subscribe((response) => {
                this.loading = false;
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.router.navigate(['/dynamicForm/submissions', this.dynamicFormId]);
            }, (error) => {
                this.loading = false;
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public viewSubmissions(): void {
        this.router.navigate(['/dynamicForm/submissions', this.dynamicFormId]);
    }

    public back(): void {
        if (this.editingSubmissionId) {
            this.viewSubmissions();
            return;
        }
        this.router.navigate(['/dynamicForm']);
    }

}
