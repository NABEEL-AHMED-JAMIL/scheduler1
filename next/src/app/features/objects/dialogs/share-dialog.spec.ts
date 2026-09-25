import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Observable, of, throwError } from 'rxjs';
import { ShareDialog } from './share-dialog';

/**
 * The dialog closed BEFORE the email was sent, so a refusal -- an address the server rejects,
 * an attachment over the 20 MiB limit -- came back as a toast after the typed recipient and note
 * were already gone, and the person had to open the dialog and type both again.
 */
function dialogSending(send: () => Observable<any>) {
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: DialogRef, useValue: { close } },
    { provide: DIALOG_DATA, useValue: { count: 2, send } },
  ] });
  const fixture = TestBed.createComponent(ShareDialog);
  fixture.detectChanges();
  const dialog = fixture.componentInstance;
  dialog.email.set('ops@medaxis.example');
  dialog.message.set('Q3 files');
  return { fixture, dialog, close,
    submit: () => { dialog.submit(new Event('submit')); fixture.detectChanges(); },
    text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ') };
}

describe('ShareDialog', () => {
  it('stays open with what was typed, and says why, when the send is refused', () => {
    const view = dialogSending(() => of({ status: 'ERROR', message: 'The attachment is over 20 MiB.' }));
    view.submit();

    expect(view.close).not.toHaveBeenCalled();
    expect(view.dialog.email()).toBe('ops@medaxis.example');
    expect(view.text()).toContain('The attachment is over 20 MiB.');
  });

  it('stays open when the request itself fails', () => {
    const view = dialogSending(() => throwError(() => ({ error: { message: 'Mail is unavailable.' } })));
    view.submit();

    expect(view.close).not.toHaveBeenCalled();
    expect(view.text()).toContain('Mail is unavailable.');
  });

  it('closes once the email has actually gone', () => {
    const view = dialogSending(() => of({ status: 'SUCCESS', message: 'Sent.' }));
    view.submit();

    expect(view.close).toHaveBeenCalledWith({ recipientEmail: 'ops@medaxis.example', message: 'Q3 files' });
  });
});

/** Audit 09-22: an incomplete address says why Send is off, once the person has left the box. */
describe('ShareDialog address check', () => {
  it('marks the recipient invalid and says what is wrong after it is touched', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { count: 1 } },
    ] });
    const fixture = TestBed.createComponent(ShareDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const to = el.querySelector<HTMLInputElement>('#to')!;
    to.value = 'ops@medaxis';
    to.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(to.getAttribute('aria-invalid')).not.toBe('true');     // not while still typing
    to.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(to.getAttribute('aria-invalid')).toBe('true');
    const note = el.querySelector('#to-error')!;
    expect(note.textContent).toContain('Enter a full email address');
    expect(to.getAttribute('aria-describedby')).toBe('to-error');
  });
});

