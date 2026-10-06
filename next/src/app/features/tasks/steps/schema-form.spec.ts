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

/**
 * MIG-249 on MIG-231's registry: the widget hints (`format`) and the shapes the registry's schemas use -- a column
 * picked from the columns the step before makes, an earlier step, long text for sql/template/multiline, a value that
 * may be text or a number, a map, and the limits a box can say itself.
 */
describe('SchemaForm -- the registry\'s widgets', () => {
  const REGISTRY: JsonSchema = {
    type: 'object', additionalProperties: false, required: ['with'],
    properties: {
      with: { type: 'string', title: 'Join with', format: 'step', minLength: 1 },
      column: { type: 'string', title: 'Column', format: 'column', maxLength: 128 },
      groupBy: { type: 'array', title: 'Group by', items: { type: 'string', format: 'column' } },
      title: { type: 'string', title: 'Title', format: 'template', maxLength: 200 },
      query: { type: 'string', title: 'Query', format: 'sql' },
      value: { type: ['string', 'number', 'boolean', 'null'], title: 'Value' },
      fileName: { type: 'string', title: 'File name', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' },
      limit: { type: 'integer', title: 'Limit', minimum: 1, maximum: 1000 },
      headers: { type: 'object', title: 'Headers', additionalProperties: { type: 'string' } },
      bucket: { type: 'string', title: 'Bucket', format: 'bucket' },
    },
  };

  function widgets(value: Record<string, unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SchemaForm], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(SchemaForm);
    fixture.componentRef.setInput('schema', REGISTRY);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('columns', ['id', 'name']);
    fixture.componentRef.setInput('steps', ['read', 'shape']);
    const changes: Record<string, unknown>[] = [];
    fixture.componentInstance.valueChange.subscribe(v => changes.push(v));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const set = (id: string, text: string, event = 'input') => {
      const box = el.querySelector<HTMLInputElement>(`#cfg-${id}`)!;
      box.value = text;
      box.dispatchEvent(new Event(event));
      fixture.detectChanges();
    };
    return { fixture, el, set, last: () => changes[changes.length - 1] };
  }

  it('offers the earlier steps for a step setting', () => {
    const { el, set, last } = widgets({ with: 'gone' });
    const options = Array.from(el.querySelectorAll<HTMLOptionElement>('#cfg-with option')).map(o => o.textContent!.trim());
    expect(options).toEqual(['Choose…', 'read', 'shape', 'gone (not an earlier step)']);
    set('with', 'read', 'change');
    expect(last()).toMatchObject({ with: 'read' });
  });

  it('suggests the upstream columns for a column, and still takes one typed', () => {
    const { el, set, last } = widgets({});
    const box = el.querySelector<HTMLInputElement>('#cfg-column')!;
    const list = el.querySelector(`#${box.getAttribute('list')}`)!;
    expect(Array.from(list.querySelectorAll('option')).map(o => o.getAttribute('value'))).toEqual(['id', 'name']);
    expect(box.maxLength).toBe(128);
    set('column', 'city');
    expect(last()).toMatchObject({ column: 'city' });
  });

  it('adds an upstream column to a list of columns with a click', () => {
    const { el, fixture, set, last } = widgets({});
    set('groupBy', 'city');
    (el.querySelector('[aria-label="Add column name to Group by"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(last()).toMatchObject({ groupBy: ['city', 'name'] });
    expect(el.querySelector<HTMLTextAreaElement>('#cfg-groupBy')!.value).toBe('city\nname');
  });

  it('gives template, sql and multiline settings a text area', () => {
    const { el } = widgets({});
    expect(el.querySelector('#cfg-title')!.tagName).toBe('TEXTAREA');
    expect(el.querySelector('#cfg-query')!.tagName).toBe('TEXTAREA');
  });

  it('reads a value that may be text, a number or true/false as JSON would', () => {
    const { set, last, el } = widgets({ value: 3 });
    expect(el.querySelector<HTMLInputElement>('#cfg-value')!.value).toBe('3');
    set('value', '42');
    expect(last()).toMatchObject({ value: 42 });
    set('value', 'yes please');
    expect(last()).toMatchObject({ value: 'yes please' });
  });

  it('puts the schema\'s own limits on the box', () => {
    const { el } = widgets({});
    expect(el.querySelector<HTMLInputElement>('#cfg-fileName')!.getAttribute('pattern')).toBe('^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$');
    expect(el.querySelector<HTMLInputElement>('#cfg-limit')!.min).toBe('1');
    expect(el.querySelector<HTMLInputElement>('#cfg-limit')!.max).toBe('1000');
  });

  it('edits a map as rows of name and value, and renames a key in place', () => {
    const { el, fixture, set, last } = widgets({ headers: { Accept: 'text/csv' } });
    expect(el.querySelector<HTMLInputElement>('#cfg-headers-key-0')!.value).toBe('Accept');
    set('headers-key-0', 'Content-Type');
    expect(last()).toMatchObject({ headers: { 'Content-Type': 'text/csv' } });
    (el.querySelector('[aria-label="Add an entry to Headers"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    set('headers-key-1', 'X-Id');
    set('headers-value-1', '7');
    expect(last()).toMatchObject({ headers: { 'Content-Type': 'text/csv', 'X-Id': '7' } });
    (el.querySelector('[aria-label="Remove Content-Type from Headers"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(last()).toMatchObject({ headers: { 'X-Id': '7' } });
  });

  it('draws a picker it does not have yet as a text box', () => {
    const { el } = widgets({ bucket: 'ui-review-s3' });
    expect(el.querySelector<HTMLInputElement>('#cfg-bucket')!.value).toBe('ui-review-s3');
  });
});

/** MIG-245: the AI prompt step names a saved prompt: a choice of the workspace's active prompts, stored as its id. */
describe('SchemaForm -- a prompt setting', () => {
  const PROMPT_SCHEMA: JsonSchema = { type: 'object', required: ['promptId'],
    properties: { promptId: { type: 'integer', format: 'prompt', title: 'Prompt' } } };

  function promptForm(prompts: { id: number; label: string }[], value: Record<string, unknown> | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SchemaForm], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(SchemaForm);
    fixture.componentRef.setInput('schema', PROMPT_SCHEMA);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('prompts', prompts);
    const changes: Record<string, unknown>[] = [];
    fixture.componentInstance.valueChange.subscribe(v => changes.push(v));
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, fixture, changes };
  }

  it('offers the workspace\'s buckets for a bucket setting, and still takes an alias typed by hand (MIG-321)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SchemaForm], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(SchemaForm);
    fixture.componentRef.setInput('schema', { type: 'object', properties: { bucket: { type: 'string', format: 'bucket', title: 'Bucket' } } });
    fixture.componentRef.setInput('value', null);
    fixture.componentRef.setInput('buckets', [{ alias: 'ui-review-s3', label: 'Review bucket' }]);
    const changes: Record<string, unknown>[] = [];
    fixture.componentInstance.valueChange.subscribe(v => changes.push(v));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const box = el.querySelector<HTMLInputElement>('#cfg-bucket')!;
    expect(box.getAttribute('list')).toBe('cfg-bucket-buckets');
    expect(Array.from(el.querySelectorAll('#cfg-bucket-buckets option')).map(o => (o as HTMLOptionElement).value)).toEqual(['ui-review-s3']);
    box.value = 'archive';
    box.dispatchEvent(new Event('input'));
    expect(changes[changes.length - 1]).toEqual({ bucket: 'archive' });
  });

  it('offers the prompts by name and stores the chosen id as a number', () => {
    const { el, fixture, changes } = promptForm([{ id: 41, label: 'Wound assessment' }, { id: 42, label: 'Summary' }], { promptId: 42 });
    const select = el.querySelector<HTMLSelectElement>('#cfg-promptId')!;
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map(o => o.textContent!.trim())).toEqual(['Choose a prompt…', 'Wound assessment', 'Summary']);
    expect(select.value).toBe('42');
    select.value = '41';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(changes[changes.length - 1]).toEqual({ promptId: 41 });
  });

  it('keeps a prompt that is no longer listed, by its id', () => {
    const { el } = promptForm([{ id: 41, label: 'Wound assessment' }], { promptId: 99 });
    const select = el.querySelector<HTMLSelectElement>('#cfg-promptId')!;
    expect(Array.from(select.options).map(o => o.textContent!.trim())).toContain('Prompt 99 (not an active prompt here)');
    expect(select.value).toBe('99');
  });
});
