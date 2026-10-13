import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiClientsApi, ApiLimitsRow } from '../../integration/api-clients/api-clients.api';

export interface ApiLimitsDialogData {
  tenantId: number;
  tenantName: string;
}

/** A bound's text as the request carries it: empty is 0 (the platform's default); null when it is not a whole number. */
export function boundValue(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!t) return 0;
  return /^\d+$/.test(t) ? Number(t) : null;
}

/**
 * MIG-337: a workspace's bounds for the customer API, the platform administrator's (Administration › Tenants › API limits):
 * the most any one client may have, the ceiling over all its clients together, and an optional monthly quota of calls (the
 * bill's month: a calendar month in the workspace's billing time zone, H9). Empty is the platform's default. They hold from the workspace's next call; past the
 * quota the API answers 429 quota-exceeded until the month ends.
 */
@Component({
  selector: 'app-api-limits-dialog',
  imports: [Field, FormDialog],
  template: `
    <app-form-dialog [heading]="'API limits: ' + data.tenantName"
        subtitle="Bounds for this workspace's API clients. Empty: the platform's default. They hold from the next call."
        confirmLabel="Save limits" busyLabel="Saving…" size="wide"
        [saving]="saving()" [confirmDisabled]="!ready()" (cancelled)="ref.close(false)" (confirmed)="save()">
      @if (loaded(); as l) {
        <div class="form-grid" data-api-limits-form>
          <app-field label="Each client, calls a minute" for="limClientRate" [hint]="'Default ' + l.defaults.clientRateMax + '.'">
            <input id="limClientRate" class="input" inputmode="numeric" [value]="clientRate()" (input)="clientRate.set($any($event.target).value)"
                   [placeholder]="'' + l.defaults.clientRateMax" cdkFocusInitial />
          </app-field>
          <app-field label="Each client, burst" for="limClientBurst" [hint]="'Default ' + l.defaults.clientBurstMax + '.'">
            <input id="limClientBurst" class="input" inputmode="numeric" [value]="clientBurst()" (input)="clientBurst.set($any($event.target).value)"
                   [placeholder]="'' + l.defaults.clientBurstMax" />
          </app-field>
          <app-field label="All clients together, calls a minute" for="limWsRate" [hint]="'Default ' + l.defaults.workspaceRate + '.'">
            <input id="limWsRate" class="input" inputmode="numeric" [value]="workspaceRate()" (input)="workspaceRate.set($any($event.target).value)"
                   [placeholder]="'' + l.defaults.workspaceRate" />
          </app-field>
          <app-field label="All clients together, burst" for="limWsBurst" [hint]="'Default ' + l.defaults.workspaceBurst + '.'">
            <input id="limWsBurst" class="input" inputmode="numeric" [value]="workspaceBurst()" (input)="workspaceBurst.set($any($event.target).value)"
                   [placeholder]="'' + l.defaults.workspaceBurst" />
          </app-field>
          <app-field label="Monthly quota, API calls" for="limMonthly"
              [hint]="quotaHint(l)">
            <input id="limMonthly" class="input" inputmode="numeric" [value]="monthly()" (input)="monthly.set($any($event.target).value)"
                   placeholder="No quota" />
          </app-field>
          <div class="text-sm self-end pb-2" data-api-limits-used>
            This month{{ l.month ? ' (' + l.month + ')' : '' }}: {{ l.callsThisMonth == null ? '—' : l.callsThisMonth.toLocaleString() }} calls
            @if (l.quotaUsedPercent != null) { ({{ l.quotaUsedPercent }}% of the quota) }
          </div>
        </div>
      } @else {
        <p class="text-sm text-[color:var(--text-muted)]">{{ loadError() || 'Reading the limits…' }}</p>
      }
      @if (!valid()) { <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">Each limit is a whole number, or empty.</p> }
      @if (error()) { <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">{{ error() }}</p> }
    </app-form-dialog>
  `,
})
export class ApiLimitsDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<ApiLimitsDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiClientsApi);
  private readonly toast = inject(ToastService);

  readonly loaded = signal<ApiLimitsRow | null>(null);
  readonly loadError = signal('');
  readonly clientRate = signal('');
  readonly clientBurst = signal('');
  readonly workspaceRate = signal('');
  readonly workspaceBurst = signal('');
  readonly monthly = signal('');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly valid = computed(() => [this.clientRate(), this.clientBurst(), this.workspaceRate(), this.workspaceBurst(), this.monthly()]
    .every(v => boundValue(v) !== null));
  readonly ready = computed(() => !!this.loaded() && this.valid() && !this.saving());

  /** H9: the quota's month is the bill's -- a calendar month in the workspace's billing time zone, which Identity names. */
  quotaHint(l: ApiLimitsRow): string {
    return `The bill's month, in ${l.monthTimeZone || "the workspace's billing time zone"}. Empty: no quota. From 80% the answers warn; past it, 429 until the month ends.`;
  }

  constructor() {
    this.api.limits(this.data.tenantId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) {
          this.loadError.set(r.message || 'The limits could not be read.');
          return;
        }
        const l = r.data;
        this.loaded.set(l);
        // A bound equal to the default shows empty only when nobody set one.
        const own = (value: number | null, fallback: number | null) => l.custom && value != null && value !== fallback ? String(value) : '';
        this.clientRate.set(own(l.bounds.clientRateMax, l.defaults.clientRateMax));
        this.clientBurst.set(own(l.bounds.clientBurstMax, l.defaults.clientBurstMax));
        this.workspaceRate.set(own(l.bounds.workspaceRate, l.defaults.workspaceRate));
        this.workspaceBurst.set(own(l.bounds.workspaceBurst, l.defaults.workspaceBurst));
        this.monthly.set(l.bounds.monthlyCalls == null ? '' : String(l.bounds.monthlyCalls));
      },
      error: err => this.loadError.set(err?.error?.message || 'The limits could not be read.'),
    });
  }

  save(): void {
    if (!this.ready()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.saveLimits({
      tenantId: this.data.tenantId,
      clientRateMax: boundValue(this.clientRate()),
      clientBurstMax: boundValue(this.clientBurst()),
      workspaceRate: boundValue(this.workspaceRate()),
      workspaceBurst: boundValue(this.workspaceBurst()),
      monthlyCalls: boundValue(this.monthly()),
    }).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'API limits saved.');
          this.ref.close(true);
        } else {
          this.error.set(r.message || 'The limits were refused.');
        }
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The limits could not be saved.'); },
    });
  }
}
