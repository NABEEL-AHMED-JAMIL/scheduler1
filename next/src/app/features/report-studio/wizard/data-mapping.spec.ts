import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportStudioApi } from '../report-studio.api';
import { AuthService } from '../../../core/auth/auth.service';
import { GeneratedService } from '../../documents/generated/generated.service';
import { StepsApi } from '../../tasks/steps/steps.service';
import { InspectResult, ReportVersionRow, SchemaField, TemplateDefinition } from '../report-studio.model';
import { DataMapping, groupsOf, rootFor, splitRoot } from './data-mapping';
import { DataSources, latestCompleted, readableOutputs } from './data-sources';
import { FieldPicker } from './field-picker';
import { autoMatch } from './auto-match';
import { templateFields } from './template-fields';
import { eachBase } from './new-report';
import { RunOutput } from '../../jobs/run-steps/run-steps.model';

/**
 * Data and mapping, redesigned (owner 2026-10-27): Generate again starts from the version's own data and mapping (never
 * blank); a new report picks its data first, a pipeline by how well its newest run fits; every field is matched and only
 * what needs a person is put first; one field's source is a column, columns combined or a fixed value; the rows of a list
 * are read one, one per report, or all in one.
 */
const def = (components: unknown[], fields: unknown[]): TemplateDefinition => ({ schemaVersion: '1.0', template: { name: 'Intake',
  datasets: [{ id: 'primary', rootPath: '$' }], dataContract: { fields }, components } }) as TemplateDefinition;

const INTAKE = def([
  { id: 'hdr', type: 'section', role: 'header', children: [{ id: 'hdr-t', type: 'text', content: 'Intake {{primary.intake_id}}' }] },
  { id: 'title', type: 'heading', level: 1, content: 'Intake · {{primary.patient_name}}' },
  { id: 'dob', type: 'labelValue', label: 'Date of birth', binding: 'primary.dob' },
  { id: 'meds', type: 'section', children: [{ id: 'mh', type: 'heading', level: 2, content: 'Medicines' },
    { id: 'mt', type: 'table', dataset: 'primary.medications', columns: [{ id: 'a', field: 'name', label: 'Medicine' }] }] },
], [{ path: 'intake_id', type: 'string', required: true }, { path: 'patient_name', type: 'string', required: true },
  { path: 'dob', type: 'string', required: false }, { path: 'medications', type: 'array', required: false }]);

const s = (path: string, type = 'string'): SchemaField => ({ path, type, nullable: false });
const SCHEMA = [s('intake_id'), s('first_name'), s('last_name'), s('dob', 'date'), s('medications', 'array'), s('medications[]', 'object'), s('medications[].name')];
const ROW = { intake_id: 'S-1154', first_name: 'Ambrose', last_name: 'Fairweather', dob: '1946-03-02', medications: [{ name: 'Amlodipine' }] };
const inspected = (rows: unknown[], schema = SCHEMA): InspectResult => ({ records: rows.length, shape: 'list', schema, warnings: [], sample: rows,
  sampleRecords: rows.length, inspected: rows.length, tree: { path: '$', type: 'array' }, label: 'Patient intake · run #2952', connector: 'RUN_OUTPUT',
  format: 'JSON', bytes: 100, sha256: 'x', rootPath: '$' });

const V2 = { versionId: 'v2', reportId: 'R', version: 2, templateVersion: 8, snapshotId: 'SNAP-2', jobId: 'J', outputs: [], diagnostics: [],
  snapshot: { snapshotId: 'SNAP-2', connector: 'RUN_OUTPUT', mode: 'FULL', format: 'JSON', pipelineRunId: 2952, records: 1, bytes: 1, sha256: 'x',
    label: 'Patient intake · run #2952' },
  config: { rootPath: '$[0]', mapping: { patient_name: { combine: [{ path: 'first_name' }, { text: ' ' }, { path: 'last_name' }] } } } } as unknown as ReportVersionRow;

