import { describe, it, expect } from 'vitest';
import {
  FormDraft, FormField, answerProblems, answerText, answersForSubmit, definitionProblems, draftForSave, keyFromLabel, submissionStatusText,
  submissionsOf, uniqueKey,
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
