import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiClientInput, ApiClientRow, ApiClientWithSecret, ApiClientsApi, ApiLimitBounds, ScopeRow } from './api-clients.api';

export interface ClientDialogData {
  scopes: ScopeRow[];
  /** The client being changed; none for a new one. */
  client?: ApiClientRow | null;
  /** MIG-337: the workspace's bounds, which a client's own limit stays within; none when they could not be read. */
  bounds?: ApiLimitBounds | null;
  /** MIG-337: whether this person may change a limit (not a customer in a MANAGED workspace). */
  canSetLimits?: boolean;
}

/** A limit field's text as the request carries it: empty is 0 ("the workspace's bound"); null when it is not a whole number. */
export function limitValue(text: string): number | null {
  const t = text.trim();
  if (!t) return 0;
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** What the dialog closes with: a new client with its secret, a saved change, or nothing. */
export type ClientDialogResult = { made: ApiClientWithSecret } | { saved: true } | undefined;

/** "2026-12-31" from the console's naive server time "2026-12-31T23:59:59" (the server's own wall-clock day). */
export function dayOf(serverTime: string | null | undefined): string {
  return serverTime && /^\d{4}-\d{2}-\d{2}/.test(serverTime) ? serverTime.substring(0, 10) : '';
}

/**
 * MIG-332: make or change an API client -- a name, the scopes it holds, an optional IP allowlist (addresses and CIDR
 * ranges) and an optional last day. A change of scopes ends the client's tokens; the portal asks for a new one.
 * MIG-337: and its own rate limit -- calls a minute and a burst, within the workspace's bounds (empty: the bound). Read-only
 * to the customer in a MANAGED workspace, where our team sets it.
 */
@Component({
  selector: 'app-api-client-dialog',
  imports: [Field, FormDialog],
  template: `
    <app-form-dialog [heading]="data.client ? 'Change ' + data.client.name : 'New API client'"
        [subtitle]="data.client ? 'Changing the scopes ends its current tokens.' : 'For one of your own systems, such as a portal. The secret is shown once.'"
        [confirmLabel]="data.client ? 'Save' : 'Make client'" busyLabel="Saving…" size="wide"
        [saving]="saving()" [confirmDisabled]="!ready()" (cancelled)="ref.close()" (confirmed)="save()">
      <div class="form-grid">
        <app-field label="Name" for="clientName" hint="What the client is for: Order portal, Partner sync." [required]="true">
          <input id="clientName" class="input" maxlength="120" [value]="name()" (input)="name.set($any($event.target).value)"
                 cdkFocusInitial />
        </app-field>
        <app-field label="Last day (optional)" for="clientExpires" hint="The client stops working at the end of that day.">
          <input id="clientExpires" type="date" class="input" [value]="expires()" (input)="expires.set($any($event.target).value)" />
        </app-field>
      </div>
      <fieldset class="form-lock mt-4 mb-4">
        <legend class="text-sm font-medium mb-2">Scopes</legend>
        <div class="flex flex-col gap-1.5" data-scopes>
          @for (s of data.scopes; track s.scope) {
            <label class="inline-flex items-start gap-2 text-sm">
              <input type="checkbox" class="checkbox mt-0.5" [checked]="chosen().includes(s.scope)" (change)="toggle(s.scope)"
                     [attr.data-scope]="s.scope" />
              <span><span class="mono text-xs">{{ s.scope }}</span>
                <span class="text-[color:var(--text-muted)]"> — {{ s.description }}</span></span>
            </label>
          }
        </div>
      </fieldset>
      <div class="form-grid mb-4" data-client-limits>
        <app-field label="Calls a minute (optional)" for="clientRate"
            [hint]="rateHint">
          <input id="clientRate" class="input" inputmode="numeric" [value]="rate()" (input)="rate.set($any($event.target).value)"
                 [disabled]="!canSetLimits" [placeholder]="'' + (data.bounds?.clientRateMax ?? 600)" />
        </app-field>
        <app-field label="Burst (optional)" for="clientBurst"
            [hint]="burstHint">
          <input id="clientBurst" class="input" inputmode="numeric" [value]="burst()" (input)="burst.set($any($event.target).value)"
                 [disabled]="!canSetLimits" [placeholder]="'' + (data.bounds?.clientBurstMax ?? 100)" />
        </app-field>
      </div>
      @if (!canSetLimits) {
        <p class="text-xs text-[color:var(--text-muted)] -mt-2 mb-4">Our team sets this workspace's API limits.</p>
      }
      <app-field label="IP allowlist (optional)" for="clientAllowlist"
          hint="One address or CIDR range per line, such as 203.0.113.0/24. Empty: any address.">
        <textarea id="clientAllowlist" class="input mono text-xs" rows="3" [value]="allowlist()"
                  (input)="allowlist.set($any($event.target).value)"></textarea>
      </app-field>
      @if (!limitsValid()) {
        <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">
          A limit is a whole number up to the workspace's most ({{ data.bounds?.clientRateMax }} a minute, burst {{ data.bounds?.clientBurstMax }}), or empty.
        </p>
      }
      @if (error()) { <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">{{ error() }}</p> }
    </app-form-dialog>
  `,
})
export class ClientDialog {
  readonly ref = inject<DialogRef<ClientDialogResult>>(DialogRef);
  readonly data = inject<ClientDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiClientsApi);
  private readonly toast = inject(ToastService);

  readonly name = signal(this.data.client?.name ?? '');
  readonly chosen = signal<string[]>(this.data.client?.scopes ?? []);
  readonly allowlist = signal((this.data.client?.ipAllowlist ?? []).join('\n'));
  readonly expires = signal(dayOf(this.data.client?.expiresAt));
  readonly canSetLimits = this.data.canSetLimits !== false;
  readonly rateHint = `Its own rate limit, up to ${this.data.bounds?.clientRateMax ?? 600}. Empty: ${this.data.bounds?.clientRateMax ?? 600}, `
    + 'the workspace\'s most.';
  readonly burstHint = `Calls it may make at once, up to ${this.data.bounds?.clientBurstMax ?? 100}. Empty: ${this.data.bounds?.clientBurstMax ?? 100}.`;
  readonly rate = signal(this.data.client?.ratePerMinute ? String(this.data.client.ratePerMinute) : '');
  readonly burst = signal(this.data.client?.burst ? String(this.data.client.burst) : '');
  /** Each limit field is empty or a whole number within the workspace's bound. */
  readonly limitsValid = computed(() => {
    const rate = limitValue(this.rate());
    const burst = limitValue(this.burst());
    const bounds = this.data.bounds;
    return rate !== null && burst !== null && (!bounds || (rate <= bounds.clientRateMax && burst <= bounds.clientBurstMax));
  });
  readonly saving = signal(false);
  readonly error = signal('');
  readonly ready = computed(() => !!this.name().trim() && this.chosen().length > 0 && this.limitsValid() && !this.saving());

  toggle(scope: string): void {
    this.chosen.update(list => list.includes(scope) ? list.filter(s => s !== scope) : [...list, scope]);
  }

  save(): void {
    if (!this.ready()) return;
    this.saving.set(true);
    this.error.set('');
    const input: ApiClientInput = { name: this.name().trim(), scopes: this.chosen(), ipAllowlist: this.allowlist(), expiresAt: this.expires() };
    const client = this.data.client;
    // A limit goes only from someone who may set it, and only when it says something: 0 is "the workspace's bound".
    if (this.canSetLimits) {
      const rate = limitValue(this.rate()) ?? 0;
      const burst = limitValue(this.burst()) ?? 0;
      if (rate !== (client?.ratePerMinute ?? 0)) input.ratePerMinute = rate;
      if (burst !== (client?.burst ?? 0)) input.burst = burst;
    }
    if (client) {
      this.api.update({ clientId: client.clientId, ...input }).subscribe({
        next: r => {
          this.saving.set(false);
          if (r.status === API_SUCCESS) {
            this.toast.success(r.message || 'Saved.');
            this.ref.close({ saved: true });
          } else {
            this.error.set(r.message || 'The change was refused.');
          }
        },
        error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The change could not be saved.'); },
      });
      return;
    }
    this.api.create(input).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS && r.data) this.ref.close({ made: r.data });
        else this.error.set(r.message || 'The client was refused.');
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The client could not be made.'); },
    });
  }
}
