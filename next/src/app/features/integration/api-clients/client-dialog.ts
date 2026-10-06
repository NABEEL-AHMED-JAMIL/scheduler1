import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiClientRow, ApiClientWithSecret, ApiClientsApi, ScopeRow } from './api-clients.api';

export interface ClientDialogData {
  scopes: ScopeRow[];
  /** The client being changed; none for a new one. */
  client?: ApiClientRow | null;
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
      <app-field label="IP allowlist (optional)" for="clientAllowlist"
          hint="One address or CIDR range per line, such as 203.0.113.0/24. Empty: any address.">
        <textarea id="clientAllowlist" class="input mono text-xs" rows="3" [value]="allowlist()"
                  (input)="allowlist.set($any($event.target).value)"></textarea>
      </app-field>
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
  readonly saving = signal(false);
  readonly error = signal('');
  readonly ready = computed(() => !!this.name().trim() && this.chosen().length > 0 && !this.saving());

  toggle(scope: string): void {
    this.chosen.update(list => list.includes(scope) ? list.filter(s => s !== scope) : [...list, scope]);
  }

  save(): void {
    if (!this.ready()) return;
    this.saving.set(true);
    this.error.set('');
    const input = { name: this.name().trim(), scopes: this.chosen(), ipAllowlist: this.allowlist(), expiresAt: this.expires() };
    const client = this.data.client;
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
