import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormRenderer } from './form-renderer';
import { FormField } from './forms.model';

/**
 * UX2 (owner 2026-10-26): a form's field may carry a placeholder -- example text inside its empty control -- and help text
 * under it. The label always stays (a placeholder is never the only name), the help is linked with aria-describedby, and
 * both are shown as text: markup typed into either is never drawn.
 */
const FIELDS: FormField[] = [
  { key: 'patient_id', label: 'Patient ID', type: 'text', required: true, placeholder: 'e.g. P-00017', help: 'As on the wristband' },
  { key: 'notes', label: 'Notes', type: 'longText', required: false, placeholder: 'What you saw' },
  { key: 'length_cm', label: 'Length (cm)', type: 'number', required: false, placeholder: 'e.g. 2.5' },
  { key: 'seen_on', label: 'Seen on', type: 'date', required: false, placeholder: 'Day of the visit' },
  { key: 'nurse_email', label: 'Nurse e-mail', type: 'email', required: false, placeholder: '<b>name@example.com</b>', help: '<i>work</i> address' },
  { key: 'site', label: 'Site', type: 'choice', required: false, options: ['Heel', 'Sacrum'], placeholder: 'Choose a site' },
  { key: 'ward', label: 'Ward', type: 'lookup', required: false, lookup: { formId: 7, field: 'ward' }, placeholder: 'Pick the ward' },
  { key: 'plain', label: 'Plain', type: 'text', required: false },
  { key: 'plain_site', label: 'Plain site', type: 'choice', required: false, options: ['A'] },
];

function render(fields: FormField[] = FIELDS, lookupValues: Record<string, string[]> = { ward: ['North', 'South'] }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(FormRenderer);
  fixture.componentRef.setInput('fields', fields);
  fixture.componentRef.setInput('lookupValues', lookupValues);
  fixture.componentRef.setInput('idPrefix', 'fill');
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('UX2: a field\'s placeholder and help text', () => {
  it('shows each placeholder inside its empty control, and keeps every label', () => {
    const { el } = render();
    expect(el.querySelector('#fill-patient_id')?.getAttribute('placeholder')).toBe('e.g. P-00017');
    expect(el.querySelector('textarea#fill-notes')?.getAttribute('placeholder')).toBe('What you saw');
    expect(el.querySelector('#fill-length_cm')?.getAttribute('placeholder')).toBe('e.g. 2.5');
    expect(el.querySelector('app-date-field button#fill-seen_on')?.textContent).toContain('Day of the visit');
    expect(el.querySelector('#fill-site option[value=""]')?.textContent?.trim()).toBe('Choose a site');
    expect(el.querySelector('#fill-ward option[value=""]')?.textContent?.trim()).toBe('Pick the ward');
    for (const f of FIELDS) expect(el.querySelector(`label[for="fill-${f.key}"]`)?.textContent).toContain(f.label);
  });

  it('keeps the old defaults when a field has none: no placeholder on a box, "Choose…" on a list, "Pick a date" on a day', () => {
    const { el } = render();
    expect(el.querySelector('#fill-plain')?.hasAttribute('placeholder')).toBe(false);
    expect(el.querySelector('#fill-plain_site option[value=""]')?.textContent?.trim()).toBe('Choose…');
    const { el: day } = render([{ key: 'd', label: 'D', type: 'date', required: false }]);
    expect(day.querySelector('button#fill-d')?.textContent).toContain('Pick a date');
  });

  it('uses the placeholder on a long lookup\'s search box, "Type to find…" when it has none', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Ward ${i + 1}`);
    const { el } = render([FIELDS[6]], { ward: many });
    expect(el.querySelector('input#fill-ward')?.getAttribute('placeholder')).toBe('Pick the ward');
    const { el: bare } = render([{ ...FIELDS[6], placeholder: null }], { ward: many });
    expect(bare.querySelector('input#fill-ward')?.getAttribute('placeholder')).toBe('Type to find…');
  });

  it('puts the help under the field and names it in the control\'s aria-describedby', () => {
    const { el } = render();
    const box = el.querySelector('#fill-patient_id')!;
    const note = box.closest('.field')!.querySelector('.field-note')!;
    expect(note.textContent?.trim()).toBe('As on the wristband');
    expect(box.getAttribute('aria-describedby')?.split(' ')).toContain(note.id);
    expect(el.querySelector('#fill-plain')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows markup in a placeholder or help as plain text, never as markup', () => {
    const { el } = render();
    const email = el.querySelector('#fill-nurse_email')!;
    expect(email.getAttribute('placeholder')).toBe('<b>name@example.com</b>');
    const note = email.closest('.field')!.querySelector('.field-note')!;
    expect(note.textContent?.trim()).toBe('<i>work</i> address');
    expect(note.querySelector('i')).toBeNull();
  });
});
