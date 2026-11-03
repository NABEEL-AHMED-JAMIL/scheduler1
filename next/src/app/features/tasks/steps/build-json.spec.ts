import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { StepsApi } from './steps.service';
import { buildJsonColumns, cleanKey, keyClash, shapeFromExample, topKeys } from './build-json.model';
import { BuildJsonEditor } from './build-json-editor';
import { BuildJsonPreview, parseSampleRows, previewDocuments } from './build-json-preview';
import { callApiPreview } from './call-api-preview';
import { stepSummary } from '../../../shared/flow-graph/flow-adapters';
import { outputColumns } from './steps.model';

/** MIG-451: Build JSON's shape editor, its live preview and Call API sending its document as the body (synthetic rows). */
const COLUMNS = ['patient_id', 'patient_name', 'code', 'text'];

describe('Build JSON shape', () => {
  it('draws a shape from an example: columns by name, nested objects as dots, a list of objects, fixed values', () => {
    const keys = shapeFromExample({ patient: { id: 'P-1', name: 'x' }, findings: [{ code: 'L89.1', text: 'x' }], source: 'etl-console', n: 2 }, COLUMNS);
    expect(keys).toEqual([
      { key: 'patient.id', column: 'patient_id' },
      { key: 'patient.name', column: 'patient_name' },
      { key: 'findings', from: 'rows', fields: [{ key: 'code', column: 'code' }, { key: 'text', column: 'text' }] },
      { key: 'source', from: 'value', value: 'etl-console' },
      { key: 'n', from: 'value', value: 2 },
    ]);
    expect(() => shapeFromExample([1, 2], COLUMNS)).toThrow(/one JSON object/);
  });

  it('says where keys clash as Core does, and writes a key with only what its From uses', () => {
    const keys = [{ key: 'patient' }, { key: 'patient.id' }, { key: 'patient' }, { key: 'a.b' }, { key: 'a' }];
    expect(keyClash(keys, 1)).toBe("'patient' is a value, so 'patient.id' cannot nest in it.");
    expect(keyClash(keys, 2)).toBe("'patient' is named twice.");
    expect(keyClash(keys, 4)).toBe("'a' already holds 'a.b', so it cannot be a value too.");
    expect(cleanKey({ key: ' tags ', from: 'list', column: 'code', type: 'auto', distinct: true, value: 1 }))
      .toEqual({ key: 'tags', from: 'list', column: 'code', distinct: true });
    expect(topKeys([{ key: 'patient.id' }, { key: 'patient.name' }, { key: 'source' }])).toEqual(['patient', 'source']);
  });

  it('knows the columns its rows have, and the node says what it makes', () => {
    const fields = [{ key: 'patient.id', column: 'patient_id' }, { key: 'findings', from: 'rows', fields: [] }];
    expect(buildJsonColumns({ fields }, () => COLUMNS)).toEqual([...COLUMNS, 'json']);
    expect(buildJsonColumns({ fields, mode: 'group', groupBy: ['patient_id'], column: 'doc' }, () => null)).toEqual(['patient_id', 'doc']);
    expect(buildJsonColumns({ fields, output: 'rows' }, () => null)).toEqual(['patient', 'findings']);
    const definition = { version: 1, steps: [{ key: 'read', task: 'sample', config: { rows: [{ patient_id: 'P-1', code: 'x' }] } },
      { key: 'shape', task: 'build_json', config: { mode: 'all', fields } }] };
    expect(outputColumns(definition as never, 1)).toEqual(['json']);
    expect(stepSummary({ key: 'shape', task: 'build_json', config: { mode: 'group', fields } } as never))
      .toEqual([{ label: 'Makes', value: 'One per group' }, { label: 'Keys', value: 'patient, findings' }]);
  });

  it('Call API sends a JSON column as the body as it is: {{body}} by itself, {{row}} too, a list in a batch', () => {
    const doc = { patient: { id: 'P-1' }, findings: [{ code: 'L89.1' }] };
    const rows = [{ patient_id: 'P-1', json: doc }, { patient_id: 'P-2', json: JSON.stringify(doc) }];
    const each = callApiPreview({ bodyColumn: 'json', variables: { payload: '{{row}}' } }, rows)!;
    expect(JSON.parse(each.variables[0].text)).toEqual(doc);
    expect(each.variables[1]).toMatchObject({ name: 'body', json: true });
    const batch = callApiPreview({ bodyColumn: 'json', mode: 'batch' }, rows)!;
    expect(JSON.parse(batch.variables[0].text)).toEqual([doc, doc]);
  });
});

