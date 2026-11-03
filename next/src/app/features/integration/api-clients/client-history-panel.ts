import { codeWords } from '../../../shared/ui/plain-words';
import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { LoadError } from '../../../shared/ui/load-error';
import { AppLoading, createLoadState } from '../../../shared/ui/loading';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ApiClientRow, ApiClientsApi, ClientChangeRow, SensitiveAccessRow } from './api-clients.api';

/** tenantId: the workspace a platform administrator picked; none for a workspace administrator (their own). */
export interface ClientHistoryData { client: ApiClientRow; sandbox: boolean; names: Record<number, string>; tenantId?: number | null }

const ACTIONS: Record<string, string> = { CREATED: 'Made', UPDATED: 'Changed', SECRET_ROTATED: 'New secret', REVOKED: 'Revoked',
  SENSITIVE_FILES_GRANTED: 'Sensitive files allowed', SENSITIVE_FILES_REVOKED: 'Sensitive files stopped' };
const FIELDS: Record<string, string> = {
  name: 'Name', scopes: 'Scopes', ipAllowlist: 'IP allowlist', expiresAt: 'Expires', ratePerMinute: 'Calls a minute', burst: 'Burst',
  frameAncestors: 'Frame origins', sensitiveFilesReason: 'Why sensitive files',
};

/**
 * Owner #25 ("flexible API Clients"): a client's history, sliding over the right -- every change since it was made, who
 * made it and when, and each field from what to what (Identity's api_client_change; never a secret).
 * MIG-456: below, the client's links to and downloads of sensitive files, served and refused (Core's audit, the workspace's
 * own administrator only; not for a sandbox's test key, whose files are the sandbox's).
 */
@Component({
  selector: 'app-client-history-panel',
  imports: [SidePanel, LoadError, ServerTimePipe, AppLoading],
  template: `
    <app-side-panel heading="History" [subtitle]="data.client.name + ' · ' + data.client.clientId">
      @if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (loading()) {
        <!-- Owner 2026-10-27: the shared loader, so a screen reader hears what is loading. -->
        <app-loading shape="list" label="Loading the history…" [count]="3" />
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
      @if (showsSensitive) {
        <h3 class="text-sm font-semibold mt-5 mb-1">Sensitive file downloads</h3>
        @if (accessError()) {
          <app-load-error [message]="accessError()" (retry)="loadAccess()" />
        } @else if (accessLoading()) {
          <app-loading shape="list" label="Loading the sensitive file downloads…" [count]="2" />
        } @else if (!access().length) {
          <p class="text-sm text-[color:var(--text-muted)]" data-sensitive-none>None: this client has not asked for a sensitive file.</p>
        } @else {
          <ol class="flex flex-col gap-2" data-sensitive-access>
            @for (a of access(); track $index) {
              <li class="text-xs" [attr.data-outcome]="a.outcome">
                <span [class]="a.outcome === 'served' ? 'pill pill-ok' : 'pill pill-crit'">{{ a.outcome === 'served' ? (a.action === 'link' ? 'Link' : 'Downloaded') : 'Refused' }}</span>
                <span class="ml-1 font-medium">{{ a.fileName || a.fileId }}</span>
                @if (a.runId) { <span class="text-[color:var(--text-muted)]"> · run #{{ a.runId }}</span> }
                <div class="text-[color:var(--text-muted)]">{{ a.at ? (a.at | serverTime: 'dateTime') : '' }}{{ a.outcome === 'refused' && a.reason ? ' · ' + refusal(a.reason) : '' }}</div>
              </li>
            }
          </ol>
        }
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
  readonly state = createLoadState();
  readonly loading = this.state.loading;
  readonly error = this.state.error;

  /** MIG-456: the audit is the workspace's own; a sandbox's test key's files are the sandbox's. */
  readonly showsSensitive = !this.data.sandbox && !this.data.tenantId;
  readonly access = signal<SensitiveAccessRow[]>([]);
  readonly accessState = createLoadState();
  readonly accessLoading = this.accessState.loading;
  readonly accessError = this.accessState.error;

  constructor() {
    this.load();
    if (this.showsSensitive) this.loadAccess();
  }

  loadAccess(): void {
    this.accessState.start();
    this.api.sensitiveAccess(this.data.client.clientId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.accessState.fail(r, 'The sensitive file downloads could not be read.'); return; }
        this.access.set(r.data ?? []);
        this.accessState.done();
      },
      error: err => this.accessState.fail(err, 'The sensitive file downloads could not be read.'),
    });
  }

  /** "files:sensitive not held" -> "the client did not hold files:sensitive"; any other reason after the marker as said. */
  refusal(reason: string): string {
    const rest = reason.replace(/^files:sensitive:?\s*/, '');
    return rest === 'not held' ? 'the client did not hold files:sensitive' : rest;
  }

  load(): void {
    this.state.start();
    this.api.history(this.data.client.clientId, this.data.sandbox, this.data.tenantId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.state.fail(r, 'The history could not be read.'); return; }
        this.rows.set(r.data ?? []);
        this.state.done();
      },
      error: err => this.state.fail(err, 'The history could not be read.'),
    });
  }

  action(code: string): string {
    // Owner 2026-10-27: an action with no words yet reads as words, never its code.
    return ACTIONS[code] ?? codeWords(code);
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
