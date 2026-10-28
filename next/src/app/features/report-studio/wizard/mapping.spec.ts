import { describe, it, expect } from 'vitest';
import { SchemaField, TemplateDefinition } from '../report-studio.model';
import { ALL, CONTRACT_ONLY, HEADER, MORE, TOP, humanize, plainWords, templateFields } from './template-fields';
import {
  Choice, SURE, autoMatch, combined, describe as describeChoice, fitCount, mappingBody, nameParts, normal, priorFrom, score,
} from './auto-match';

/**
 * Report data and mapping (owner 2026-10-27; "make sure this works for all types of template"): the template's fields by
 * its own words and parts -- for a one-record intake, a table of the data's own rows, a list-heavy review read by index,
 * a template with no sections, one of several pages, nested repeats, pictures -- and every field matched to the data by
 * key, label, names written differently and synonyms, with "Needs you" only for what a person must settle.
 */
const def = (components: unknown[], extra: Record<string, unknown> = {}): TemplateDefinition =>
  ({ schemaVersion: '1.0', template: { name: 'T', datasets: [{ id: 'primary', rootPath: '$' }], components, ...extra } }) as TemplateDefinition;

const INTAKE = def([
  { id: 'hdr', type: 'section', role: 'header', children: [{ id: 'hdr-t', type: 'text', content: 'Intake · {{primary.intake_id}}' }] },
  { id: 'title', type: 'heading', level: 1, content: 'Patient intake summary · {{primary.patient_name}}' },
  { id: 'who', type: 'section', children: [{ id: 'r', type: 'row', children: [{ id: 'c', type: 'column', children: [
    { id: 'dob', type: 'labelValue', label: 'Date of birth', binding: 'primary.dob' },
    { id: 'intake', type: 'labelValue', label: 'Intake', binding: 'primary.intake_id' },
  ] }] }, { id: 'g', type: 'conditional', when: "primary.is_minor = true and primary.sex = 'is_minor'", children: [
    { id: 'gn', type: 'labelValue', label: 'Parent or guardian', binding: 'primary.guardian_name' }] }] },
  { id: 'ai', type: 'section', children: [
    { id: 'ai-h', type: 'heading', level: 2, content: 'Intake summary' },
    { id: 'why-h', type: 'heading', level: 3, content: 'Why this priority' },
    { id: 'why', type: 'list', binding: 'primary.ai_triage_reasons' }] },
  { id: 'meds', type: 'section', children: [
    { id: 'meds-h', type: 'heading', level: 3, content: 'Current medicines' },
    { id: 'meds-t', type: 'table', dataset: 'primary.medications', columns: [{ id: 'a', field: 'name', label: 'Medicine' }, { id: 'b', field: 'dose', label: 'Dose' }] }] },
  { id: 'imm', type: 'section', children: [{ id: 'imm-t', type: 'table', title: 'Vaccines', dataset: 'primary.immunizations', columns: [{ id: 'v', field: 'vaccine' }] }] },
  { id: 'sex', type: 'labelValue', label: 'Sex', binding: 'primary.sex' },
  { id: 'sig', type: 'approverSignature', approver: 'first' },
  { id: 'qr', type: 'qrCode', content: 'verifyLink' },
], { dataContract: { fields: [
  { path: 'patient_name', type: 'string', required: true }, { path: 'intake_id', type: 'string', required: true },
  { path: 'dob', type: 'string', required: false }, { path: 'is_minor', type: 'string', required: false },
  { path: 'guardian_name', type: 'string', required: false }, { path: 'ai_triage_reasons', type: 'array', required: false },
  { path: 'medications', type: 'array', required: false }, { path: 'immunizations', type: 'array', required: false },
  { path: 'sex', type: 'string', required: false }, { path: 'insurance_payer', type: 'string', required: false },
] } });

const s = (path: string, type = 'string'): SchemaField => ({ path, type, nullable: false });

