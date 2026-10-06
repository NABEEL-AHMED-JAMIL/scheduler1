import { Component, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_SUCCESS } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Field } from '../../shared/ui/field';
import { BillingApi } from './billing.service';

/**
 * Who is billed: legal name, address, billing email, tax number and rate, currency, terms.
 * Tax is applied only when both a number and a rate are here -- the rule the invoice follows.
 */
@Component({
  selector: 'app-billing-account-dialog',
  imports: [ReactiveFormsModule, FormDialog, Field],
  template: `
    <app-form-dialog heading="Billing profile" subtitle="Who the invoice is made out to, and whether tax applies." [saving]="saving()" confirmLabel="Save"
                     [confirmDisabled]="loading() || !!loadError()"
                     (confirmed)="save()" (cancelled)="ref.close(false)">
      @if (loading()) {
        <div class="py-8 text-center text-sm text-[color:var(--text-muted)]"><div class="spinner mx-auto mb-3"></div>Reading the profile…</div>
      } @else if (loadError()) {
        <div class="py-8 text-center" role="alert">
          <p class="text-sm">{{ loadError() }}</p>
          <button type="button" class="btn btn-default btn-sm mt-3" (click)="load()">Try again</button>
        </div>
      } @else {
      <form [formGroup]="form" class="form-stack" (ngSubmit)="save()">
        <app-field label="Legal name" for="baName" [required]="true" [control]="form.get('legalName')" [submitted]="submitted()">
          <input id="baName" class="input" formControlName="legalName" placeholder="MedAxis Care Network Ltd" />
        </app-field>
        <app-field label="Address" for="baAddress" [control]="form.get('address')" [submitted]="submitted()">
          <textarea id="baAddress" class="input" rows="3" formControlName="address" placeholder="Street, city, country"></textarea>
        </app-field>
        <app-field label="Billing email" for="baEmail" [control]="form.get('billingEmail')" [submitted]="submitted()">
          <input id="baEmail" class="input" type="email" formControlName="billingEmail" placeholder="billing@…" />
        </app-field>
        <div class="form-grid">
          <app-field label="Tax number (VAT / GST)" for="baTax" [control]="form.get('taxId')" [submitted]="submitted()" hint="Leave empty and no tax is applied.">
            <input id="baTax" class="input mono" formControlName="taxId" placeholder="GB 123 4567 89" />
          </app-field>
          <app-field label="Tax rate %" for="baRate" [control]="form.get('taxRatePercent')" [submitted]="submitted()" hint="Applied only with a number above.">
            <input id="baRate" class="input" type="number" min="0" max="100" step="0.5" formControlName="taxRatePercent" />
          </app-field>
          <app-field label="Tax label" for="baLabel" [control]="form.get('taxLabel')" [submitted]="submitted()">
            <input id="baLabel" class="input" formControlName="taxLabel" placeholder="VAT" />
          </app-field>
          <app-field label="Currency" for="baCurrency" [control]="form.get('currency')" [submitted]="submitted()">
            <input id="baCurrency" class="input mono" formControlName="currency" maxlength="3" placeholder="USD" />
          </app-field>
          <app-field label="Payment terms (days)" for="baTerms" [control]="form.get('paymentTermsDays')" [submitted]="submitted()">
            <input id="baTerms" class="input" type="number" min="0" max="365" formControlName="paymentTermsDays" />
          </app-field>
        </div>
      </form>
      }
    </app-form-dialog>
  `,
})
export class BillingAccountDialog implements OnInit {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ tenantId: string | null }>(DIALOG_DATA);
  private readonly api = inject(BillingApi);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  /**
   * The form starts on defaults (USD, 30 days, VAT, no tax number). Until the stored profile has
   * been read -- or when it cannot be -- saving would write those defaults over it, so the form
   * is not shown and Save is off. A workspace with no profile yet reads back as empty, not as a
   * failure, and gets the defaults as a starting point.
   */
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly submitted = signal(false);
  readonly form = this.fb.group({
    legalName: ['', Validators.required], address: [''], billingEmail: ['', Validators.email],
    taxId: [''], taxRatePercent: [0], taxLabel: ['VAT'], currency: ['USD'], paymentTermsDays: [30],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.account(this.data.tenantId).subscribe({ next: r => {
      this.loading.set(false);
      if (r.status !== API_SUCCESS) { this.loadError.set(r.message || 'The billing profile could not be read.'); return; }
      if (!r.data) return;
      const a = r.data;
      this.form.patchValue({ legalName: a.legalName ?? '', address: a.address ?? '', billingEmail: a.billingEmail ?? '', taxId: a.taxId ?? '',
        taxRatePercent: Number(a.taxRatePercent ?? 0), taxLabel: a.taxLabel ?? 'VAT', currency: a.currency ?? 'USD', paymentTermsDays: a.paymentTermsDays ?? 30 });
    }, error: err => {
      this.loading.set(false);
      this.loadError.set(err?.error?.message || 'The billing profile could not be read.');
    } });
  }

  save(): void {
    if (this.loading() || this.loadError()) return;
    this.submitted.set(true);
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    this.api.saveAccount({ tenantId: Number(this.data.tenantId ?? 0), legalName: v.legalName!, address: v.address ?? '', billingEmail: v.billingEmail ?? '',
      taxId: v.taxId ?? '', taxRatePercent: Number(v.taxRatePercent ?? 0), taxLabel: v.taxLabel ?? '', currency: v.currency ?? 'USD', paymentTermsDays: Number(v.paymentTermsDays ?? 30) }, this.data.tenantId).subscribe({
      next: r => { this.saving.set(false); if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.ref.close(true); },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.message || 'The profile could not be saved.'); },
    });
  }
}