function setup(opts: { version?: ReportVersionRow | null; rows?: unknown[]; definition?: TemplateDefinition; schema?: SchemaField[] } = {}) {
  TestBed.resetTestingModule();
  const api = {
    inspect: vi.fn(() => of(inspected(opts.rows ?? [ROW], opts.schema))),
    canvas: vi.fn(() => of({ html: '<html><body><div class="rs-sheet"><div class="rs-body"><p class="rs-id--dob">x</p></div></div></body></html>', records: 1, problems: [], summary: { errors: 0, warnings: 0, valid: true } })),
    templateThumbnail: vi.fn(() => of({ body: null, headers: { get: () => '' } })),
    sources: vi.fn(() => of([])),
  };
  const generated = {
    schedules: vi.fn(() => of([{ jobId: 1476, jobName: 'Patient intake · summary report', lastJobRun: '2026-10-27T14:21:29' }])),
    runs: vi.fn(() => of([{ jobQueueId: 3100, jobStatus: 'Failed' }, { jobQueueId: 3096, jobStatus: 'Completed', startTime: '2026-10-27T14:21:29' }])),
    runOutputs: vi.fn(() => of([{ runOutputId: 1, kind: 'file', name: 'report.json', format: 'json', runDatasetId: 77, rowCount: 1 }])),
  };
  TestBed.configureTestingModule({
    imports: [DataMapping],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ReportStudioApi, useValue: api }, { provide: GeneratedService, useValue: generated },
      { provide: StepsApi, useValue: { timeline: vi.fn(() => of({ status: 'SUCCESS', message: '', data: null })) } },
      { provide: AuthService, useValue: { canOpen: () => true, isPlatformAdmin: () => false } }],
  });
  const fixture = TestBed.createComponent(DataMapping);
  fixture.componentRef.setInput('definition', opts.definition ?? INTAKE);
  fixture.componentRef.setInput('templateId', 'T');
  fixture.componentRef.setInput('version', opts.version === undefined ? V2 : opts.version);
  fixture.componentRef.setInput('manyReports', !(opts.version === undefined ? V2 : opts.version));
  fixture.detectChanges();
  fixture.detectChanges();
  return { fixture, m: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, api, generated };
}

describe('Data and mapping: Generate again', () => {
  it('starts from the version\'s own frozen data and its kept mapping, nothing blank', () => {
    const { m, el, api } = setup();
    expect(m.source()).toEqual({ connector: 'SNAPSHOT', snapshotId: 'SNAP-2' });
    expect(api.inspect).toHaveBeenCalledWith({ connector: 'SNAPSHOT', snapshotId: 'SNAP-2' }, '$');
    expect(m.rootPath()).toBe('$[0]');
    const at = (p: string) => m.matches().find(x => x.field.path === p)!;
    expect(at('patient_name')).toEqual(expect.objectContaining({ state: 'matched', how: 'kept', sample: 'Ambrose Fairweather' }));
    expect(at('intake_id').how).toBe('kept');
    expect(m.needs()).toEqual([]);
    expect(m.changed()).toEqual([]);
    expect(m.mapping()).toEqual({ patient_name: { combine: [{ path: 'first_name' }, { text: ' ' }, { path: 'last_name' }] } });
    expect(m.blocking()).toBe(0);
    expect(el.textContent).toContain('Same data as v2');
    expect(el.textContent).toContain('Frozen with v2 · run #2952 · 1 row');
    expect(el.textContent).toContain('Matched 4 of 4');
    expect(el.textContent).toContain('Changed from v2 · 0');
    expect(el.textContent).toContain('Kept from v2');
    expect(el.textContent).not.toContain('Pick the data first');
  });

  it('puts a required gap in "Needs you" with a suggestion, and Use it settles it', () => {
    const { fixture, m, el } = setup({ version: { ...V2, config: { rootPath: '$[0]' } } as unknown as ReportVersionRow });
    expect(m.needs().map(n => n.field.path)).toEqual(['patient_name']);
    expect(m.blocking()).toBe(1);
    fixture.detectChanges();
    const needs = el.querySelector('[data-needs]')!;
    expect(needs.textContent).toContain('Patient name');
    expect(needs.textContent).toContain('combine first_name + last_name');
    expect(needs.textContent).toContain('Ambrose Fairweather');
    expect(el.textContent).toContain('1 required field needs a source');
    expect((el.querySelector('.rsdm-foot .btn-primary') as HTMLButtonElement).disabled).toBe(true);
    m.useSuggestion(m.needs()[0]);
    fixture.detectChanges();
    expect(m.needs()).toEqual([]);
    expect(m.mapping()['patient_name']).toEqual({ combine: [{ path: 'first_name' }, { text: ' ' }, { path: 'last_name' }] });
    expect(m.changed().map(c => c.field.path)).toEqual(['patient_name']);
    expect((el.querySelector('.rsdm-foot .btn-primary') as HTMLButtonElement).disabled).toBe(false);
  });

  it('opens a field\'s picker under its row and keeps the person\'s choice when the data changes, if it still fits', () => {
    const { fixture, m, el } = setup();
    m.open('dob');
    fixture.detectChanges();
    expect(el.querySelector('app-rs-field-picker')).not.toBeNull();
    m.chosen('dob', { choice: { kind: 'fixed', value: 'Not recorded' }, columns: {} });
    fixture.detectChanges();
    expect(m.editing()).toBeNull();
    expect(m.mapping()['dob']).toEqual({ value: 'Not recorded' });
    m.inspect.set(inspected([{ ...ROW, first_name: 'Robin' }]));
    fixture.detectChanges();
    expect(m.mapping()['dob']).toEqual({ value: 'Not recorded' });
    expect(m.matches().find(x => x.field.path === 'patient_name')!.sample).toBe('Robin Fairweather');
  });

  it('groups the fields by the template\'s own parts, and filters and searches them', () => {
    const { fixture, m, el } = setup();
    expect(m.groups().map(g => g.name)).toEqual(['Page header', 'Top of the report', 'Medicines']);
    expect(el.querySelectorAll('details.rsdm-group').length).toBe(3);
    m.query.set('birth');
    fixture.detectChanges();
    expect(m.shownMatches().map(x => x.field.path)).toEqual(['dob']);
    m.query.set('');
    m.filter.set('needs');
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing needs you');
  });
});

