export enum DynamicFormFieldType {
    TEXT = 'text',
    TEXTAREA = 'textarea',
    NUMBER = 'number',
    EMAIL = 'email',
    PASSWORD = 'password',
    URL = 'url',
    TEL = 'tel',
    DATE = 'date',
    TIME = 'time',
    MONTH = 'month',
    COLOR = 'color',
    SELECT = 'select',
    MULTI_SELECT = 'multi-select',
    RADIO = 'radio',
    CHECKBOX = 'checkbox',
    TOGGLE = 'toggle',

    SECTION = 'section'
}

export const DYNAMIC_FORM_FIELD_TYPE_LIST: any = [
    { key: 'Text', value: DynamicFormFieldType.TEXT },
    { key: 'Textarea', value: DynamicFormFieldType.TEXTAREA },
    { key: 'Number', value: DynamicFormFieldType.NUMBER },
    { key: 'Email', value: DynamicFormFieldType.EMAIL },
    { key: 'Password', value: DynamicFormFieldType.PASSWORD },
    { key: 'URL', value: DynamicFormFieldType.URL },
    { key: 'Phone', value: DynamicFormFieldType.TEL },
    { key: 'Date', value: DynamicFormFieldType.DATE },
    { key: 'Time', value: DynamicFormFieldType.TIME },
    { key: 'Month', value: DynamicFormFieldType.MONTH },
    { key: 'Color', value: DynamicFormFieldType.COLOR },
    { key: 'Select (single)', value: DynamicFormFieldType.SELECT },
    { key: 'Select (multiple)', value: DynamicFormFieldType.MULTI_SELECT },
    { key: 'Radio', value: DynamicFormFieldType.RADIO },
    { key: 'Checkbox', value: DynamicFormFieldType.CHECKBOX },
    { key: 'Toggle', value: DynamicFormFieldType.TOGGLE },
    { key: 'Section (header)', value: DynamicFormFieldType.SECTION }
];

export const OPTION_BASED_FIELD_TYPES: string[] = [
    DynamicFormFieldType.SELECT, DynamicFormFieldType.MULTI_SELECT,
    DynamicFormFieldType.RADIO, DynamicFormFieldType.CHECKBOX
];

export const TEXT_LIKE_FIELD_TYPES: string[] = [
    DynamicFormFieldType.TEXT, DynamicFormFieldType.TEXTAREA, DynamicFormFieldType.EMAIL,
    DynamicFormFieldType.PASSWORD, DynamicFormFieldType.URL, DynamicFormFieldType.TEL
];

export interface DynamicFormFieldOption {
    label?: any;
    value?: any;
}

export interface DynamicFormField {
    dynamicFormFieldId?: any;
    fieldOrder?: any;
    fieldType?: any;
    fieldName?: any;
    fieldLabel?: any;
    placeHolder?: any;
    defaultValue?: any;
    mandatory?: any;
    pattern?: any;
    minLength?: any;
    maxLength?: any;
    fieldWidth?: any;

    fieldOptions?: any;

    options?: DynamicFormFieldOption[];
}

export interface DynamicForm {
    dynamicFormId?: any;
    formName?: any;
    description?: any;
    status?: any;
    dateCreated?: any;
    totalFields?: any;
    fields?: DynamicFormField[];

    uuid?: any;
}

export interface DynamicFormSubmission {
    dynamicFormSubmissionId?: any;
    dynamicFormId?: any;

    uuid?: any;
    payload?: any;
    dateCreated?: any;
}

export const SUBMISSION_VALUE_TRUNCATE_LENGTH = 40;

export function optionLabelFor(field: DynamicFormField, value: any): any {
    let option = (field.options || []).find((o: DynamicFormFieldOption) => o.value === value);
    return option ? option.label : value;
}

export function sectionKeyFor(field: DynamicFormField, allFields: DynamicFormField[]): any {
    let sorted = (allFields || []).slice().sort((a: DynamicFormField, b: DynamicFormField) =>
        (a.fieldOrder || 0) - (b.fieldOrder || 0));
    let currentSection: any;
    for (let f of sorted) {
        if (f.fieldType === DynamicFormFieldType.SECTION) {
            currentSection = f.fieldName;
            continue;
        }
        if (f === field || (f.dynamicFormFieldId && f.dynamicFormFieldId === field.dynamicFormFieldId)) {
            return currentSection;
        }
    }
    return undefined;
}

export function payloadValueFor(field: DynamicFormField, allFields: DynamicFormField[], payload: any): any {
    if (!payload || field.fieldType === DynamicFormFieldType.SECTION) {

        return undefined;
    }
    let sectionKey = sectionKeyFor(field, allFields);
    if (sectionKey && payload[sectionKey] && payload[sectionKey][field.fieldName] !== undefined) {
        return payload[sectionKey][field.fieldName];
    }
    return payload[field.fieldName];
}

export function submissionFieldDisplayValue(field: DynamicFormField, submission: DynamicFormSubmission, allFields: DynamicFormField[]): string {
    let value = submission ? payloadValueFor(field, allFields, submission.payload) : undefined;
    if (value === undefined || value === null || value === '') {
        return '—';
    }
    if (Array.isArray(value)) {
        return value.length ? value.map((v: any) => optionLabelFor(field, v)).join(', ') : '—';
    }
    if (field.fieldType === DynamicFormFieldType.TOGGLE) {
        return value ? 'Yes' : 'No';
    }
    if (OPTION_BASED_FIELD_TYPES.indexOf(field.fieldType) > -1) {
        return optionLabelFor(field, value);
    }
    return String(value);
}

export function isSubmissionFieldTruncated(field: DynamicFormField, submission: DynamicFormSubmission, allFields: DynamicFormField[]): boolean {
    return submissionFieldDisplayValue(field, submission, allFields).length > SUBMISSION_VALUE_TRUNCATE_LENGTH;
}

export function submissionShareUrl(submission: DynamicFormSubmission): string {
    return submission && submission.uuid
        ? `${config.apiUrl}/dynamicForm.json/fetchSubmissionByUuid?uuid=${submission.uuid}`
        : '';
}

export function formShareUrl(dynamicForm: DynamicForm): string {
    return dynamicForm && dynamicForm.uuid
        ? `${config.apiUrl}/dynamicForm.json/fetchFormByUuid?uuid=${dynamicForm.uuid}`
        : '';
}