describe('The template\'s fields, by its own words and parts', () => {
  it('names a one-record intake\'s fields by their labels, headings and tables, grouped by its sections', () => {
    const { fields, sections, readsRows } = templateFields(INTAKE);
    const at = (p: string) => fields.find(f => f.path === p)!;
    expect(readsRows).toBe(false);
    expect(at('intake_id')).toEqual(expect.objectContaining({ label: 'Intake', section: HEADER, required: true }));
    expect(at('patient_name')).toEqual(expect.objectContaining({ label: 'Patient name', section: TOP }));
    expect(at('dob')).toEqual(expect.objectContaining({ label: 'Date of birth', section: TOP }));
    expect(at('ai_triage_reasons')).toEqual(expect.objectContaining({ label: 'Why this priority', section: 'Intake summary', list: true }));
    expect(at('medications')).toEqual(expect.objectContaining({ label: 'Current medicines', section: 'Current medicines', columns: ['name', 'dose'] }));
    expect(at('medications').columnLabels).toEqual({ name: 'Medicine', dose: 'Dose' });
    expect(at('immunizations')).toEqual(expect.objectContaining({ label: 'Vaccines', section: 'Vaccines' }));
    expect(at('is_minor')).toEqual(expect.objectContaining({ label: 'Is minor', conditionOnly: true }));
    expect(at('sex').conditionOnly).toBe(false);
    expect(at('sex').section).toBe(MORE);
    expect(at('insurance_payer').section).toBe(CONTRACT_ONLY);
    expect(sections[0]).toBe(HEADER);
    expect(fields.map(f => f.path)).not.toContain('verifyLink');
    expect(fields.some(f => f.components.includes('sig'))).toBe(false);
  });

  it('reads a table of the data\'s own rows as each row\'s fields, labelled by their columns', () => {
    const rows = def([
      { id: 'title', type: 'heading', level: 1, content: 'Readmissions · {{report.period}}' },
      { id: 'tbl', type: 'table', title: 'By department', dataset: 'primary', sort: { field: 'readmit_pct', direction: 'desc' },
        columns: [{ id: 'f', field: 'factor', label: 'Department' }, { id: 'p', field: 'readmit_pct', label: '30-day readmissions %' }] },
      { id: 'ftr', type: 'section', role: 'footer', children: [{ id: 'pn', type: 'pageNumber' }] },
    ], { dataContract: { fields: [{ path: 'factor', type: 'string', required: true }, { path: 'readmit_pct', type: 'number', required: true }] } });
    const { fields, readsRows, sections } = templateFields(rows);
    expect(readsRows).toBe(true);
    expect(fields.map(f => `${f.path}:${f.label}:${f.rootRow}:${f.list}`)).toEqual(['factor:Department:true:false', 'readmit_pct:30-day readmissions %:true:false']);
    expect(sections).toEqual([ALL]);
  });

  it('puts a list read by its index under the list, with its columns, and names a section by its title', () => {
    const review = def([
      { id: 'title', type: 'heading', level: 1, content: 'Bone fracture review' },
      { id: 'k', type: 'labelValue', label: 'Images', binding: 'primary.summary[0].images' },
      { id: 'ins', type: 'section', title: 'Insights (DRAFT)', children: [{ id: 't', type: 'text', content: 'Right for {{primary.summary[0].correct}}' }] },
      { id: 'acc', type: 'section', title: 'Accuracy', children: [{ id: 'by', type: 'table', title: 'By true class', dataset: 'primary.byClass', columns: [{ id: 'l', field: 'true_label' }] }] },
      { id: 'grid', type: 'imageGrid', title: 'Flagged', binding: 'primary.latest', imageField: 'image_key', captionFields: ['finding'], filter: { field: 'urgency', equals: 'high' } },
    ], { dataContract: { fields: [{ path: 'summary', type: 'array', required: true }, { path: 'byClass', type: 'array', required: true },
      { path: 'latest', type: 'array', required: true }] } });
    const { fields, sections } = templateFields(review);
    const at = (p: string) => fields.find(f => f.path === p)!;
    expect(at('summary').columns).toEqual(['images', 'correct']);
    expect(at('summary').section).toBe(TOP);
    expect(at('byClass')).toEqual(expect.objectContaining({ label: 'By true class', section: 'Accuracy', columns: ['true_label'] }));
    expect(at('latest')).toEqual(expect.objectContaining({ picture: true, section: MORE, columns: ['image_key', 'finding', 'urgency'] }));
    expect(sections).toEqual([TOP, 'Accuracy', MORE]);
  });

  it('with no contract, needs every path the template reads (placeholders and nested repeats too), each required', () => {
    const bare = def([
      { id: 'who', type: 'text', content: '{{primary.patient.name}} · {{primary.patient.ref}}' },
      { id: 'r', type: 'repeat', dataset: 'primary.visits', as: 'visit', children: [
        { id: 'rv', type: 'text', content: 'Visit {{visit.day}}' },
        { id: 'rt', type: 'table', dataset: 'visit.wounds', columns: [{ id: 'w', field: 'site' }] }] },
      { id: 'res', type: 'table', title: 'Results', dataset: 'primary.results', columns: [{ id: 'x', field: 'test' }] },
      { id: 'pic', type: 'image', binding: 'primary.photo' },
    ]);
    const { fields, sections } = templateFields(bare);
    expect(fields.map(f => `${f.path}:${f.type}:${f.required}`)).toEqual(['patient.name:string:true', 'patient.ref:string:true', 'visits:array:true',
      'results:array:true', 'photo:string:true']);
    expect(fields.find(f => f.path === 'visits')!.columns).toEqual(['day', 'wounds']);
    expect(fields.find(f => f.path === 'photo')!.picture).toBe(true);
    expect(sections).toEqual([ALL]);
  });

  it('groups a template of several pages with no headings by page', () => {
    const paged = def([
      { id: 'a', type: 'labelValue', label: 'Total', binding: 'primary.total' },
      { id: 'pb', type: 'pageBreak' },
      { id: 'b', type: 'labelValue', label: 'Rate', binding: 'primary.rate' },
    ]);
    expect(templateFields(paged).fields.map(f => `${f.path}:${f.section}`)).toEqual(['total:Page 1', 'rate:Page 2']);
  });

  it('says a key in words, and a template\'s words without their placeholders', () => {
    expect(humanize('patient_name')).toBe('Patient name');
    expect(humanize('summary.totalRevenue')).toBe('Total revenue');
    expect(humanize('ai_flags[0].type')).toBe('Type');
    expect(humanize('dob')).toBe('DOB');
    expect(plainWords('Patient intake summary · {{primary.patient_name}}')).toBe('Patient intake summary');
    expect(plainWords('Accession {{primary.accession}}')).toBe('Accession');
  });
});