describe('Data and mapping: a new report', () => {
  it('reads data of several rows one at a time, one report per row, or all in one', () => {
    const rows = [ROW, { ...ROW, intake_id: 'S-1155' }, { ...ROW, intake_id: 'S-1156' }];
    const { fixture, m, el } = setup({ version: null, rows });
    m.source.set({ connector: 'INLINE_JSON', text: '[]', format: 'JSON' });
    fixture.detectChanges();
    expect(m.manyRows()).toBe(true);
    expect(m.rootPath()).toBe('$[0]');
    expect(el.textContent).toContain('One report per row (3)');
    m.rowMode.set('each');
    fixture.detectChanges();
    expect(m.eachRow()).toBe(3);
    m.setRow('2');
    fixture.detectChanges();
    expect(m.rootPath()).toBe('$[2]');
    expect(m.matches().find(x => x.field.path === 'intake_id')!.sample).toBe('S-1156');
    expect(m.eachRow()).toBe(0);
    m.rowMode.set('all');
    fixture.detectChanges();
    expect(m.rootPath()).toBe('$');
  });

  it('reads all the rows for a template that lists the data\'s own rows', () => {
    const rowsDef = def([{ id: 't', type: 'table', dataset: 'primary', columns: [{ id: 'f', field: 'factor', label: 'Department' }] }],
      [{ path: 'factor', type: 'string', required: true }]);
    const { fixture, m, el } = setup({ version: null, definition: rowsDef, rows: [{ factor: 'A' }, { factor: 'B' }], schema: [s('factor')] });
    m.source.set({ connector: 'INLINE_JSON', text: '[]', format: 'JSON' });
    fixture.detectChanges();
    expect(m.manyRows()).toBe(false);
    expect(m.rootPath()).toBe('$');
    expect(el.textContent).toContain('all 2 go in one report');
    expect(m.matched()).toBe(1);
  });

  it('reads one record (an object, a bundle of files) as it is', () => {
    const { fixture, m } = setup({ version: null });
    m.inspect.set({ ...inspected([ROW]), shape: 'object', records: 1, sample: [ROW] });
    fixture.detectChanges();
    expect(m.manyRows()).toBe(false);
    expect(m.rootPath()).toBe('$');
    expect(m.matches().find(x => x.field.path === 'intake_id')!.sample).toBe('S-1154');
  });

  it('shows no fields until the data is picked, and says so in the footer', () => {
    const { fixture, m, el } = setup({ version: null });
    m.source.set(null);
    fixture.detectChanges();
    expect(m.inspect()).toBeNull();
    expect(el.querySelector('.rsdm-two')).toBeNull();
    expect(el.textContent).toContain('Pick the data first: the fields are matched to it.');
  });
});

