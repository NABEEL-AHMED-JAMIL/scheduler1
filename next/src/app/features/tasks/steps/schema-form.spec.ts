import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SchemaForm } from './schema-form';
import { JsonSchema } from './steps.model';

/**
 * MIG-249: a step's settings, drawn from its task's JSON Schema (the Task Registry's configSchema, MIG-231): text,
 * long text, numbers, a switch, a choice, a list, a nested object, a list of objects -- and a raw-JSON box for any
 * setting the schema says in a way a form cannot.
 */
const SCHEMA: JsonSchema = {
  type: 'object',
  required: ['path'],
  properties: {
    path: { type: 'string', title: 'Path', description: 'Inside the connection.' },
    format: { type: 'string', enum: ['csv', 'json'] },
    header: { type: 'boolean' },
    limit: { type: 'integer' },
    columns: { type: 'array', items: { type: 'string' } },
    renames: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } } },
    options: { type: 'object', properties: { quote: { type: 'string' } } },
    anything: { oneOf: [{ type: 'string' }, { type: 'number' }] },
  },
};

function form(value: Record<string, unknown> | null, problems: { field: string; message: string }[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [SchemaForm], providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(SchemaForm);
  fixture.componentRef.setInput('schema', SCHEMA);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('problems', problems);
  const changes: Record<string, unknown>[] = [];
  fixture.componentInstance.valueChange.subscribe(v => changes.push(v));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const box = (id: string) => el.querySelector<HTMLInputElement>(`#cfg-${id}`)!;
  const type = (id: string, text: string) => {
    const input = box(id);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, el, box, type, changes, last: () => changes[changes.length - 1] };
}

describe('SchemaForm', () => {
  it('draws a labelled control for every setting, with its description and whether it is required', () => {
    const { el, box } = form({ path: 'in/a.csv', format: 'json', header: true, limit: 5, columns: ['a', 'b'] });
    const labels = Array.from(el.querySelectorAll('.label')).map(l => l.textContent!.replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(['Path *(required)', 'format', 'header', 'limit', 'columns', 'renames', 'options', 'quote', 'anything']);
    expect(el.textContent).toContain('Inside the connection.');
    expect(box('path').value).toBe('in/a.csv');
    expect((el.querySelector('#cfg-format') as HTMLSelectElement).value).toBe('1');
    expect(box('header').checked).toBe(true);
    expect(box('limit').value).toBe('5');
    expect((el.querySelector('#cfg-columns') as HTMLTextAreaElement).value).toBe('a\nb');
  });

  it('hands back typed values: a number as a number, a list one entry per line, a cleared box as absent', () => {
    const { type, last, fixture, el } = form({ path: 'x', limit: 5 });
    type('limit', '12');
    expect(last()).toEqual({ path: 'x', limit: 12 });
    type('columns', 'a\n b \n\nc');
    expect(last()).toMatchObject({ columns: ['a', 'b', 'c'] });
    type('path', '');
    expect(last()).not.toHaveProperty('path');
    const header = el.querySelector<HTMLInputElement>('#cfg-header')!;
    header.checked = true;
    header.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(last()).toMatchObject({ header: true });
  });

  it('picks a choice by its value, whatever its type', () => {
    const { fixture, el, last } = form({});
    const select = el.querySelector<HTMLSelectElement>('#cfg-format')!;
    select.value = '0';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(last()).toEqual({ format: 'csv' });
  });

  it('edits a nested object in place', () => {
    const { type, last } = form({ options: { quote: '"' } });
    type('options-quote', "'");
    expect(last()).toEqual({ options: { quote: "'" } });
  });

  it('adds, edits and removes the rows of a list of objects', () => {
    const { fixture, el, type, last } = form({ renames: [{ from: 'a', to: 'b' }] });
    (el.querySelector('[aria-label="Add a row to renames"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(last()).toEqual({ renames: [{ from: 'a', to: 'b' }, {}] });
    type('renames-1-from', 'c');
    expect(last()).toEqual({ renames: [{ from: 'a', to: 'b' }, { from: 'c' }] });
    (el.querySelector('[aria-label="Remove row 1 of renames"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(last()).toEqual({ renames: [{ from: 'c' }] });
  });

  it('keeps a setting the form cannot express as raw JSON, and says when that is not JSON', () => {
    const { el, type, last, changes } = form({ anything: 3 });
    expect((el.querySelector('#cfg-anything') as HTMLTextAreaElement).value).toBe('3');
    type('anything', '"three"');
    expect(last()).toEqual({ anything: 'three' });
    const before = changes.length;
    type('anything', '{nope');
    expect(changes.length).toBe(before);
    expect(el.textContent).toContain('Not JSON');
  });

  it('shows the server\'s problem at the setting it names', () => {
    const { el } = form({}, [{ field: 'path', message: 'a path is required' }, { field: 'options.quote', message: 'one character' }]);
    const alerts = Array.from(el.querySelectorAll('[role="alert"]')).map(a => a.textContent!.trim());
    expect(alerts).toEqual(['a path is required', 'one character']);
  });
});