describe('Auto-match', () => {
  const fields = templateFields(INTAKE).fields;
  const schema = [s('intake_id'), s('first_name'), s('last_name'), s('date_of_birth', 'date'), s('minor', 'boolean'), s('gender'),
    s('reasons', 'array'), s('meds', 'array'), s('meds[]', 'object'), s('meds[].drug'), s('meds[].dosage'), s('immunizations', 'array'),
    s('immunizations[]', 'object'), s('immunizations[].vaccine'), s('payer_name'), s('subscriber_name')];
  const record = { intake_id: 'S-1154', first_name: 'Ambrose', last_name: 'Fairweather', date_of_birth: '1946-03-02', minor: false,
    gender: 'Male', reasons: ['Chest pain'], meds: [{ drug: 'Amlodipine', dosage: '5 mg' }], immunizations: [{ vaccine: 'Flu' }] };

  it('scores the key, a name written differently, a synonym and the label', () => {
    expect(score({ path: 'dob', label: 'Date of birth', type: 'string' }, s('dob')).how).toBe('exact');
    expect(score({ path: 'intakeId', label: '', type: 'string' }, s('intake_id')).how).toBe('written');
    expect(score({ path: 'dob', label: '', type: 'string' }, s('date_of_birth')).how).toBe('synonym');
    expect(score({ path: 'x1', label: 'Preferred language', type: 'string' }, s('preferred_language')).how).toBe('label');
    expect(score({ path: 'pain_score', label: '', type: 'integer' }, s('pain_score_text')).score).toBeLessThan(SURE);
    expect(score({ path: 'visit_date', label: '', type: 'date' }, s('visit_date', 'boolean')).score).toBeLessThan(score({ path: 'visit_date', label: '', type: 'date' }, s('visit_date', 'date')).score);
    expect(normal('dateOfBirth')).toBe('date_of_birth');
  });

  it('matches what is sure, offers a combined name for a required gap, and leaves an optional gap empty', () => {
    const m = autoMatch(fields, schema, record);
    const at = (p: string) => m.find(x => x.field.path === p)!;
    expect(at('intake_id')).toEqual(expect.objectContaining({ state: 'matched', how: 'exact' }));
    expect(at('dob')).toEqual(expect.objectContaining({ state: 'matched', how: 'synonym', sample: '1946-03-02' }));
    expect(at('sex')).toEqual(expect.objectContaining({ state: 'matched', how: 'synonym', sample: 'Male' }));
    expect(at('patient_name').state).toBe('needs');
    expect(at('patient_name').suggestion).toEqual({ kind: 'combine', parts: [{ path: 'first_name' }, { text: ' ' }, { path: 'last_name' }] });
    expect(at('patient_name').suggestionSample).toBe('Ambrose Fairweather');
    expect(at('guardian_name').state).toBe('empty');
    expect(at('medications')).toEqual(expect.objectContaining({ state: 'matched', how: 'synonym', sample: '1 row' }));
    expect(at('medications').columns.map(c => `${c.column}<-${c.source}`)).toEqual(['name<-drug', 'dose<-dosage']);
    expect(at('immunizations').columns[0]).toEqual(expect.objectContaining({ source: 'vaccine', how: 'exact', sample: 'Flu' }));
  });

  it('sends two columns that fit equally well to a person, with one suggested', () => {
    const f = [{ ...fields.find(x => x.path === 'sex')!, required: true }];
    const m = autoMatch(f, [s('gender'), s('Gender_')], {});
    expect(m[0].state).toBe('needs');
    expect(m[0].why).toContain('Two columns could fit');
    expect(m[0].suggestion?.kind).toBe('column');
  });

  it('keeps a version\'s choices that still fit, and says so when one no longer does', () => {
    const kept = priorFrom({ patient_name: { combine: [{ path: 'first_name' }, { text: ' ' }, { path: 'last_name' }] }, dob: 'gone_column',
      'medications[*].name': 'drug' }, fields);
    const m = autoMatch(fields, schema, record, kept);
    const at = (p: string) => m.find(x => x.field.path === p)!;
    expect(at('patient_name')).toEqual(expect.objectContaining({ state: 'matched', how: 'kept', sample: 'Ambrose Fairweather' }));
    expect(at('dob').state).toBe('matched');
    expect(at('intake_id').how).toBe('kept');
    expect(at('medications').columns[0]).toEqual(expect.objectContaining({ source: 'drug', how: 'kept' }));
    const gone = autoMatch([{ ...fields.find(x => x.path === 'dob')!, required: true }], [s('birth')], {}, { dob: { choice: { kind: 'column', path: 'dob_old' }, from: 'kept' } });
    expect(gone[0].why).toBe('Required. The kept choice (dob_old) is not in this data.');
  });

  it('writes the mapping media-service keeps: paths, combinations, fixed values, blanks and a list\'s columns', () => {
    const m = autoMatch(fields, schema, record);
    const set = (p: string, choice: Choice) => { m.find(x => x.field.path === p)!.choice = choice; };
    set('patient_name', { kind: 'combine', parts: [{ path: 'first_name' }, { text: ' ' }, { path: 'last_name' }] });
    set('guardian_name', { kind: 'blank' });
    set('insurance_payer', { kind: 'fixed', value: 'Self-pay' });
    const body = mappingBody(m);
    expect(body).toEqual(expect.objectContaining({
      patient_name: { combine: [{ path: 'first_name' }, { text: ' ' }, { path: 'last_name' }] }, guardian_name: { blank: true },
      insurance_payer: { value: 'Self-pay' }, dob: 'date_of_birth', medications: 'meds', 'medications[*].name': 'drug', 'medications[*].dose': 'dosage',
    }));
    expect(body).not.toHaveProperty('intake_id');
    expect(body).not.toHaveProperty('immunizations[*].vaccine');
    const round = priorFrom(body, fields);
    expect(round['patient_name'].choice.kind).toBe('combine');
    expect(round['insurance_payer'].choice).toEqual({ kind: 'fixed', value: 'Self-pay' });
    expect(round['medications'].columns).toEqual({ name: 'drug', dose: 'dosage' });
  });

  it('counts how many fields a source fits, and words a choice', () => {
    expect(fitCount(fields, schema, record)).toBe(autoMatch(fields, schema, record).filter(x => x.state === 'matched').length);
    expect(fitCount(fields, [s('unrelated')], {})).toBe(0);
    expect(describeChoice({ kind: 'combine', parts: [{ path: 'a' }, { text: ' ' }, { path: 'b' }] })).toBe('combine a + b');
    expect(combined([{ path: 'a' }, { text: ' ' }, { path: 'missing' }], { a: 'Robin' })).toBe('Robin');
    expect(nameParts('subscriber_name', [s('subscriber_first_name'), s('subscriber_last_name'), s('first_name'), s('last_name')]))
      .toEqual([{ path: 'subscriber_first_name' }, { text: ' ' }, { path: 'subscriber_last_name' }]);
    expect(nameParts('diagnosis', [s('first_name'), s('last_name')])).toBeNull();
  });
});
