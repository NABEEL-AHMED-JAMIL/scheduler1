import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { BillingApi, BillingTimeZone } from '../../billing/billing.service';

export interface BillingZoneDialogData {
  tenantId: number;
  tenantName: string;
}

/** "2026-11" as the first day of that month, which the serverTime pipe writes as "November 2026". */
export function monthDay(month: string | null | undefined): string {
  return month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : '';
}

/**
 * H9: a workspace's billing time zone, the platform administrator's (Administration › Tenants › Billing time zone). The
 * days and months its usage is billed in -- Cost & usage, the invoice, the customer API's quota month -- are this zone's,
 * America/Chicago unless set. A change takes effect from the first month that has not started (normally next month),
 * never the month under way, and every change is kept with who made it and why. Issued invoices never change.
 */
@Component({
  selector: 'app-billing-zone-dialog',
  imports: [Field, FormDialog, Combobox, ServerTimePipe],
  template: `
    <app-form-dialog [heading]="'Billing time zone: ' + data.tenantName"
        subtitle="The days and months this workspace's usage is billed in: Cost & usage, the invoice and the API quota month."
        confirmLabel="Save time zone" busyLabel="Saving…" size="wide"
        [saving]="saving()" [confirmDisabled]="!ready()" (cancelled)="ref.close(false)" (confirmed)="save()">
      @if (loaded(); as z) {
        <div class="text-sm space-y-1" data-billing-zone-now>
          <p>This month ({{ monthDay(z.month) | serverTime: 'month' }}): <b>{{ z.zone }}</b> · today there is {{ z.today | serverTime: 'date' }}.</p>
          <p>{{ monthDay(z.nextMonth) | serverTime: 'month' }}: <b>{{ z.nextMonthZone }}</b>.</p>
          <p class="text-[color:var(--text-muted)]">A change made now takes effect from
            <b>{{ monthDay(z.changeTakesEffect) | serverTime: 'month' }}</b> — never in the month under way. Issued invoices keep their days.</p>
        </div>
        <div class="form-grid mt-3" data-billing-zone-form>
          <app-field label="Time zone" for="billingZone" hint="An IANA time zone; daylight saving is followed.">
            <app-combobox id="billingZone" [options]="options()" [selected]="zone()" (selectedChange)="zone.set($event)"
                          placeholder="Type to search, e.g. Europe/London" [allowClear]="false" />
          </app-field>
          <app-field label="Why" for="billingZoneReason" hint="Kept with the change.">
            <input id="billingZoneReason" class="input" maxlength="400" [value]="reason()" (input)="reason.set($any($event.target).value)"
                   placeholder="The customer bills from London" />
          </app-field>
        </div>
        @if (z.history.length) {
          <div class="mt-3" data-billing-zone-history>
            <p class="eyebrow">Changes</p>
            <table class="table text-xs">
              <thead><tr><th>From</th><th>Zone</th><th>Set</th><th>Why</th></tr></thead>
              <tbody>
                @for (h of z.history; track h.id) {
                  <tr>
                    <td>{{ monthDay(h.effectiveMonth) | serverTime: 'month' }}</td>
                    <td>{{ h.zone }}</td>
                    <td>{{ h.setAt ? (h.setAt | serverTime: 'dateTime') : 'Migration' }}</td>
                    <td>{{ h.reason || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <p class="text-sm text-[color:var(--text-muted)]">{{ loadError() || 'Reading the billing time zone…' }}</p>
      }
      @if (error()) { <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">{{ error() }}</p> }
    </app-form-dialog>
  `,
})
export class BillingZoneDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<BillingZoneDialogData>(DIALOG_DATA);
  private readonly api = inject(BillingApi);
  private readonly toast = inject(ToastService);
  readonly monthDay = monthDay;

  readonly loaded = signal<BillingTimeZone | null>(null);
  readonly loadError = signal('');
  readonly zones = signal<string[]>([]);
  readonly zone = signal('');
  readonly reason = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly options = computed<ComboboxOption[]>(() => this.zones().map(z => ({ value: z, label: z })));
  /** A zone from the list, other than the one the change month would have anyway. */
  readonly ready = computed(() => {
    const z = this.loaded();
    return !!z && !this.saving() && this.zones().includes(this.zone()) && this.zone() !== this.zoneFrom(z);
  });

  constructor() {
    this.api.timeZones().subscribe({ next: r => { if (r.status === API_SUCCESS) this.zones.set(r.data ?? []); } });
    this.api.timeZone(this.data.tenantId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.loadError.set(r.message || 'The billing time zone could not be read.'); return; }
        this.loaded.set(r.data);
        this.zone.set(this.zoneFrom(r.data));
      },
      error: err => this.loadError.set(err?.error?.message || 'The billing time zone could not be read.'),
    });
  }

  /** The zone the month a change would start from has now: a change scheduled for it, else next month's. */
  private zoneFrom(z: BillingTimeZone): string {
    return [...z.scheduled].reverse().find(s => s.effectiveMonth <= z.changeTakesEffect)?.zone ?? z.nextMonthZone;
  }

  save(): void {
    if (!this.ready()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.setTimeZone(this.data.tenantId, this.zone(), this.reason().trim()).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'Billing time zone saved.');
          this.ref.close(true);
        } else {
          this.error.set(r.message || 'The time zone was refused.');
        }
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The time zone could not be saved.'); },
    });
  }
}
