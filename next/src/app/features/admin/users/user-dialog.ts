import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { PhoneInput } from '../../../shared/ui/phone-input';
import { AuthService } from '../../../core/auth/auth.service';

const ROLES = [
  { value: 'TENANT_USER',   label: 'Tenant user',   hint: 'Runs and monitors work.' },
  { value: 'TENANT_ADMIN',  label: 'Tenant admin',  hint: 'Also configures tasks, connections and users.' },
  { value: 'PLATFORM_ADMIN', label: 'Platform admin', hint: 'Operates across every tenant.' },
];

@Component({
  selector: 'app-user-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, PhoneInput],
  templateUrl: './user-dialog.html',
})
export class UserDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ user?: any; tenants: any[]; canPickTenant: boolean }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  private readonly auth = inject(AuthService);

  /**
   * Only the roles this administrator can actually grant.
   *
   * addUser refuses "Only a Platform Admin can create another Platform Admin", so offering the
   * option to a tenant admin meant filling in the whole form to be told no at the end. The
   * server check is the one that matters and stays where it is; this stops the console
   * proposing something it knows will be refused.
   */
  readonly roles = computed(() => this.auth.isPlatformAdmin()
    ? ROLES
    : ROLES.filter(r => r.value !== 'PLATFORM_ADMIN'));
  /** E.164, owned by the phone component -- it validates against the same metadata the
      server does, so a second Validators rule here could only be a weaker copy. */
  readonly phone = signal<string>(this.data.user?.phoneNumber ?? '');

  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly isEdit = computed(() => !!this.data.user);

  /**
   * Whether the workspace is settled and no longer up for changing.
   *
   * True only when editing somebody who already has one. A platform admin has none, so demoting
   * one has to leave the field usable -- otherwise it submits null and the server refuses with
   * "a tenant is required for this role", which reads as a bug rather than a rule.
   */
  readonly tenantLocked = computed(() => this.isEdit() && this.data.user?.tenantId != null);
  readonly role = signal<string>(this.data.user?.userRole ?? 'TENANT_USER');

  /** A platform admin spans every tenant, so a tenant choice would be meaningless. */
  readonly needsTenant = computed(() => this.role() !== 'PLATFORM_ADMIN');
  readonly roleHint = computed(() => ROLES.find(r => r.value === this.role())?.hint ?? '');

  readonly form: FormGroup = this.fb.group({
    appUserId: [this.data.user?.appUserId ?? null],
    fullName: [this.data.user?.fullName ?? '', Validators.required],
    position: [this.data.user?.position ?? ''],
    username: [this.data.user?.username ?? '', [Validators.required, Validators.email]],
    // Optional in both directions now: blank on a new user means the server generates one and
    // emails it, which is the better path and so is the default. minLength still applies to a
    // value that was actually typed -- Angular's minLength passes an empty control.
    password: ['', [Validators.minLength(8)]],
    userRole: [this.data.user?.userRole ?? 'TENANT_USER', Validators.required],
    // Disabled when editing: a workspace move re-parents everything the person is attached to,
    // and it is not a thing to do by brushing past a dropdown in an edit dialog. Shown rather
    // than hidden, because which workspace somebody belongs to is worth seeing while you edit
    // them. getRawValue still includes it, so the server receives the unchanged value.
    tenantId: [{ value: this.data.user?.tenantId ?? null,
                 disabled: !!this.data.user && this.data.user.tenantId != null }],
    status: [this.data.user?.status ?? 'Active'],
  });

  constructor() {
    this.form.get('userRole')!.valueChanges.subscribe(v => this.role.set(v));
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    // getRawValue, not .value: a disabled control reports null, which would make editing an
    // existing user fail this check every time.
    // Only when the field is actually theirs to fill: a locked one already holds a value, and a
    // disabled control reports null through .value, so getRawValue is what to ask.
    if (!this.tenantLocked() && this.needsTenant() && this.data.canPickTenant
        && !this.form.getRawValue().tenantId) {
      this.toast.error('Choose a tenant for this user.');
      return;
    }

    const payload: any = { ...this.form.getRawValue() };
    // Sent as E.164; the server re-validates rather than trusting what the browser built.
    payload.phoneNumber = this.phone() || null;
    if (!payload.password) delete payload.password;
    if (!this.needsTenant()) payload.tenantId = null;

    this.saving.set(true);
    const request = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/appUser.json/updateUser`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/appUser.json/addUser`, payload);

    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          // The server's own words, not a fixed string: creating a user now sends mail, and
          // "created, but the welcome email could not be sent -- reset their password and pass
          // it on another way" is the one message an administrator must not miss.
          this.toast.success(response.message
            || (this.isEdit() ? 'User updated.' : 'User created.'));
          this.ref.close(true);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The user could not be saved.');
      },
    });
  }
}
