import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SchemaForm } from './schema-form';
import { JsonSchema, fieldsOf, schemaSupported } from './steps.model';

/**
 * UX review 2026-10-12 (MIG-364 leftover): read_documents' "statuses" -- a list of fixed choices -- was a raw JSON box. It is
 * a checkbox per choice now, in the schema's order; an empty list leaves the setting out (the task's default, Approved).
 */
const READ_DOCUMENTS: JsonSchema = {
  type: 'object',
  properties: {
    documentTypeId: { type: 'integer', format: 'document-type', title: 'Document type' },
    statuses: { type: 'array', title: 'Documents', items: { type: 'string', enum: ['Approved', 'Review', 'Rejected'] }, minItems: 1, maxItems: 3 },
  },
};

function form(value: Record<string, unknown> | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [SchemaForm], providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(SchemaForm);
  fixture.componentRef.setInput('schema', READ_DOCUMENTS);
  fixture.componentRef.setInput('value', value);
  const changes: Record<string, unknown>[] = [];
  fixture.componentInstance.valueChange.subscribe(v => changes.push(v));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const tick = (index: number) => {
    const box = el.querySelector<HTMLInputElement>(`#cfg-statuses-${index}`)!;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  return { el, tick, changes, last: () => changes[changes.length - 1] };
}

describe('SchemaForm: a list of fixed choices', () => {
  it('is a multi-select field, so the form draws the whole schema', () => {
    const statuses = fieldsOf(READ_DOCUMENTS).find(f => f.name === 'statuses')!;
    expect(statuses.kind).toBe('multi');
    expect(statuses.options).toEqual(['Approved', 'Review', 'Rejected']);
    expect(schemaSupported(READ_DOCUMENTS)).toBe(true);
  });

  it('draws a checkbox per choice, ticked from the value, and no JSON box', () => {
    const { el } = form({ statuses: ['Rejected', 'Approved'] });
    const boxes = Array.from(el.querySelectorAll<HTMLInputElement>('[data-multi="statuses"] input[type="checkbox"]'));
    expect(boxes.map(b => b.parentElement!.textContent!.trim())).toEqual(['Approved', 'Review', 'Rejected']);
    expect(boxes.map(b => b.checked)).toEqual([true, false, true]);
    expect(el.textContent).not.toContain('As JSON');
  });

  it('keeps the schema order and leaves the setting out when nothing is ticked', () => {
    const { tick, last } = form({ statuses: ['Rejected'] });
    tick(0);
    expect(last()).toEqual({ statuses: ['Approved', 'Rejected'] });
    tick(0);
    tick(2);
    expect(last()).toEqual({});
  });
});
