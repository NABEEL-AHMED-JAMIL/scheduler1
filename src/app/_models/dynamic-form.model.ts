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
    /** Non-input heading/divider used to visually group the fields that follow it -- collects no value, never mandatory. */
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

/** Field types that render from a label/value options list. */
export const OPTION_BASED_FIELD_TYPES: string[] = [
    DynamicFormFieldType.SELECT, DynamicFormFieldType.MULTI_SELECT,
    DynamicFormFieldType.RADIO, DynamicFormFieldType.CHECKBOX
];

/** Field types that support pattern/min/max-length text validation. */
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
    /** Raw JSON string as stored/returned by the backend. */
    fieldOptions?: any;
    /** Parsed options list -- UI-only, derived from fieldOptions. */
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
    /** Opaque id for the shareable fetch-by-uuid API -- safe to copy/share since it can't be enumerated. */
    uuid?: any;
}

export interface DynamicFormSubmission {
    dynamicFormSubmissionId?: any;
    dynamicFormId?: any;
    /** Opaque id for the shareable fetch-by-uuid API -- safe to copy/share since it can't be enumerated. */
    uuid?: any;
    payload?: any;
    dateCreated?: any;
}

/** Values longer than this are truncated wherever a submission's field value is previewed. */
export const SUBMISSION_VALUE_TRUNCATE_LENGTH = 40;

/** Resolves an option-based field's stored value to its label (falls back to the raw value if not found). */
export function optionLabelFor(field: DynamicFormField, value: any): any {
    let option = (field.options || []).find((o: DynamicFormFieldOption) => o.value === value);
    return option ? option.label : value;
}

/**
 * fieldName of the nearest preceding Section field in fieldOrder, or undefined if this field
 * appears before any Section (or the form has no sections at all) -- this is how a field's
 * submitted value gets grouped into a nested object in the payload, e.g. a "Session" section
 * wrapping "accounts"/"auth_url" produces payload.session = { accounts, auth_url } instead of
 * dumping every field flat at the top level, matching how downstream ETL/source consumers
 * expect data organized by panel.
 * */
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

/** Reads a field's value out of a submission's payload, honoring section nesting -- falls back
 * to a flat top-level lookup so submissions saved before a field had a section still display. */
export function payloadValueFor(field: DynamicFormField, allFields: DynamicFormField[], payload: any): any {
    if (!payload || field.fieldType === DynamicFormFieldType.SECTION) {
        // a Section is a heading, not a value -- without this guard, a Section field whose
        // own fieldName happens to match its nested payload key (e.g. "session") would
        // resolve to the whole nested object instead of "no value".
        return undefined;
    }
    let sectionKey = sectionKeyFor(field, allFields);
    if (sectionKey && payload[sectionKey] && payload[sectionKey][field.fieldName] !== undefined) {
        return payload[sectionKey][field.fieldName];
    }
    return payload[field.fieldName];
}

/** Human-readable value for one field of a submission -- resolves option values to labels, arrays to a joined list. */
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

/**
 * Direct, shareable API link for one submission -- keyed by uuid (not the sequential id) so a
 * copied/shared link can't be used to enumerate other submissions. Empty until the submission
 * has a uuid (older rows created before this field existed need a one-time backfill).
 * */
export function submissionShareUrl(submission: DynamicFormSubmission): string {
    return submission && submission.uuid
        ? `${config.apiUrl}/dynamicForm.json/fetchSubmissionByUuid?uuid=${submission.uuid}`
        : '';
}

/**
 * Direct, shareable API link for a whole form definition (its fields, not any one submission) --
 * keyed by uuid (not the sequential id) so a copied/shared link can't be used to enumerate other
 * forms. Empty until the form has a uuid (older rows created before this field existed need a
 * one-time backfill, which happens automatically the first time that form is listed/opened).
 * */
export function formShareUrl(dynamicForm: DynamicForm): string {
    return dynamicForm && dynamicForm.uuid
        ? `${config.apiUrl}/dynamicForm.json/fetchFormByUuid?uuid=${dynamicForm.uuid}`
        : '';
}
