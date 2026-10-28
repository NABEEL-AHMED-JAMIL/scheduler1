import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { ReceiptStampSettings } from './receipt-stamp-settings';
import { BillingApi } from './billing.service';
import { WorkspacePicker } from './workspace-picker';
import { ToastService } from '../../shared/ui/toast.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** Owner 2026-10-27: the stamp and its specimen say they are loading, and why they failed -- never "No specimen yet." for a failure. */
const STAMP = { platformName: 'ETL Console', platform: null, workspace: null, uses: 'generated', signing: { configured: false, reason: 'Payment received' } };

function screen(stamp: () => Observable<unknown>, specimen: () => Observable<Blob>) {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:specimen', revokeObjectURL: () => {} }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: BillingApi, useValue: { stamp: vi.fn(stamp), stampSpecimen: vi.fn(specimen) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: Dialog, useValue: { open: vi.fn() } },
    { provide: WorkspacePicker, useValue: { options: () => [], ready: (then: () => void) => then(), isPlatformAdmin: () => true } },
  ] });
  const component = TestBed.runInInjectionContext(() => new ReceiptStampSettings());
  component.ngOnInit();
  return component;
}

describe('ReceiptStampSettings -- loading, error', () => {
  it('is loading until the stamp and the specimen answer', () => {
    const component = screen(() => NEVER, () => NEVER);
    expect(component.infoLoading()).toBe(true);
    expect(component.specimenLoading()).toBe(true);
    expect(component.error()).toBe('');
    expect(component.specimenError()).toBe('');
  });

  it('shows the stamp once it answers', () => {
    const component = screen(() => of({ status: API_SUCCESS, data: STAMP }), () => of(new Blob(['%PDF'])));
    expect(component.infoLoading()).toBe(false);
    expect(component.usesLabel()).toBe('The generated stamp');
    expect(component.specimenUrl()).toBe('blob:specimen');
  });

  it('says the stamp and the specimen could not be read, in plain words', () => {
    const fail = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
    const component = screen(fail, fail as () => Observable<Blob>);
    expect(component.infoLoading()).toBe(false);
    expect(component.error()).toBe('The stamp could not be read.');
    expect(component.specimenLoading()).toBe(false);
    expect(component.specimenError()).toBe('The specimen could not be drawn just now.');
  });
});
