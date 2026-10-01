import { describe, it, expect } from 'vitest';
import { ApplicationRef, Component, ErrorHandler, inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { FormDialog } from './form-dialog';

/** The dialog shell's footer: what it says, and whether it offers a confirm at all. */
describe('FormDialog footer', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [FormDialog] }).createComponent(FormDialog);
    fixture.componentRef.setInput('heading', 'Share');
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    return buttons.map(b => b.textContent!.trim());
  }

  it('keeps Cancel and Save by default', () => {
    expect(render({})).toEqual(['Cancel', 'Save']);
  });

  /** A read-only dialog has nothing to confirm; a lone Close is the honest footer. */
  it('can leave the confirm out, and name the dismissal', () => {
    expect(render({ showConfirm: false, cancelLabel: 'Close' })).toEqual(['Close']);
  });

  /** Not every confirm saves: "Sending…", "Deleting…". */
  it('says what it is busy doing', () => {
    expect(render({ saving: true, busyLabel: 'Sending…', confirmLabel: 'Send' })).toEqual(['Cancel', 'Sending…']);
  });

  it('still says Saving… when no busy label is given', () => {
    expect(render({ saving: true })).toEqual(['Cancel', 'Saving…']);
  });
});

/** A dialog whose confirm closes it at once, as ImportDialog's "Open collection" does. */
@Component({
  imports: [FormDialog],
  template: `<app-form-dialog heading="Done" confirmLabel="Open" (confirmed)="ref.close('opened')" (cancelled)="ref.close()"><p>Report</p></app-form-dialog>`,
})
class ClosesOnConfirm {
  readonly ref = inject(DialogRef);
}

/**
 * MIG-310: FormDialog looks for a field to fix after its (confirmed) returns. A handler that had already closed the
 * dialog left it asking a destroyed view for its next render, and NG0911 was thrown (ImportDialog closed a microtask
 * later to step around it).
 */
describe('FormDialog confirm', () => {
  it('lets the confirm handler close the dialog, and nothing throws', async () => {
    const errors: unknown[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ErrorHandler, useValue: { handleError: (e: unknown) => errors.push(e) } }],
    });
    const ref = TestBed.inject(Dialog).open<string>(ClosesOnConfirm);
    const closed: (string | undefined)[] = [];
    ref.closed.subscribe(v => closed.push(v));
    await TestBed.inject(ApplicationRef).whenStable();
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('app-form-dialog button')].find(b => b.textContent!.trim() === 'Open')!;
    expect(() => confirm.click()).not.toThrow();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(closed).toEqual(['opened']);
    expect(errors).toEqual([]);
  });
});

