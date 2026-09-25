import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
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
