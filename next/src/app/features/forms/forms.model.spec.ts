import { describe, it, expect } from 'vitest';
import {
  FormDraft, FormField, answerProblems, answerText, answersForSubmit, defaultPlaceholder, definitionProblems, draftForSave, formatHint,
  keyFromLabel, placeholderOf, submissionStatusText, submissionsOf, uniqueKey,
} from './forms.model';

/** Wave 5 Forms (lite): the rules the console checks as the person types -- the same ones Core applies (FormFields). */
const WOUND_FIELDS: FormField[] = [
  { key: 'patient_id', label: 'Patient ID', type: 'text', required: true, help: 'As on the wristband' },
  { key: 'wound_location', label: 'Wound location', type: 'choice', required: true, options: ['Sacrum', 'Heel', 'Other'] },
  { key: 'length_cm', label: 'Length (cm)', type: 'number', required: true },
  { key: 'observed_on', label: 'Observed on', type: 'date', required: true },
  { key: 'infection_signs', label: 'Signs of infection', type: 'yesNo', required: true },
  { key: 'notes', label: 'Notes', type: 'longText', required: false },
  { key: 'nurse_email', label: 'Nurse e-mail', type: 'email', required: false },
];

const draft = (patch: Partial<FormDraft> = {}): FormDraft =>
  ({ formId: null, name: 'Wound intake', description: '', status: 'Draft', jobId: null, fields: WOUND_FIELDS, ...patch });

describe('Forms -- keys', () => {
  it('makes a key from a label, starting with a letter and never a reserved name', () => {
    expect(keyFromLabel('Wound location (cm)')).toBe('wound_location_cm');
    expect(keyFromLabel('Café visit')).toBe('cafe_visit');
    expect(keyFromLabel('1st visit')).toBe('f_1st_visit');
    expect(keyFromLabel('Submitted at')).toBe('submitted_at_1');
    expect(keyFromLabel('')).toBe('');
  });

  it('numbers a key that is already taken', () => {
    expect(uniqueKey('Notes', ['notes'])).toBe('notes_2');
    expect(uniqueKey('Notes', ['notes', 'notes_2'])).toBe('notes_3');
    expect(uniqueKey('', [])).toBe('field');
  });
});

