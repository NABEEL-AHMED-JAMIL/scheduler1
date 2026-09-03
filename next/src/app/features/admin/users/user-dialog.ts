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
import { ROLE_META, UserRole } from '../../../core/auth/auth.models';

/**
 * The picker's options, taken from the table that already names every role rather than said a
 * second time here. The local copy carried the same three labels and hints word for word, so a
 * reworded hint -- or a fourth role -- had to be remembered in two places and the users list
 * and this dialog could quietly come to disagree about what a role is called.
 *
 * ROLE_META is written user-first and Object.entries keeps that order, which is what puts the
 * least privilege at the top of the list.
 */
const ROLES = Object.entries(ROLE_META).map(([value, meta]) => ({
  value: value as UserRole,
  label: meta.label,
  hint: meta.hint,
}));

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

  /** Whether the row being edited is the signed-in administrator's own. */
  readonly isSelf = computed(() => {
    const mine = this.auth.user()?.appUserId;
    return mine != null && this.data.user?.appUserId === mine;
  });

  /**
   * Only the roles this administrator can actually grant.
   *
   * addUser refuses "Only a Platform Admin can create another Platform Admin", so offering the
   * option to a tenant admin meant filling in the whole form to be told no at the end. The
   * server check is the one that matters and stays where it is; this stops the console
   * proposing something it knows will be refused.
   *
   * A tenant admin staffs its workspace with tenant users and nothing above them -- granting a
   * second set of keys to everything the workspace holds is the platform's decision -- so that
   * is the one option it is offered. The role the edited row already carries is kept in the list
   * whatever it is: the console posts the whole form back, resubmitting an unchanged role grants
   * nothing and the server allows it, and dropping the option would leave an admin editing their
   * own name through a picker showing no role at all.
   *
   * Your own row is the exception, and it comes first because it binds a platform admin too:
   * updateUser refuses any role but the one already held -- "You cannot change your own role" --
   * so a picker offering a second option there can only ever lose somebody the whole form. The
   * one option it does offer is the one the server accepts, which is what keeps the field
   * readable while you edit your own name.
   */
  readonly roles = computed(() => {
    const current = this.data.user?.userRole as UserRole | undefined;
    if (current && this.isSelf()) {
      return ROLES.filter(r => r.value === current);
    }
    if (this.auth.isPlatformAdmin()) {
      return ROLES;
    }
    return ROLES.filter(r => r.value === 'TENANT_USER' || r.value === current);
  });

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
  /** UserRole rather than string: every comparison below is against a role literal, and a
      mistyped one used to compile happily and simply never match. */
  readonly role = signal<UserRole>(this.data.user?.userRole ?? 'TENANT_USER');

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
    // The select is fed from ROLES, so the only values it can emit are the three role literals.
    this.form.get('userRole')!.valueChanges.subscribe((value: UserRole) => this.role.set(value));
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
