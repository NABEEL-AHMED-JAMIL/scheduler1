import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormRenderer } from './form-renderer';
import {
  FIELD_TYPES, FormDraft, FormField, answerProblems, answerText, answersForSubmit, definitionProblems, draftForSave, holds, sectionGroups,
  selectionText, visibleFields,
} from './forms.model';
import { decisionFields, toJson } from '../workflows/designer.model';

/**
 * 2026-10-26 (patient intake, owner): a form's fields may be grouped under section titles, and a "checkboxes" field ticks
 * every option that applies -- the same rules as Core's FormFields. And a workflow approval may keep its decision (saveAs).
 */
const ROS: FormField = { key: 'ros', label: 'Do you have any of these now?', type: 'checkboxes', required: false,
  options: ['Fever', 'Cough', 'Rash'], section: 'Review of systems' };
const FIELDS: FormField[] = [
  { key: 'first_name', label: 'First name', type: 'text', required: true, section: 'Patient' },
  { key: 'dob', label: 'Date of birth', type: 'date', required: true, section: 'Patient' },
  { key: 'payer', label: 'Insurance company', type: 'text', required: false, section: 'Insurance' },
  ROS,
  { key: 'fever_days', label: 'Days of fever', type: 'number', required: false, section: 'Review of systems',
    showWhen: { field: 'ros', op: 'eq', value: 'Fever' } },
  { key: 'notes', label: 'Notes', type: 'longText', required: false },
];

