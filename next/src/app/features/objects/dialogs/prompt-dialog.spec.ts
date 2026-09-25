import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { PromptDialog } from './prompt-dialog';

/** Audit 09-22: the one-field prompt is built on the shared dialog shell and field. */
function prompt(initial = '') {
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: DialogRef, useValue: { close } },
    { provide: DIALOG_DATA, useValue: { title: 'New folder', label: 'Folder name', confirmLabel: 'Create', hint: 'Letters and dashes.', initial } },
  ] });
  const fixture = TestBed.createComponent(PromptDialog);
  fixture.detectChanges();
  return { fixture, close, el: fixture.nativeElement as HTMLElement, dialog: fixture.componentInstance };
}

describe('PromptDialog', () => {
  it('uses app-form-dialog and app-field: heading, required label, hint as a field note', () => {
    const { el } = prompt();
    expect(el.querySelector('app-form-dialog h2')?.textContent?.trim()).toBe('New folder');
    const label = el.querySelector('app-field label[for="value"]')!;
    expect(label.textContent).toContain('Folder name');
    expect(label.textContent).toContain('(required)');
    expect(el.querySelector('app-field .field-note')?.textContent?.trim()).toBe('Letters and dashes.');
  });

  it('keeps Create off until something is typed, then closes with the trimmed value', () => {
    const { el, fixture, close, dialog } = prompt();
    const create = () => [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim() === 'Create')!;
    expect(create().disabled).toBe(true);
    dialog.value.set('  reports  ');
    fixture.detectChanges();
    expect(create().disabled).toBe(false);
    create().click();
    expect(close).toHaveBeenCalledWith('reports');
  });

  it('still submits on Enter', () => {
    const { el, close } = prompt('archive');
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(close).toHaveBeenCalledWith('archive');
  });
});