describe('Data and mapping\'s pieces', () => {
  it('reads a version\'s root path as its data\'s start and its row', () => {
    expect(splitRoot('$[0]')).toEqual({ base: '$', row: 0 });
    expect(splitRoot('$.report[3]')).toEqual({ base: '$.report', row: 3 });
    expect(splitRoot('$.summary')).toEqual({ base: '$.summary', row: null });
    expect(splitRoot(null)).toEqual({ base: '$', row: null });
    expect(rootFor('$', 'list', false, 'first', 4)).toBe('$[0]');
    expect(rootFor('$', 'list', false, 'row', 4)).toBe('$[4]');
    expect(rootFor('$', 'list', true, 'row', 4)).toBe('$');
    expect(rootFor('$', 'object', false, 'first', 0)).toBe('$');
    expect(eachBase('$.x[0]')).toBe('$.x');
  });

  it('counts each group\'s matched, needing and empty fields', () => {
    const fields = templateFields(INTAKE);
    const g = groupsOf(autoMatch(fields.fields, [s('intake_id')], {}), fields.sections);
    expect(g.map(x => `${x.name}:${x.matched}/${x.needs}/${x.empty}`)).toEqual(['Page header:1/0/0', 'Top of the report:0/1/1', 'Medicines:0/0/1']);
  });

  it('picks the newest completed run, and the rows a report step reads', () => {
    expect(latestCompleted([{ jobQueueId: 3, jobStatus: 'Failed' }, { jobQueueId: 2, jobStatus: 'Completed' }])?.jobQueueId).toBe(2);
    expect(latestCompleted([{ jobQueueId: 3, jobStatus: 'Running' }])?.jobQueueId).toBe(3);
    expect(latestCompleted([])).toBeNull();
    const files: RunOutput[] = [{ runOutputId: 1, kind: 'file', name: 'a.json', format: 'json', runDatasetId: 5 },
      { runOutputId: 2, kind: 'file', name: 'b.pdf', format: 'pdf', runDatasetId: 6 }];
    expect(readableOutputs(files, null, null).outputs.map(o => o.name)).toEqual(['a.json']);
    expect(readableOutputs(files, null, null).pick?.runDatasetId).toBe(5);
    const timeline = { steps: [{ key: 'assess', index: 0, datasets: [{ runDatasetId: 9, name: 'rows', rowCount: 1 }] }, { key: 'report', index: 1, datasets: [] }] };
    const r = readableOutputs([], timeline as never, 'report');
    expect(r.pick?.runDatasetId).toBe(9);
  });
});

describe('Data sources', () => {
  it('offers a new report a run, a bucket file, an upload, pasted JSON and the template\'s samples', () => {
    const { m, fixture } = setup({ version: null });
    const ds = fixture.debugElement.query(x => x.componentInstance instanceof DataSources).componentInstance as DataSources;
    expect(ds.cards().map(c => c.name)).toEqual(['A pipeline run', 'A file in the bucket', 'Upload a file', 'Paste JSON', 'A test sample']);
    expect(ds.cards().find(c => c.id === 'sample')!.disabled).toBe(true);
    ds.pick('paste');
    ds.text.set('{"intake_id": "S-1"}');
    fixture.detectChanges();
    expect(m.source()).toEqual({ connector: 'INLINE_JSON', text: '{"intake_id": "S-1"}', format: 'JSON' });
    ds.text.set('{"intake_id": ');
    fixture.detectChanges();
    expect(m.source()).toBeNull();
  });

  it('picks a pipeline\'s newest completed run and its data, and says how well it fits', () => {
    const { fixture, m, generated } = setup({ version: null });
    const ds = fixture.debugElement.query(x => x.componentInstance instanceof DataSources).componentInstance as DataSources;
    ds.pick('run');
    fixture.detectChanges();
    ds.pickJob('1476');
    fixture.detectChanges();
    expect(generated.runs).toHaveBeenCalledWith(1476, 10);
    expect(ds.runId()).toBe('3096');
    expect(m.source()).toEqual({ connector: 'RUN_OUTPUT', jobQueueId: 3096, runDatasetId: 77 });
    expect(ds.fits()[1476]).toEqual(expect.objectContaining({ state: 'read', runId: 3096, rows: 1 }));
    const opt = ds.pipelineOptions()[0];
    expect(opt.badge).toMatch(/^Fits \d+ of 4$/);
    expect(opt.description).toContain('Last run #3096');
  });

  it('lists the pipelines that fit best first, after the report\'s own', () => {
    const { fixture } = setup({ version: null });
    const ds = fixture.debugElement.query(x => x.componentInstance instanceof DataSources).componentInstance as DataSources;
    (ds as unknown as { schedules: { set: (v: unknown) => void } }).schedules.set([
      { jobId: 1, jobName: 'Newest, unrelated', lastJobRun: '2026-10-27T15:00:00' },
      { jobId: 2, jobName: 'Older, fits', lastJobRun: '2026-10-20T10:00:00' },
      { jobId: 3, jobName: 'Fits some', lastJobRun: '2026-10-21T10:00:00' }]);
    ds.fits.set({ 1: { state: 'read', fit: 0, rows: 1, columns: 2, runId: 9 }, 2: { state: 'read', fit: 4, rows: 1, columns: 9, runId: 8 },
      3: { state: 'read', fit: 2, rows: 1, columns: 5, runId: 7 } });
    expect(ds.pipelineOptions().map(o => o.label)).toEqual(['Older, fits', 'Fits some', 'Newest, unrelated']);
    expect(ds.pipelineOptions()[0]).toEqual(expect.objectContaining({ badge: 'Fits 4 of 4', badgeTone: 'ok' }));
  });

  it('on Generate again offers the same data, a newer run, a file and pasted JSON', () => {
    const { fixture } = setup();
    const ds = fixture.debugElement.query(x => x.componentInstance instanceof DataSources).componentInstance as DataSources;
    expect(ds.cards().map(c => c.name)).toEqual(['Same data as v2', 'A newer run', 'A file', 'Paste JSON']);
    expect(ds.card()).toBe('same');
  });
});

