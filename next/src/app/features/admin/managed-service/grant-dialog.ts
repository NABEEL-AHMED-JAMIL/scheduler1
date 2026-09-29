import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ManagementMode } from '../../../core/auth/auth.models';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { ManagedServiceApi, StaffCandidate, personName } from './managed-service.api';

export interface GrantWorkspace { tenantId: number; tenantName: string; managementMode?: ManagementMode | null }

export interface GrantDialogData {
  staff: StaffCandidate[];
  tenants: GrantWorkspace[];
  /** Preselected from the page's filters, when one is set. */
  tenantId?: number | null;
  appUserId?: number | null;
}

/**
 * MIG-254: grant one staff member (an active platform administrator) the right to work in one workspace.
 * Closes with true once the server has granted it (or had already), and stays open with its reason otherwise.
 */
@Component({
  selector: 'app-grant-dialog',
  imports: [Field, FormDialog],
  template: `
    <app-form-dialog heading="Grant a workspace"
        subtitle="The staff member can then open a managed session there. Every change they make is audited."
        confirmLabel="Grant" busyLabel="Granting…" [saving]="saving()" [confirmDisabled]="!ready()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <app-field label="Staff member" for="grantStaff"
          [hint]="data.staff.length ? 'Active platform administrators.' : 'No active platform administrator to grant.'">
        <select id="grantStaff" class="input" [value]="appUserId() ?? ''" (change)="appUserId.set(num($any($event.target).value))"
                cdkFocusInitial>
          <option value="">Choose a staff member</option>
          @for (s of data.staff; track s.appUserId) {
            <option [value]="s.appUserId">{{ name(s) }}{{ s.fullName ? ' (' + s.username + ')' : '' }}</option>
          }
        </select>
      </app-field>
      <app-field label="Workspace" for="grantWorkspace">
        <select id="grantWorkspace" class="input" [value]="tenantId() ?? ''" (change)="tenantId.set(num($any($event.target).value))">
          <option value="">Choose a workspace</option>
          @for (t of data.tenants; track t.tenantId) {
            <option [value]="t.tenantId">{{ t.tenantName }}{{ t.managementMode === 'MANAGED' ? ' · managed' : '' }}</option>
          }
        </select>
      </app-field>
      @if (error()) { <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">{{ error() }}</p> }
    </app-form-dialog>
  `,
})
export class GrantDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<GrantDialogData>(DIALOG_DATA);
  private readonly api = inject(ManagedServiceApi);
  private readonly toast = inject(ToastService);

  readonly appUserId = signal<number | null>(this.data.appUserId ?? null);
  readonly tenantId = signal<number | null>(this.data.tenantId ?? null);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly ready = computed(() => !!this.appUserId() && !!this.tenantId() && !this.saving());
  readonly name = personName;

  num(value: string): number | null {
    const n = Number(value);
    return value && Number.isFinite(n) ? n : null;
  }

  save(): void {
    const appUserId = this.appUserId();
    const tenantId = this.tenantId();
    if (!appUserId || !tenantId || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.grant(tenantId, appUserId).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'Granted.');
          this.ref.close(true);
        } else {
          this.error.set(r.message || 'The grant was refused.');
        }
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'The grant could not be made.');
      },
    });
  }
}
