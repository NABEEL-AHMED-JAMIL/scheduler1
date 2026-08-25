/**
 * Shapes for the dynamic form builder, matching DynamicFormDto, DynamicFormFieldDto and
 * DynamicFormSubmissionDto on the server.
 */

export interface DynamicFormField {
  dynamicFormFieldId?: number;
  fieldOrder?: number;
  fieldType: string;
  fieldName: string;
  fieldLabel: string;
  placeHolder?: string | null;
  defaultValue?: string | null;
  mandatory: boolean;
  pattern?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
  /** Columns out of 12, so two half-width fields sit on one line. */
  fieldWidth?: number | null;
  /** Newline-separated choices; only select, multi-select and radio read it. */
  fieldOptions?: string | null;
}

export interface DynamicForm {
  dynamicFormId?: number;
  formName: string;
  description?: string | null;
  status?: string;
  dateCreated?: string;
  totalFields?: number;
  uuid?: string;
  fields?: DynamicFormField[];
}

export interface DynamicFormSubmission {
  dynamicFormSubmissionId?: number;
  dynamicFormId: number;
  uuid?: string;
  payload: Record<string, unknown>;
  dateCreated?: string;
}

/** Exactly the set ALLOWED_FIELD_TYPES accepts; anything else is rejected on save. */
export const FIELD_TYPES = [
  'text', 'textarea', 'number', 'email', 'password', 'url', 'tel',
  'date', 'time', 'month', 'color', 'select', 'multi-select',
  'radio', 'checkbox', 'toggle', 'section',
] as const;

/** A section is a heading between fields, not an input, so it collects no value. */
export const SECTION_TYPE = 'section';

/** The types whose newline-separated fieldOptions are actually read. */
export const CHOICE_TYPES = ['select', 'multi-select', 'radio'];

/** The types that take a length range and a pattern. */
export const TEXTUAL_TYPES = ['text', 'textarea', 'email', 'password', 'url', 'tel'];

/** True/false controls, which bind to a boolean rather than a string. */
export const BOOLEAN_TYPES = ['checkbox', 'toggle'];

/** Maps a field type to the input type attribute that renders it. */
export function inputTypeFor(fieldType: string): string {
  switch (fieldType) {
    case 'number': return 'number';
    case 'email': return 'email';
    case 'password': return 'password';
    case 'url': return 'url';
    case 'tel': return 'tel';
    case 'date': return 'date';
    case 'time': return 'time';
    case 'month': return 'month';
    case 'color': return 'color';
    default: return 'text';
  }
}

/** The choices for a select, radio or multi-select, one per line. */
export function optionsOf(field: DynamicFormField): string[] {
  return (field.fieldOptions ?? '').split('\n').map(o => o.trim()).filter(Boolean);
}

/**
 * The server's own checks, repeated so a problem is named in place rather than after a round
 * trip. Wording follows the server's messages.
 */
export function validateField(field: DynamicFormField): string | null {
  if (!field.fieldType || !FIELD_TYPES.includes(field.fieldType as never)) {
    return 'Field fieldType missing or not supported.';
  }
  if (!field.fieldName?.trim()) return 'Field fieldName missing.';
  if (!field.fieldLabel?.trim()) return 'Field fieldLabel missing.';
  return null;
}

/**
 * Whole-form checks the server does not make but a builder should: two fields writing one name
 * means the second silently wins when the submission is assembled.
 */
export function validateForm(form: DynamicForm): string | null {
  if (!form.formName?.trim()) return 'Form name missing.';
  const fields = form.fields ?? [];
  const names = new Set<string>();
  for (const field of fields) {
    const problem = validateField(field);
    if (problem) return problem;
    if (field.fieldType === SECTION_TYPE) continue;
    const name = field.fieldName.trim();
    if (names.has(name)) {
      return `Two fields are both named "${name}". Each name can appear once.`;
    }
    names.add(name);
  }
  return null;
}