describe('The field picker', () => {
  function picker(path: string, rows: unknown[] = [ROW]) {
    const fields = templateFields(INTAKE).fields;
    const match = autoMatch(fields, SCHEMA, rows[0]).find(x => x.field.path === path)!;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [FieldPicker] });
    const fixture = TestBed.createComponent(FieldPicker);
    fixture.componentRef.setInput('match', match);
    fixture.componentRef.setInput('schema', SCHEMA);
    fixture.componentRef.setInput('record', rows[0]);
    fixture.detectChanges();
    return { fixture, p: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('offers a column, columns combined or a fixed value, and starts on the suggestion', () => {
    const { p, el } = picker('patient_name');
    expect(p.tabs().map(t => t.label)).toEqual(['A column', 'Combine columns', 'A fixed value']);
    expect(p.tab()).toBe('combine');
    expect(p.combinedText()).toBe('Ambrose Fairweather');
    expect(el.textContent).toContain('Result on the first row:');
    expect(el.textContent).toContain("Required: it can't be left blank.");
    expect(el.textContent).not.toContain('Leave it blank');
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-label')).toBe('Choose a source for Patient name');
  });

  it('combines the columns in order, with text between, and answers the choice', () => {
    const { p } = picker('patient_name');
    const got: unknown[] = [];
    p.chosen.subscribe(v => got.push(v));
    p.parts.set([]);
    p.addColumn('last_name');
    p.text.set(', ');
    p.addText();
    p.addColumn('first_name');
    expect(p.combinedText()).toBe('Fairweather, Ambrose');
    p.use();
    expect(got).toEqual([{ choice: { kind: 'combine', parts: [{ path: 'last_name' }, { text: ', ' }, { path: 'first_name' }] }, columns: {} }]);
  });

  it('lets an optional field be left blank, and a list pick its list and columns', () => {
    const dob = picker('dob');
    const got: unknown[] = [];
    dob.p.chosen.subscribe(v => got.push(v));
    expect(dob.el.textContent).toContain('Leave it blank');
    dob.p.blank();
    expect(got).toEqual([{ choice: { kind: 'blank' }, columns: {} }]);
    const meds = picker('medications');
    expect(meds.p.tabs().map(t => t.label)).toEqual(['A list']);
    expect(meds.p.list()).toBe('medications');
    expect(meds.p.listColumns().map(c => `${c.column}<-${c.source}`)).toEqual(['name<-name']);
    const cancelled = vi.fn();
    meds.p.cancelled.subscribe(cancelled);
    meds.p.onEscape(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancelled).toHaveBeenCalled();
  });

  it('lists the columns with their type, the first row\'s value and how they match', () => {
    const { p } = picker('dob');
    const dob = p.columnOptions().find(o => o.value === 'dob')!;
    expect(dob).toEqual(expect.objectContaining({ description: 'date', sample: '1946-03-02', badge: 'Same name', mono: true }));
  });
});