describe('Build JSON editor', () => {
  const make = (keys: unknown[]) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(BuildJsonEditor);
    fixture.componentRef.setInput('keys', keys);
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.detectChanges();
    const emitted: unknown[] = [];
    fixture.componentInstance.changed.subscribe(k => emitted.push(k));
    return { fixture, el: fixture.nativeElement as HTMLElement, emitted };
  };

  it('adds a key and a list of objects, shows a clash on its key, and starts from a pasted example', () => {
    const { fixture, el, emitted } = make([{ key: 'patient' }, { key: 'patient.id', column: 'patient_id' }]);
    expect(el.textContent).toContain("'patient' is a value, so 'patient.id' cannot nest in it.");
    el.querySelector<HTMLButtonElement>('[data-test="bj-add-rows"]')!.click();
    expect(emitted.pop()).toEqual([{ key: 'patient', column: '' }, { key: 'patient.id', column: 'patient_id' },
      { key: '', from: 'rows', fields: [{ key: '', column: '' }] }]);
    el.querySelector<HTMLButtonElement>('[data-test="bj-example-toggle"]')!.click();
    fixture.detectChanges();
    const area = el.querySelector<HTMLTextAreaElement>('#bjExample')!;
    area.value = '{"patient": {"id": "P-1"}, "codes": ["x"]}';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-test="bj-example-use"]')!.click();
    expect(emitted.pop()).toEqual([{ key: 'patient.id', column: 'patient_id' }, { key: 'codes', from: 'list', column: 'code' }]);
  });
});

describe('Build JSON preview', () => {
  afterEach(() => vi.useRealTimers());

  it('reads sample rows, and the documents from the column or the rows', () => {
    expect(parseSampleRows('[{"a": 1}]')).toEqual({ rows: [{ a: 1 }] });
    expect(parseSampleRows('{"a": 1}')).toHaveProperty('error');
    const result = { rows: [{ id: 1, json: { a: 1 } }], rowCount: 1 } as never;
    expect(previewDocuments(result, {})).toEqual([{ a: 1 }]);
    expect(previewDocuments(result, { output: 'rows' })).toEqual([{ id: 1, json: { a: 1 } }]);
  });

  it('runs the shape on the sample rows half a second after it changes, and shows the documents and what Core says', async () => {
    vi.useFakeTimers();
    const preview = vi.fn(() => of({ status: 'SUCCESS' as const, message: '', data: { task: 'build_json', rowsIn: 2, rowCount: 1, columns: ['json'],
      shown: 1, rows: [{ json: { patient: { id: 'P-1' } } }], masked: [], log: [], warnings: ['No value for source in 1 document.'] } }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: StepsApi, useValue: { preview } }] });
    const fixture = TestBed.createComponent(BuildJsonPreview);
    fixture.componentRef.setInput('config', { mode: 'all', fields: [{ key: 'patient.id', column: 'patient_id' }] });
    fixture.componentRef.setInput('rows', [{ patient_id: 'P-1' }, { patient_id: 'P-2' }]);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(600);
    fixture.detectChanges();
    expect(preview).toHaveBeenCalledWith('build_json', expect.objectContaining({ mode: 'all' }), [{ patient_id: 'P-1' }, { patient_id: 'P-2' }]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="bj-document"]')!.textContent).toContain('"id": "P-1"');
    expect(el.querySelector('[data-test="bj-preview-warning"]')!.textContent).toContain('No value for source');
    expect(el.querySelector('[data-test="bj-preview-status"]')!.textContent).toContain('1 document from 2 sample rows');
  });
});
