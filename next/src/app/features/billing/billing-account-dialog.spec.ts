import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { BillingAccountDialog } from './billing-account-dialog';
import { BillingApi } from './billing.service';
import { ToastService } from '../../shared/ui/toast.service';

/**
 * The profile form opened on defaults (USD, 30 days, VAT, no tax number) and filled in when the
 * read answered. If the read failed -- or had not answered yet -- Save wrote those defaults over
 * the workspace's real billing profile, tax number and currency included.
 */
function dialogWith(account: () => Observable<any>) {
  const saveAccount = vi.fn(() => of({ status: 'SUCCESS', message: 'Saved.' }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: DialogRef, useValue: { close: vi.fn() } },
    { provide: DIALOG_DATA, useValue: { tenantId: '2905' } },
    { provide: BillingApi, useValue: { account, saveAccount } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(BillingAccountDialog);
  fixture.detectChanges();
  const dialog = fixture.componentInstance;
  dialog.form.patchValue({ legalName: 'Typed while waiting' });
  return { fixture, dialog, saveAccount,
    text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ') };
}

describe('BillingAccountDialog', () => {
  it('does not save over the stored profile when it could not be read', () => {
    const view = dialogWith(() => throwError(() => ({ status: 500, error: { message: 'Billing is unavailable.' } })));
    view.dialog.save();

    expect(view.saveAccount).not.toHaveBeenCalled();
    expect(view.text()).toContain('Billing is unavailable.');
  });

  it('does not save over the stored profile when the read was refused', () => {
    const view = dialogWith(() => of({ status: 'ERROR', message: 'Not your workspace.' }));
    view.dialog.save();

    expect(view.saveAccount).not.toHaveBeenCalled();
    expect(view.text()).toContain('Not your workspace.');
  });

  it('does not save while the profile is still being read', () => {
    const view = dialogWith(() => new Subject<any>().asObservable());
    view.dialog.save();

    expect(view.saveAccount).not.toHaveBeenCalled();
  });

  it('saves a first profile for a workspace that has none yet', () => {
    const view = dialogWith(() => of({ status: 'SUCCESS', message: '', data: null }));
    view.dialog.save();

    expect(view.saveAccount).toHaveBeenCalled();
  });
});
