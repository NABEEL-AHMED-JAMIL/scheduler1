import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { ComboboxOption } from '../../../shared/ui/combobox';
import { ConnectionEdit, ConnectionRow, SSL_MODES, blankConnection, connectionEditOf, connectionSaveOf, sslLabel } from './sources.model';
import { SourcesApi } from './sources.service';

export interface ConnectionDialogData {
  /** null: a new connection. */
  connection: ConnectionRow | null;
  /** A platform administrator's workspaces: a new connection names the one it is for. */
  tenants?: ComboboxOption[];
  /** The workspace to start with (the source's, when opened from one). */
  tenantId?: number | null;
}

/**
 * A PostgreSQL connection for database sources (MIG-248). The password is write-only: the service keeps it sealed
 * and answers only whether one is set, so a stored one is "••• configured" with Replace, and a save sends a password
 * only when one was typed. Closes with the saved connection, or null.
 */
@Component({
  selector: 'app-connection-dialog',
  imports: [FormDialog, Field, Icon],
  template: `
    <app-form-dialog [heading]="data.connection ? 'Edit database connection' : 'New database connection'"
                     [subtitle]="data.connection ? data.connection.name : subtitle"
                     [confirmLabel]="data.connection ? 'Save changes' : 'Create'" [saving]="saving()"
                     (confirmed)="save()" (cancelled)="ref.close(null)">
      <div class="form-stack">
        @if (data.tenants && !data.connection) {
          <app-field label="Workspace" for="dbTenant" [required]="true">
            <select id="dbTenant" class="input" [value]="edit().tenantId ?? ''" (change)="patch({ tenantId: $any($event.target).value ? +$any($event.target).value : null })">
              <option value="">Pick a workspace</option>
              @for (t of data.tenants; track t.value) { <option [value]="t.value" [selected]="t.value === (edit().tenantId + '')">{{ t.label }}</option> }
            </select>
          </app-field>
        }
        <app-field label="Name" for="dbName" [required]="true">
          <input id="dbName" class="input" [value]="edit().name" placeholder="Warehouse (read replica)" (input)="patch({ name: $any($event.target).value })" />
        </app-field>
        <div class="form-grid">
          <app-field label="Host" for="dbHost" [required]="true">
            <input id="dbHost" class="input mono" [value]="edit().host" placeholder="db.example.internal" autocomplete="off" (input)="patch({ host: $any($event.target).value })" />
          </app-field>
          <app-field label="Port" for="dbPort">
            <input id="dbPort" class="input" type="number" min="1" max="65535" [value]="edit().port" (input)="patch({ port: $any($event.target).value })" />
          </app-field>
          <app-field label="Database" for="dbDatabase" [required]="true">
            <input id="dbDatabase" class="input mono" [value]="edit().database" placeholder="analytics" autocomplete="off" (input)="patch({ database: $any($event.target).value })" />
          </app-field>
          <app-field label="User" for="dbUser" [required]="true" hint="A user that can only read is best: the source only ever reads.">
            <input id="dbUser" class="input mono" [value]="edit().username" autocomplete="off" (input)="patch({ username: $any($event.target).value })" />
          </app-field>
          <app-field label="TLS" for="dbSsl">
            <select id="dbSsl" class="input" [value]="edit().sslMode" (change)="patch({ sslMode: $any($event.target).value })">
              @for (m of sslModes; track m) { <option [value]="m" [selected]="m === edit().sslMode">{{ sslText(m) }}</option> }
            </select>
          </app-field>
          <div class="field">
            <label class="label" [attr.for]="edit().passwordSet && !edit().replacing ? null : 'dbPassword'">Password</label>
            @if (edit().passwordSet && !edit().replacing) {
              <div class="flex items-center gap-2 min-h-9">
                <span class="secret-mask mono" aria-hidden="true">•••••••</span>
                <span class="text-xs text-[color:var(--text-secondary)]"><app-icon name="lock" size="0.85em" /> configured</span>
                <button type="button" class="btn btn-ghost btn-xs ml-auto" aria-label="Replace" (click)="replace()">Replace</button>
              </div>
            } @else {
              <div class="flex items-center gap-2">
                <input id="dbPassword" class="input mono" type="password" autocomplete="new-password" [value]="edit().password"
                       [placeholder]="edit().replacing ? 'the new password' : 'write-only'" (input)="patch({ password: $any($event.target).value })" />
                @if (edit().replacing) { <button type="button" class="btn btn-ghost btn-xs" aria-label="Keep the stored password" (click)="keep()">Keep</button> }
              </div>
              <p class="field-note text-[color:var(--text-muted)]">Sealed as it arrives and never shown again.</p>
            }
          </div>
        </div>
        @if (testOutcome(); as t) {
          <p class="text-sm" [class.text-ok-500]="t.ok" [class.text-crit-500]="!t.ok" role="status">
            <app-icon [name]="t.ok ? 'checkCircle' : 'xCircle'" size="0.9em" /> {{ t.ok ? 'Connected.' : t.message }}
          </p>
        }
        @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
      </div>
      <ng-container footer-start>
        @if (data.connection) {
          <button type="button" class="btn btn-default btn-sm" [disabled]="testing() || saving() || dirty()" [attr.title]="dirty() ? 'Save first: the test reads the saved connection.' : null" (click)="test()">
            <app-icon name="plug" [class.spin]="testing()" />Test connection
          </button>
        }
      </ng-container>
    </app-form-dialog>
  `,
})
export class ConnectionDialog {
  readonly ref = inject<DialogRef<ConnectionRow | null>>(DialogRef);
  readonly data = inject<ConnectionDialogData>(DIALOG_DATA);
  private readonly api = inject(SourcesApi);
  private readonly toast = inject(ToastService);

