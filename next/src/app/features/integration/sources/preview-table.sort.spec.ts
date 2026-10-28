import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PreviewTable } from './preview-table';
import { SchemaView } from './schema-view';
import { PreviewResult, SchemaField } from './sources.model';

/** Owner 2026-10-27: "add a sort on each table" -- a source's preview rows and its schema fields. */

function preview(result: PreviewResult) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(PreviewTable);
  fixture.componentRef.setInput('result', result);
  fixture.detectChanges();
  return { table: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('PreviewTable -- sorting any column', () => {
  const RESULT: PreviewResult = { ok: true, columns: ['id', 'name'], rows: [
    { id: 10, name: 'Bea' }, { id: 9, name: 'al' }, { id: null, name: 'Cy' },
  ] };

  it('keeps the service\'s order, then sorts a number column as numbers both ways, a null last', () => {
    const { table } = preview(RESULT);
    expect(table.cells().map(r => r[0])).toEqual(['10', '9', 'null']);
    table.sort.toggle('id');
    expect(table.cells().map(r => r[0])).toEqual(['9', '10', 'null']);
    table.sort.toggle('id');
    expect(table.cells().map(r => r[0])).toEqual(['10', '9', 'null']);
  });

  it('sorts text without regard to case, and every column has a sortable heading', () => {
    const { table, el } = preview(RESULT);
    table.sort.toggle('name');
    expect(table.cells().map(r => r[1])).toEqual(['al', 'Bea', 'Cy']);
    expect(el.querySelectorAll('th button.th-sort').length).toBe(2);
  });
});

describe('SchemaView -- sorting the fields', () => {
  it('keeps the schema\'s order, then sorts by path both ways and puts required fields first', () => {
    try { localStorage.clear(); } catch { /* none */ }
    const fields: SchemaField[] = [
      { path: 'patient', type: 'object', nullable: false, required: true },
      { path: 'patient.age', type: 'integer', nullable: true, required: false },
      { path: 'id', type: 'string', nullable: false, required: true },
    ];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(SchemaView);
    fixture.componentRef.setInput('fields', fields);
    const view = fixture.componentInstance;
    expect(view.sortedRows().map(f => f.path)).toEqual(['patient', 'patient.age', 'id']);
    view.sort.toggle('field');
    expect(view.sortedRows().map(f => f.path)).toEqual(['id', 'patient', 'patient.age']);
    view.sort.toggle('field');
    expect(view.sortedRows().map(f => f.path)).toEqual(['patient.age', 'patient', 'id']);
    view.sort.toggle('required');
    expect(view.sortedRows().map(f => f.required)).toEqual([true, true, false]);
  });
});
