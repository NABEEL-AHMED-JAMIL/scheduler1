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

  it('shows a default for its type when a field has none: "Enter ..." on a box, "Choose…" on a list, "Pick a date" on a day', () => {
    const { el } = render();
    expect(el.querySelector('#fill-plain')?.getAttribute('placeholder')).toBe('Enter plain');
    expect(el.querySelector('#fill-plain_site option[value=""]')?.textContent?.trim()).toBe('Choose…');
    const { el: day } = render([{ key: 'd', label: 'D', type: 'date', required: false }]);
    expect(day.querySelector('button#fill-d')?.textContent).toContain('Pick a date');
  });

  it('UX2 defaults (owner: "need a placeholder"): one per type, the label\'s format hint as the example, labels and help kept', () => {
    const bare: FormField[] = [
      { key: 'case_id', label: 'Case number', type: 'text', required: true },
      { key: 'patient_id', label: 'PATIENT ID (SYNTHETIC, SYN-NNN)', type: 'text', required: true, help: 'From the visit sheet' },
      { key: 'notes', label: 'Visit notes', type: 'longText', required: false },
      { key: 'count', label: 'Dressings used', type: 'number', required: false },
      { key: 'pain', label: 'Pain score (1-10)', type: 'number', required: false },
      { key: 'mail', label: 'Nurse e-mail', type: 'email', required: false },
      { key: 'phone', label: 'Contact phone', type: 'text', required: false },
      { key: 'site', label: 'Site', type: 'choice', required: false, options: ['Heel'] },
      { key: 'seen', label: 'Seen on', type: 'date', required: false },
      { key: 'ok', label: 'Healed', type: 'yesNo', required: false },
    ];
    const { el } = render(bare);
    const ph = (id: string) => el.querySelector(`#fill-${id}`)?.getAttribute('placeholder');
    expect(ph('case_id')).toBe('Enter case number');
    expect(ph('patient_id')).toBe('e.g. SYN-NNN');
    expect(el.querySelector('textarea#fill-notes')?.getAttribute('placeholder')).toBe('Write visit notes…');
    expect(ph('count')).toBe('0');
    expect(ph('pain')).toBe('1–10');
    expect(ph('mail')).toBe('name@example.com');
    expect(ph('phone')).toBe('e.g. +1 555 0100');
    expect(el.querySelector('#fill-site option[value=""]')?.textContent?.trim()).toBe('Choose…');
    expect(el.querySelector('button#fill-seen')?.textContent).toContain('Pick a date');
    expect(el.querySelector('#fill-ok input[placeholder]')).toBeNull();
    // A placeholder is never the only name: every label stays, and the help is still what the box is described by.
    for (const f of bare) expect(el.querySelector(`label[for="fill-${f.key}"]`)?.textContent).toContain(f.label);
    const box = el.querySelector('#fill-patient_id')!;
    const note = box.closest('.field')!.querySelector('.field-note')!;
    expect(note.textContent?.trim()).toBe('From the visit sheet');
    expect(box.getAttribute('aria-describedby')?.split(' ')).toContain(note.id);
    expect(el.querySelector('#fill-case_id')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('lets a field\'s own placeholder win over the default, and a blank one fall back to it', () => {
    const { el } = render([
      { key: 'case_id', label: 'Case number', type: 'text', required: true, placeholder: 'e.g. WC-2026-0142' },
      { key: 'patient_id', label: 'Patient id (synthetic, SYN-nnn)', type: 'text', required: true, placeholder: 'e.g. SYN-014' },
      { key: 'site', label: 'Site', type: 'choice', required: false, options: ['Heel'], placeholder: 'Choose the wound site' },
      { key: 'blank', label: 'Ward', type: 'text', required: false, placeholder: '   ' },
    ]);
    expect(el.querySelector('#fill-case_id')?.getAttribute('placeholder')).toBe('e.g. WC-2026-0142');
    expect(el.querySelector('#fill-patient_id')?.getAttribute('placeholder')).toBe('e.g. SYN-014');
    expect(el.querySelector('#fill-site option[value=""]')?.textContent?.trim()).toBe('Choose the wound site');
    expect(el.querySelector('#fill-blank')?.getAttribute('placeholder')).toBe('Enter ward');
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