  readonly sslModes = SSL_MODES;
  readonly subtitle = 'PostgreSQL, read-only: a database source runs its query here. The password is write-only.';
  private readonly initial: ConnectionEdit = this.data.connection
    ? connectionEditOf(this.data.connection) : { ...blankConnection(), tenantId: this.data.tenantId ?? null };
  readonly edit = signal<ConnectionEdit>(this.initial);
  readonly dirty = computed(() => JSON.stringify(this.edit()) !== JSON.stringify(this.initial));
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly error = signal('');
  readonly testOutcome = signal<{ ok: boolean; message: string } | null>(null);

  sslText(mode: string): string { return sslLabel(mode); }

  patch(change: Partial<ConnectionEdit>): void {
    this.edit.update(e => ({ ...e, ...change }));
    this.error.set('');
  }

  replace(): void { this.patch({ replacing: true, password: '' }); }
  keep(): void { this.patch({ replacing: false, password: '' }); }

  save(): void {
    const out = connectionSaveOf(this.edit());
    if ('error' in out) { this.error.set(out.error); return; }
    this.saving.set(true);
    this.api.saveConnection(out.body).subscribe({
      next: r => {
        this.saving.set(false);
        // What was typed into the password box is not kept a moment longer than the save needed it.
        this.edit.update(e => ({ ...e, password: '' }));
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message); return; }
        this.toast.success(r.message);
        this.ref.close(r.data);
      },
      error: err => {
        this.saving.set(false);
        this.edit.update(e => ({ ...e, password: '' }));
        this.error.set(err?.error?.message || 'The connection could not be saved.');
      },
    });
  }

  test(): void {
    const id = this.data.connection?.id;
    if (!id) return;
    this.testing.set(true);
    this.testOutcome.set(null);
    this.api.testConnection(id).subscribe({
      next: r => {
        this.testing.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message); return; }
        this.testOutcome.set({ ok: !!r.data.ok, message: r.data.message || r.message });
      },
      error: err => { this.testing.set(false); this.error.set(err?.error?.message || 'The connection could not be tested.'); },
    });
  }
}
