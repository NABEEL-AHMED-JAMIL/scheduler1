import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogRef } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { DocumentsApi } from './documents.service';
import { StarterMarket } from './documents.model';
import { StartersDialog } from './starters-dialog';

/**
 * Add from starters (owner 2026-10-20, §0.2): the catalog by market as ai-service answers it. Built-in and added starters
 * cannot be ticked; the rest can, one by one or a market at once; what was added and what was skipped is said.
 */
const MARKETS: StarterMarket[] = [
  { key: 'healthcare', label: 'Healthcare', description: 'Clinical and patient paperwork.', starters: [
    { typeKey: 'referral', name: 'Referral', description: 'A letter asking another provider to see a patient.', fieldCount: 13, tableCount: 0,
      ruleCount: 4, fields: ['Referral date', 'Patient name', 'Date of birth', 'Patient ID', 'Patient phone', 'Referring provider', 'Referred to'],
      builtIn: false, added: true, documentTypeId: 3101 },
    { typeKey: 'lab_result', name: 'Lab result', fieldCount: 10, tableCount: 1, ruleCount: 3, fields: ['Patient name'], builtIn: false, added: false },
    { typeKey: 'consent_form', name: 'Consent form', fieldCount: 11, tableCount: 0, ruleCount: 2, fields: ['Patient name'], builtIn: false, added: false },
  ] },
  { key: 'finance', label: 'ERP and finance', starters: [
    { typeKey: 'invoice', name: 'Invoice', fieldCount: 9, tableCount: 1, ruleCount: 4, fields: ['Invoice number'], builtIn: true, added: false, documentTypeId: 1000 },
    { typeKey: 'receipt', name: 'Receipt', fieldCount: 10, tableCount: 1, ruleCount: 3, fields: ['Merchant'], builtIn: false, added: false },
  ] },
];

function open(answer: unknown = { status: 'SUCCESS', message: 'Added 2 document types: Lab result, Consent form.', data: {
  added: [{ documentTypeId: 3102, typeKey: 'lab_result', name: 'Lab result' }, { documentTypeId: 3103, typeKey: 'consent_form', name: 'Consent form' }],
  skipped: [] } }) {
  const api = {
    starters: vi.fn(() => of({ status: 'SUCCESS', message: '', data: MARKETS })),
    addStarters: vi.fn(() => (answer instanceof Error ? throwError(() => answer) : of(answer))),
  };
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: DocumentsApi, useValue: api }, { provide: DialogRef, useValue: ref }],
  });
  const fixture = TestBed.createComponent(StartersDialog);
  fixture.detectChanges();
  return { fixture, dialog: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, api, ref };
}

describe('StartersDialog', () => {
  it('lists the starters by market, with what each reads, and only the addable ones can be ticked', async () => {
    const { fixture, el } = open();
    await fixture.whenStable();
    expect([...el.querySelectorAll('[data-market] h3')].map(h => h.textContent!.trim())).toEqual(['Healthcare', 'ERP and finance']);
    const row = (key: string) => el.querySelector(`[data-starter="${key}"]`)!;
    expect(row('referral').textContent).toContain('Added');
    expect(row('referral').textContent).toContain('Reads Referral date, Patient name, Date of birth, Patient ID, Patient phone, Referring provider and 1 more');
    expect((row('referral').querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(row('invoice').textContent).toContain('Built in');
    expect((row('invoice').querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(row('lab_result').textContent).toContain('10 fields · 1 table · 3 rules');
    expect((row('lab_result').querySelector('input') as HTMLInputElement).disabled).toBe(false);
  });

  it('chooses a market at once, adds the chosen ones, and says what happened', async () => {
    const { fixture, dialog, el, api, ref } = open();
    await fixture.whenStable();
    dialog.toggleMarket(MARKETS[0]);
    expect([...dialog.chosen()].sort()).toEqual(['consent_form', 'lab_result']);
    expect(dialog.chosenLabel()).toBe('Add 2 types');
    dialog.confirm();
    expect(api.addStarters).toHaveBeenCalledWith(['lab_result', 'consent_form']);
    fixture.detectChanges();
    expect(el.textContent).toContain('Added 2 document types: Lab result, Consent form.');
    dialog.confirm();
    expect(ref.close).toHaveBeenCalledWith({ changed: true });
  });

  it('never ticks a built-in or added starter, and closes unchanged when nothing was added', async () => {
    const { fixture, dialog, ref } = open();
    await fixture.whenStable();
    dialog.toggle(MARKETS[1].starters[0]);
    dialog.toggle(MARKETS[0].starters[0]);
    expect(dialog.chosen().size).toBe(0);
    dialog.toggle(MARKETS[1].starters[1]);
    dialog.toggle(MARKETS[1].starters[1]);
    expect(dialog.chosen().size).toBe(0);
    dialog.close();
    expect(ref.close).toHaveBeenCalledWith({ changed: false });
  });

  it('says why the starters could not be added', async () => {
    const { fixture, dialog, el } = open(Object.assign(new Error('refused'), { status: 403, error: { status: 'ERROR', message: 'A workspace administrator adds document types.' } }));
    await fixture.whenStable();
    dialog.toggle(MARKETS[1].starters[1]);
    dialog.confirm();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('A workspace administrator adds document types.');
    expect(dialog.answer()).toBeNull();
  });
});
