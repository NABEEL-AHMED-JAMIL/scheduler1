import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, DynamicFormService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, STATUS_LIST } from '@/_models';
import {
    DynamicForm, DynamicFormField, DynamicFormFieldOption, DynamicFormFieldType,
    DYNAMIC_FORM_FIELD_TYPE_LIST, OPTION_BASED_FIELD_TYPES, TEXT_LIKE_FIELD_TYPES
} from '@/_models/dynamic-form.model';

/**
 * Create/edit a dynamic form's name+description, and build its ordered field
 * list (add/edit/remove/reorder) -- each field is its own add/edit modal.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'cu-dynamic-form',
    templateUrl: 'cu-dynamic-form.component.html'
})
export class CUDynamicFormComponent implements OnInit {

    @ViewChild('closeFieldModal', {static: false})
    public closeFieldModal: any;
    @ViewChild('closeDeleteFieldModal', {static: false})
    public closeDeleteFieldModal: any;

    public ERROR: string = 'Error';
    public loading: any = false;
    public submitted: any = false;
    public fieldSubmitted: any = false;

    public dynamicFormId: any;
    public dynamicForm: DynamicForm;
    public statusList: any = STATUS_LIST;
    public fieldTypeList: any = DYNAMIC_FORM_FIELD_TYPE_LIST;

    public dynamicFormForm: FormGroup;
    public fieldForm: FormGroup;
    public editingField: DynamicFormField;
    public optionsDraft: DynamicFormFieldOption[] = [];

    public isOptionBased: boolean = false;
    public isTextLike: boolean = false;
    public isSection: boolean = false;

    public deleteFieldId: any;
    public deleteFieldIndex: any;

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
        if (this.dynamicFormId) {
            this.fetchFormByFormId();
        } else {
            this.dynamicFormForm = this.formBuilder.group({
                formName: ['', Validators.required],
                description: ['']
            });
        }
        this.resetFieldForm();
    }

    // convenience getters for easy access to form fields
    get f() {
        return this.dynamicFormForm.controls;
    }
    get ff() {
        return this.fieldForm.controls;
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
                this.dynamicFormForm = this.formBuilder.group({
                    formName: [this.dynamicForm.formName, Validators.required],
                    description: [this.dynamicForm.description],
                    status: [this.dynamicForm.status]
                });
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public onSubmit(): void {
        this.submitted = true;
        if (this.dynamicFormForm.invalid) {
            return;
        }
        this.loading = true;
        this.spinnerService.show();
        let payload: DynamicForm = {
            formName: this.dynamicFormForm.value.formName,
            description: this.dynamicFormForm.value.description
        };
        if (!this.dynamicFormId) {
            this.dynamicFormService.addForm(payload)
                .pipe(first())
                .subscribe((response) => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    if (response.status === ApiCode.ERROR) {
                        this.alertService.showError(response.message, this.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                    this.router.navigate(['/dynamicForm/edit', response.data.dynamicFormId]);
                }, (error) => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    this.alertService.showError(error, this.ERROR);
                });
        } else {
            payload = { dynamicFormId: this.dynamicFormId, status: this.dynamicFormForm.value.status, ...payload };
            this.dynamicFormService.updateForm(payload)
                .pipe(first())
                .subscribe((response) => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    if (response.status === ApiCode.ERROR) {
                        this.alertService.showError(response.message, this.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                }, (error) => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    this.alertService.showError(error, this.ERROR);
                });
        }
    }

    // ---------------- Field builder ----------------

    private resetFieldForm(): void {
        this.fieldSubmitted = false;
        this.editingField = null;
        this.optionsDraft = [];
        this.fieldForm = this.formBuilder.group({
            fieldType: ['text', Validators.required],
            fieldName: ['', Validators.required],
            fieldLabel: ['', Validators.required],
            placeHolder: [''],
            defaultValue: [''],
            mandatory: [false],
            pattern: [''],
            minLength: [''],
            maxLength: [''],
            fieldWidth: [12, [Validators.required, Validators.min(1), Validators.max(12)]]
        });
        this.onFieldTypeChange('text');
    }

    public openAddField(): void {
        this.resetFieldForm();
    }

    public openEditField(field: DynamicFormField): void {
        this.editingField = field;
        this.fieldSubmitted = false;
        this.optionsDraft = (field.options || []).map(o => ({ ...o }));
        this.fieldForm = this.formBuilder.group({
            fieldType: [field.fieldType, Validators.required],
            fieldName: [field.fieldName, Validators.required],
            fieldLabel: [field.fieldLabel, Validators.required],
            placeHolder: [field.placeHolder],
            defaultValue: [field.defaultValue],
            mandatory: [!!field.mandatory],
            pattern: [field.pattern],
            minLength: [field.minLength],
            maxLength: [field.maxLength],
            fieldWidth: [field.fieldWidth || 12, [Validators.required, Validators.min(1), Validators.max(12)]]
        });
        this.onFieldTypeChange(field.fieldType);
    }

    public onFieldTypeChange(fieldType: any): void {
        this.isOptionBased = OPTION_BASED_FIELD_TYPES.indexOf(fieldType) > -1;
        this.isTextLike = TEXT_LIKE_FIELD_TYPES.indexOf(fieldType) > -1;
        this.isSection = fieldType === DynamicFormFieldType.SECTION;
        if (this.isOptionBased && this.optionsDraft.length === 0) {
            this.optionsDraft.push({ label: '', value: '' });
        }
        if (this.isSection) {
            // a section is a heading/divider, not an input -- it never collects a value, so it can't be mandatory
            this.fieldForm.get('mandatory').setValue(false);
        }
    }

    public addOptionRow(): void {
        this.optionsDraft.push({ label: '', value: '' });
    }

    public removeOptionRow(index: any): void {
        this.optionsDraft.splice(index, 1);
    }

    private parseOptions(fieldOptions: any): DynamicFormFieldOption[] {
        if (!fieldOptions) {
            return [];
        }
        try {
            return JSON.parse(fieldOptions);
        } catch (e) {
            return [];
        }
    }

    public saveField(): void {
        this.fieldSubmitted = true;
        if (this.fieldForm.invalid) {
            return;
        }
        if (this.isOptionBased && this.optionsDraft.filter(o => o.label && o.value).length === 0) {
            this.alertService.showError('Add at least one option.', this.ERROR);
            return;
        }
        let duplicateName = (this.dynamicForm.fields || []).some((field: DynamicFormField) =>
            field.fieldName === this.fieldForm.value.fieldName &&
            (!this.editingField || field.dynamicFormFieldId !== this.editingField.dynamicFormFieldId));
        if (duplicateName) {
            this.alertService.showError('Another field already uses this Field Name -- pick a unique one.', this.ERROR);
            return;
        }
        this.spinnerService.show();
        let payload: DynamicFormField = {
            ...this.fieldForm.value,
            fieldOptions: this.isOptionBased ? JSON.stringify(this.optionsDraft.filter(o => o.label && o.value)) : null
        };
        if (this.isSection) {
            // a section is a heading/divider, not an input -- none of these apply to it
            payload.mandatory = false;
            payload.placeHolder = null;
            payload.defaultValue = null;
            payload.pattern = null;
            payload.minLength = null;
            payload.maxLength = null;
        }
        if (this.editingField) {
            payload.dynamicFormFieldId = this.editingField.dynamicFormFieldId;
            payload.fieldOrder = this.editingField.fieldOrder;
            this.dynamicFormService.updateField(payload)
                .pipe(first())
                .subscribe((response) => {
                    this.spinnerService.hide();
                    if (response.status === ApiCode.ERROR) {
                        this.alertService.showError(response.message, this.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                    Object.assign(this.editingField, payload);
                    this.editingField.options = this.isOptionBased ? this.optionsDraft.filter(o => o.label && o.value) : [];
                    this.closeFieldModal.nativeElement.click();
                }, (error) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error, this.ERROR);
                });
        } else {
            payload.fieldOrder = (this.dynamicForm.fields || []).length + 1;
            this.dynamicFormService.addField(this.dynamicFormId, payload)
                .pipe(first())
                .subscribe((response) => {
                    this.spinnerService.hide();
                    if (response.status === ApiCode.ERROR) {
                        this.alertService.showError(response.message, this.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                    this.dynamicForm = response.data;
                    (this.dynamicForm.fields || []).forEach((field: DynamicFormField) => {
                        field.options = this.parseOptions(field.fieldOptions);
                    });
                    this.closeFieldModal.nativeElement.click();
                }, (error) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error, this.ERROR);
                });
        }
    }

    public deleteField(dynamicFormFieldId: any, index: any): void {
        this.deleteFieldId = dynamicFormFieldId;
        this.deleteFieldIndex = index;
    }

    public processDeleteField(): void {
        this.spinnerService.show();
        this.dynamicFormService.deleteField(this.deleteFieldId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.dynamicForm.fields.splice(this.deleteFieldIndex, 1);
                this.closeDeleteFieldModal.nativeElement.click();
                this.deleteFieldId = null;
                this.deleteFieldIndex = null;
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    /** Swap fieldOrder with the neighbouring field and persist both. */
    public moveField(index: any, direction: any): void {
        let targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= this.dynamicForm.fields.length) {
            return;
        }
        let current = this.dynamicForm.fields[index];
        let target = this.dynamicForm.fields[targetIndex];
        let currentOrder = current.fieldOrder;
        current.fieldOrder = target.fieldOrder;
        target.fieldOrder = currentOrder;
        this.dynamicForm.fields[index] = target;
        this.dynamicForm.fields[targetIndex] = current;
        this.spinnerService.show();
        this.dynamicFormService.updateField(current)
            .pipe(first())
            .subscribe(() => {
                this.dynamicFormService.updateField(target)
                    .pipe(first())
                    .subscribe(() => {
                        this.spinnerService.hide();
                    }, (error) => {
                        this.spinnerService.hide();
                        this.alertService.showError(error, this.ERROR);
                    });
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public back(): void {
        this.router.navigate(['/dynamicForm']);
    }

}