function render(fields: FormField[], answers: Record<string, unknown> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(FormRenderer);
  fixture.componentRef.setInput('fields', fields);
  fixture.componentRef.setInput('answers', answers);
  fixture.componentRef.setInput('idPrefix', 'fill');
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function draft(fields: FormField[]): FormDraft {
  return { name: 'Intake', description: '', status: 'Draft', jobId: null, fields };
}

describe('Forms -- sections', () => {
  it('groups consecutive fields of a section, in the form\'s order, never reordering', () => {
    const groups = sectionGroups([...FIELDS, { key: 'again', label: 'Again', type: 'text', required: false, section: 'Patient' }]);
    expect(groups.map(g => [g.section, g.fields.map(f => f.key)])).toEqual([
      ['Patient', ['first_name', 'dob']], ['Insurance', ['payer']], ['Review of systems', ['ros', 'fever_days']], [null, ['notes']],
      ['Patient', ['again']]]);
  });

  it('draws each section under its heading, the heading naming the group, and a field with none ungrouped', () => {
    const { el } = render(FIELDS);
    const sections = Array.from(el.querySelectorAll('section.form-section'));
    expect(sections.map(s => s.getAttribute('data-section'))).toEqual(['Patient', 'Insurance', 'Review of systems']);
    const heading = sections[0].querySelector('h3')!;
    expect(heading.textContent?.trim()).toBe('Patient');
    expect(sections[0].getAttribute('aria-labelledby')).toBe(heading.id);
    expect(sections[0].querySelectorAll('[data-field], app-date-field').length).toBeGreaterThan(0);
    expect(el.querySelector('section.form-section #fill-notes')).toBeNull();
    expect(el.querySelector('#fill-notes')).not.toBeNull();
    expect(el.querySelector('fieldset')).toBeNull();   // no size containers in a fieldset: a <section>
  });

  it('keeps the section on save, trims it, and refuses one that is too long or not one line', () => {
    const saved = draftForSave(draft([{ key: 'a', label: 'A', type: 'text', required: false, section: '  Patient  ' },
      { key: 'b', label: 'B', type: 'text', required: false, section: '   ' }]));
    expect(saved.fields[0].section).toBe('Patient');
    expect('section' in saved.fields[1]).toBe(false);
    expect(definitionProblems(draft([{ key: 'a', label: 'A', type: 'text', required: false, section: 'x'.repeat(81) }]))['0'])
      .toContain('section');
    expect(definitionProblems(draft([{ key: 'a', label: 'A', type: 'text', required: false, section: 'A\nB' }]))['0']).toContain('one line');
  });
});

describe('Forms -- checkboxes', () => {
  it('is a field type with options and optional limits', () => {
    expect(FIELD_TYPES.some(t => t.value === 'checkboxes')).toBe(true);
    const saved = draftForSave(draft([{ ...ROS, options: [' Fever ', 'Cough', ''], minSelected: 1, maxSelected: 2 }]));
    expect(saved.fields[0].options).toEqual(['Fever', 'Cough']);
    expect(saved.fields[0].minSelected).toBe(1);
    expect(saved.fields[0].maxSelected).toBe(2);
    expect(definitionProblems(draft([{ ...ROS, options: [] }]))['0']).toContain('at least one option');
    expect(definitionProblems(draft([{ ...ROS, minSelected: 3, maxSelected: 2 }]))['0']).toContain('more than the most');
    expect(definitionProblems(draft([{ ...ROS, maxSelected: 4 }]))['0']).toContain('from 1 to 3');
    expect(selectionText({ minSelected: 1, maxSelected: 3 })).toBe('Tick 1 to 3');
  });

  it('draws one checkbox per option, ticks and unticks into a list in the options\' order', () => {
    const { fixture, el } = render([ROS], { ros: ['Rash'] });
    const boxes = Array.from(el.querySelectorAll<HTMLInputElement>('#fill-ros input[type="checkbox"]'));
    expect(boxes.map(b => b.getAttribute('data-option'))).toEqual(['Fever', 'Cough', 'Rash']);
    expect(boxes.map(b => b.checked)).toEqual([false, false, true]);
    const changes: unknown[] = [];
    fixture.componentInstance.answerChange.subscribe(c => changes.push(c.value));
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new Event('change'));
    expect(changes).toEqual([['Fever', 'Rash']]);
    expect(el.querySelector('#fill-ros')?.getAttribute('role')).toBe('group');
  });

  it('checks the answer as Core does and sends the ticked options', () => {
    const limited = { ...ROS, required: true, minSelected: 2, maxSelected: 2 };
    expect(answerProblems([limited], { ros: [] })['ros']).toContain('required');
    expect(answerProblems([limited], { ros: ['Fever'] })['ros']).toContain('at least 2');
    expect(answerProblems([limited], { ros: ['Fever', 'Cough', 'Rash'] })['ros']).toContain('at most 2');
    expect(answerProblems([limited], { ros: ['Fever', 'Cough'] })['ros']).toBeUndefined();
    expect(answersForSubmit([ROS], { ros: ['Rash', 'Fever'] })).toEqual({ ros: ['Fever', 'Rash'] });
    expect(answerText(ROS, ['Fever', 'Rash'])).toBe('Fever, Rash');
  });

  it('shows a field by an option ticked (eq, ne, in), and refuses more/less than on it', () => {
    expect(holds({ field: 'ros', op: 'eq', value: 'fever' }, { ros: ['Cough', 'Fever'] })).toBe(true);
    expect(holds({ field: 'ros', op: 'ne', value: 'Fever' }, { ros: ['Cough'] })).toBe(true);
    expect(holds({ field: 'ros', op: 'in', value: ['Rash', 'Cough'] }, { ros: ['Cough'] })).toBe(true);
    expect(visibleFields(FIELDS, { ros: ['Cough'] }).map(f => f.key)).not.toContain('fever_days');
    expect(visibleFields(FIELDS, { ros: ['Fever'] }).map(f => f.key)).toContain('fever_days');
    expect(definitionProblems(draft([ROS, { key: 'x', label: 'X', type: 'text', required: false, showWhen: { field: 'ros', op: 'gt', value: 'a' } }]))['1'])
      .toContain('checkboxes');
  });
});

describe('Workflows -- an approval keeps its decision (saveAs)', () => {
  it('saves saveAs on an approval or a task, and offers its fields to later steps', () => {
    const json = toJson([
      { key: 'nurse', type: 'approval', assignee: { kind: 'role', value: 'TENANT_ADMIN' }, saveAs: ' nurse_review ' } as never,
      { key: 'file', type: 'task', assignee: { kind: 'requester' } } as never]);
    expect(json.steps[0]['saveAs']).toBe('nurse_review');
    expect('saveAs' in json.steps[1]).toBe(false);
    expect(decisionFields({ saveAs: 'nurse_review' })).toEqual(['nurse_review.decision', 'nurse_review.byName', 'nurse_review.by',
      'nurse_review.at', 'nurse_review.comment']);
  });
});
