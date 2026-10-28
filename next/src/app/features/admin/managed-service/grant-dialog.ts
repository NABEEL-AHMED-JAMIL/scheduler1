import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ManagementMode } from '../../../core/auth/auth.models';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { ManagedServiceApi, StaffCandidate, personName, staffOption } from './managed-service.api';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';
import { idOf, idValue } from '../../../shared/ui/advanced-options';

export interface GrantWorkspace { tenantId: number; tenantName: string; managementMode?: ManagementMode | null }

export interface GrantDialogData {
  staff: StaffCandidate[];
  tenants: GrantWorkspace[];
  /** Preselected from the page's filters, when one is set. */
  tenantId?: number | null;
  appUserId?: number | null;
  /** Owner 2026-10-27: why a list could not be read, said under its field instead of an empty list read as "none". */
  staffError?: string;
  tenantsError?: string;
}

/**
 * MIG-254: grant one staff member (an active platform administrator) the right to work in one workspace.
 * Closes with true once the server has granted it (or had already), and stays open with its reason otherwise.
 */
@Component({
  selector: 'app-grant-dialog',
  imports: [Field, FormDialog, AdvancedSelect],
  template: `
    <app-form-dialog heading="Grant a workspace"
        subtitle="The staff member can then open a managed session there. Every change they make is audited."
        confirmLabel="Grant" busyLabel="Granting…" [saving]="saving()" [confirmDisabled]="!ready()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <app-field label="Staff member" for="grantStaff"
          [hint]="data.staffError ? data.staffError + ' Close and try again.' : data.staff.length ? 'Active platform administrators.' : 'No active platform administrator to grant.'">
        <app-advanced-select id="grantStaff" [options]="staffOptions" [value]="idValue(appUserId())" (valueChange)="appUserId.set(idOf($event))"
                             cdkFocusInitial placeholder="Choose a staff member" searchLabel="Search the staff"
                             searchPlaceholder="Search by name or sign-in" [emptyText]="data.staffError || 'No active platform administrator to grant.'" />
      </app-field>
      <app-field label="Workspace" for="grantWorkspace" [hint]="data.tenantsError ? data.tenantsError + ' Close and try again.' : ''">
        <app-advanced-select id="grantWorkspace" [options]="workspaceOptions" [value]="idValue(tenantId())" (valueChange)="tenantId.set(idOf($event))"
                             placeholder="Choose a workspace" searchLabel="Search the workspaces" searchPlaceholder="Search by name or number"
                             [emptyText]="data.tenantsError || 'No workspace to grant.'" />
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
  /** The dialog's lists are fixed while it is open: the staff by name with their sign-in name, the workspaces with their mode. */
  readonly staffOptions: AdvancedOption[] = this.data.staff.map(staffOption);
  readonly workspaceOptions: AdvancedOption[] = this.data.tenants.map(t => ({
    value: String(t.tenantId), label: t.tenantName, keywords: String(t.tenantId),
    badge: t.managementMode === 'MANAGED' ? 'Managed' : undefined, badgeTone: 'info' as const }));
  readonly idValue = idValue;
  readonly idOf = idOf;

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
