import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CallApiPreview, callApiPreview, rowObject } from './call-api-preview';

/** MIG-419: the Call API editor shows what the first call sends, built from the sample rows as Core builds it. */
const rows = Array.from({ length: 120 }, (_, i) => ({ patient_id: `P-${i}`, clinic: i % 2 ? 'south' : 'north', visits: i }));

describe('what a Call API step sends', () => {
  it('a row as one object: the chosen columns, renamed, a dot nesting', () => {
    expect(rowObject(rows[1], [{ column: 'patient_id', as: 'patient.id' }, { column: 'clinic', as: 'patient.clinic' }, { column: 'visits' }]))
      .toEqual({ patient: { id: 'P-1', clinic: 'south' }, visits: 1 });
    expect(rowObject(rows[0], [])).toEqual(rows[0]);
  });

  it('each: one call per row, {{row}} formatted as JSON, other placeholders filled from the row, the run\'s as written', () => {
    const p = callApiPreview({ variables: { payload: '{{row}}', who: '{{patient_id}}', key: '{{call_key}}' } }, rows.slice(0, 2))!;
    expect(p.calls).toBe(2);
    expect(p.variables[0]).toEqual({ name: 'payload', json: true, text: JSON.stringify(rows[0], null, 2) });
    expect(p.variables[1]).toEqual({ name: 'who', json: false, text: 'P-0' });
    expect(p.variables[2].text).toBe('{{call_key}}');
  });

  it('batch: the first batch as one array, wrapped by the variable, and how many calls the rows make', () => {
    const p = callApiPreview({ mode: 'batch', batchSize: 50, variables: { body: '{"items": {{rows_json}}}', page: '{{batch}} of {{batches}}' } }, rows)!;
    expect(p.calls).toBe(3);
    expect(JSON.parse(p.variables[0].text).items).toHaveLength(50);
    expect(p.variables[0].json).toBe(true);
    expect(p.variables[1].text).toBe('1 of 3');
  });

  it('a column named row fills {{row}} as before, and no sample rows means no preview', () => {
    const p = callApiPreview({ variables: { n: '{{row}}' } }, [{ row: '7' }])!;
    expect(p.variables[0]).toEqual({ name: 'n', json: false, text: '7' });
    expect(callApiPreview({ variables: { n: '{{row}}' } }, [])).toBeNull();
  });

  it('draws each variable, and asks for sample rows when there are none', () => {
    const fixture = TestBed.createComponent(CallApiPreview);
    fixture.componentRef.setInput('config', { mode: 'batch', batchSize: 2, variables: { body: '{{rows_json}}' } });
    fixture.componentRef.setInput('rows', rows.slice(0, 3));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('2 calls');
    expect(el.querySelector('[data-variable="body"]')?.textContent).toContain('"patient_id": "P-1"');
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();
    expect(el.textContent).toContain('Put sample rows first');
  });
});