describe('Forms -- the definition', () => {
  it('accepts the wound intake form', () => {
    expect(definitionProblems(draft())).toEqual({});
  });

  it('marks each wrong field by its position, and the form itself', () => {
    const problems = definitionProblems(draft({
      name: ' ', status: 'Draft',
      fields: [
        { key: 'a', label: '', type: 'text', required: false },
        { key: 'Bad', label: 'B', type: 'text', required: false },
        { key: 'form_id', label: 'C', type: 'text', required: false },
        { key: 'd', label: 'D', type: 'choice', required: false, options: [] },
        { key: 'd', label: 'E', type: 'text', required: false },
        { key: 'f', label: 'F', type: 'choice', required: false, options: ['Yes', 'yes'] },
      ],
    }));
    expect(problems).toEqual({
      form: 'Give the form a name.',
      '0': 'Give it a label.',
      '1': 'Its key must start with a lower-case letter and use only a-z, 0-9 and _ (at most 40).',
      '2': 'The key \'form_id\' is used by the submission itself.',
      '3': 'A choice needs at least one option.',
      '4': 'Another field already has the key \'d\'.',
      '5': 'An option is listed twice.',
    });
    expect(definitionProblems(draft({ status: 'Active', fields: [] }))['form']).toContain('at least one field');
  });

  it('sends a draft trimmed, without a non-choice\'s options and without blank help', () => {
    const sent = draftForSave(draft({
      name: ' Wound intake ', fields: [
        { key: ' a ', label: ' A ', type: 'text', required: false, help: '  ', options: ['x'] },
        { key: 'b', label: 'B', type: 'choice', required: true, options: [' One ', '', 'Two'] },
      ],
    }));
    expect(sent.name).toBe('Wound intake');
    expect(sent.fields).toEqual([
      { key: 'a', label: 'A', type: 'text', required: false, help: null, options: null },
      { key: 'b', label: 'B', type: 'choice', required: true, help: null, options: ['One', 'Two'] },
    ]);
  });

  it('UX2: sends a placeholder trimmed where an empty control shows one, and drops it elsewhere or when blank', () => {
    const sent = draftForSave(draft({
      name: 'Visit', fields: [
        { key: 'a', label: 'A', type: 'text', required: false, placeholder: '  e.g. P-1  ', help: ' Hint ' },
        { key: 'b', label: 'B', type: 'yesNo', required: false, placeholder: 'never shown' },
        { key: 'c', label: 'C', type: 'number', required: false, placeholder: '   ' },
      ],
    }));
    expect(sent.fields[0]).toMatchObject({ placeholder: 'e.g. P-1', help: 'Hint' });
    expect('placeholder' in sent.fields[1]).toBe(false);
    expect('placeholder' in sent.fields[2]).toBe(false);
  });

  it('UX2: marks a placeholder over 120 characters or with a line break, and help over 500, as FormFields does', () => {
    const problems = definitionProblems(draft({
      name: 'Visit', fields: [
        { key: 'a', label: 'A', type: 'text', required: false, placeholder: 'x'.repeat(121) },
        { key: 'b', label: 'B', type: 'email', required: false, placeholder: 'one\ntwo' },
        { key: 'c', label: 'C', type: 'text', required: false, help: 'h'.repeat(501) },
        { key: 'd', label: 'D', type: 'text', required: false, placeholder: 'p'.repeat(120), help: 'h'.repeat(500) },
        { key: 'e', label: 'E', type: 'yesNo', required: false, placeholder: 'x'.repeat(200) },
      ],
    }));
    expect(problems).toEqual({
      '0': 'Its placeholder is longer than 120 characters.',
      '1': 'Its placeholder is one line of text, with no line breaks or tabs.',
      '2': 'Its help text is longer than 500 characters.',
    });
  });
});

describe('Forms -- the answers', () => {
  it('says what is missing or wrong, by field key', () => {
    expect(answerProblems(WOUND_FIELDS, {
      patient_id: ' ', wound_location: 'Elbow', length_cm: 'three', observed_on: '2026-13-45', nurse_email: 'nora',
    })).toEqual({
      patient_id: 'Patient ID is required.',
      wound_location: 'Choose one of Sacrum, Heel, Other.',
      length_cm: 'Enter a number.',
      observed_on: 'Enter a date.',
      infection_signs: 'Signs of infection is required.',
      nurse_email: 'Enter an e-mail address, like name@example.com.',
    });
  });

  it('takes no as an answer to a yes/no, and sends numbers as numbers and nothing blank', () => {
    const answers = { patient_id: ' P-17 ', wound_location: 'Heel', length_cm: '3.5', observed_on: '2026-10-01', infection_signs: false,
      notes: '' };
    expect(answerProblems(WOUND_FIELDS, answers)).toEqual({});
    expect(answersForSubmit(WOUND_FIELDS, answers)).toEqual({ patient_id: 'P-17', wound_location: 'Heel', length_cm: 3.5,
      observed_on: '2026-10-01', infection_signs: false });
  });

  it('words a submission\'s outcome and an answer for reading', () => {
    expect(submissionStatusText({ status: 'RunStarted', jobQueueId: 7331 })).toBe('Run started #7331');
    expect(submissionStatusText({ status: 'RunNotStarted' })).toBe('Run not started');
    expect(submissionStatusText({ status: 'Received' })).toBe('Received');
    expect(answerText(WOUND_FIELDS[4], true)).toBe('Yes');
    expect(answerText(WOUND_FIELDS[4], false)).toBe('No');
    expect(answerText(undefined, null)).toBe('—');
    expect(submissionsOf([{ submissionId: 1, status: 'Received' }, { nope: 1 }, null])).toEqual([{ submissionId: 1, status: 'Received', answers: {} }]);
  });
});

