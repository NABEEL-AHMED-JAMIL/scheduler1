import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { LoadError } from '../../../shared/ui/load-error';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ApiClientRow, ApiClientsApi, ClientChangeRow } from './api-clients.api';

export interface ClientHistoryData { client: ApiClientRow; sandbox: boolean; names: Record<number, string> }

const ACTIONS: Record<string, string> = { CREATED: 'Made', UPDATED: 'Changed', SECRET_ROTATED: 'New secret', REVOKED: 'Revoked' };
const FIELDS: Record<string, string> = {
  name: 'Name', scopes: 'Scopes', ipAllowlist: 'IP allowlist', expiresAt: 'Expires', ratePerMinute: 'Calls a minute', burst: 'Burst',
  frameAncestors: 'Frame origins',
};

/**
 * Owner #25 ("flexible API Clients"): a client's history, sliding over the right -- every change since it was made, who
 * made it and when, and each field from what to what (Identity's api_client_change; never a secret).
 */
@Component({
  selector: 'app-client-history-panel',
  imports: [SidePanel, LoadError, ServerTimePipe],
  template: `
    <app-side-panel heading="History" [subtitle]="data.client.name + ' · ' + data.client.clientId">
      @if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (loading()) {
        <p class="text-sm text-[color:var(--text-muted)]"><span class="spinner inline-block align-middle mr-2"></span>Reading…</p>
      } @else if (!rows().length) {
        <p class="text-sm text-[color:var(--text-muted)]">No change kept yet: clients made before 19 Oct 2026 start their history at their next change.</p>
      } @else {
        <ol class="flex flex-col gap-3" data-client-history>
          @for (r of rows(); track r.id) {
            <li class="border-l-2 border-[color:var(--border-strong)] pl-3" [attr.data-action]="r.action">
              <div class="text-sm font-medium">{{ action(r.action) }}</div>
              <div class="text-xs text-[color:var(--text-muted)]">
                {{ r.changedAt ? (r.changedAt | serverTime: 'dateTime') : '' }}{{ r.changedBy ? ' · ' + who(r.changedBy) : '' }}
              </div>
              @for (f of fields(r); track f.name) {
                <div class="text-xs mt-1"><span class="text-[color:var(--text-secondary)]">{{ f.label }}:</span>
                  <span class="mono">{{ f.from }}</span> → <span class="mono">{{ f.to }}</span></div>
              }
            </li>
          }
        </ol>
      }
      <ng-container foot>
        <button type="button" class="btn btn-default btn-sm ml-auto" (click)="ref.close()">Close</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class ClientHistoryPanel {
  readonly ref = inject(DialogRef);
  readonly data = inject<ClientHistoryData>(DIALOG_DATA);
  private readonly api = inject(ApiClientsApi);

  readonly rows = signal<ClientChangeRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.history(this.data.client.clientId, this.data.sandbox).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status === API_SUCCESS) this.rows.set(r.data ?? []);
        else this.error.set(r.message || 'Could not read the history.');
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the history.'); },
    });
  }

  action(code: string): string {
    return ACTIONS[code] ?? code;
  }

  who(id: number): string {
    return this.data.names[id] ?? `person #${id}`;
  }

  fields(row: ClientChangeRow): { name: string; label: string; from: string; to: string }[] {
    return Object.entries(row.changes ?? {}).map(([name, change]) => ({
      name, label: FIELDS[name] ?? name, from: shown(change?.from), to: shown(change?.to),
    }));
  }
}

function shown(value: unknown): string {
  if (value === null || value === undefined || (Array.isArray(value) && !value.length)) return 'none';
  return Array.isArray(value) ? value.join(', ') : String(value);
}