describe('UX2: the default placeholder when a field has none (owner 2026-10-26, "need a placeholder")', () => {
  const f = (label: string, type: FormField['type'], extra: Partial<FormField> & { min?: number; max?: number } = {}) =>
    ({ key: extra.key ?? 'k', label, type, required: false, ...extra });

  it('gives each type its default', () => {
    expect(defaultPlaceholder(f('Case number', 'text'))).toBe('Enter case number');
    expect(defaultPlaceholder(f('Visit notes', 'longText'))).toBe('Write visit notes…');
    expect(defaultPlaceholder(f('Dressings used', 'number'))).toBe('0');
    expect(defaultPlaceholder(f('Nurse e-mail', 'email'))).toBe('name@example.com');
    expect(defaultPlaceholder(f('Phone number', 'text'))).toBe('e.g. +1 555 0100');
    expect(defaultPlaceholder(f('Reach me on', 'text', { key: 'mobile_number' }))).toBe('e.g. +1 555 0100');
    expect(defaultPlaceholder(f('Site', 'choice'))).toBe('Choose…');
    expect(defaultPlaceholder(f('Ward', 'lookup'))).toBe('Choose…');
    expect(defaultPlaceholder(f('Seen on', 'date'))).toBe('Pick a date');
    for (const t of ['yesNo', 'table', 'file', 'signature'] as const) expect(defaultPlaceholder(f('X', t))).toBeNull();
  });

  it('shows a number\'s range, from min and max or from the label', () => {
    expect(defaultPlaceholder(f('Pain', 'number', { min: 1, max: 10 }))).toBe('1–10');
    expect(defaultPlaceholder(f('Pain score (0-10)', 'number'))).toBe('0–10');
    expect(defaultPlaceholder(f('Percent [0 to 100]', 'number'))).toBe('0–100');
    expect(defaultPlaceholder(f('Length (cm)', 'number'))).toBe('0');
  });

  it('takes a bracketed format hint as the example, and leaves units and remarks out', () => {
    expect(formatHint('PATIENT ID (SYNTHETIC, SYN-NNN)')).toBe('SYN-NNN');
    expect(formatHint('Patient id (synthetic, SYN-nnn)')).toBe('SYN-nnn');
    expect(formatHint('Visit day [YYYY-MM-DD]')).toBe('YYYY-MM-DD');
    expect(formatHint('Bed (e.g. 4 North)')).toBe('4 North');
    expect(formatHint('Width (cm)')).toBeNull();
    expect(formatHint('Name (optional)')).toBeNull();
    expect(formatHint('Case number')).toBeNull();
    expect(formatHint('Eggs (eggs, dozen)')).toBeNull();
    expect(defaultPlaceholder(f('PATIENT ID (SYNTHETIC, SYN-NNN)', 'text'))).toBe('e.g. SYN-NNN');
    expect(defaultPlaceholder(f('Work e-mail (e.g. you@clinic.org)', 'email'))).toBe('e.g. you@clinic.org');
    expect(defaultPlaceholder(f('Name (optional)', 'text'))).toBe('Enter name');
  });

  it('reads the label in lower case, keeping an acronym in a mixed-case label', () => {
    expect(defaultPlaceholder(f('Patient ID', 'text'))).toBe('Enter patient ID');
    expect(defaultPlaceholder(f('PATIENT NAME', 'text'))).toBe('Enter patient name');
    expect(defaultPlaceholder(f('Who referred you?', 'text'))).toBe('Enter who referred you');
    expect(defaultPlaceholder(f('', 'text'))).toBe('Enter your answer');
  });

  it('lets the field\'s own placeholder win, a blank one falling back to the default', () => {
    expect(placeholderOf(f('Case number', 'text', { placeholder: 'e.g. WC-2026-0142' }))).toBe('e.g. WC-2026-0142');
    expect(placeholderOf(f('Site', 'choice', { placeholder: 'Choose the wound site' }))).toBe('Choose the wound site');
    expect(placeholderOf(f('Case number', 'text', { placeholder: '  ' }))).toBe('Enter case number');
    expect(placeholderOf(f('Healed', 'yesNo'))).toBeNull();
  });
});
