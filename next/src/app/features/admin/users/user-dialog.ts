import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';

const ROLES = [
  { value: 'TENANT_USER',   label: 'Tenant user',   hint: 'Runs and monitors work.' },
  { value: 'TENANT_ADMIN',  label: 'Tenant admin',  hint: 'Also configures tasks, connections and users.' },
  { value: 'PLATFORM_ADMIN', label: 'Platform admin', hint: 'Operates across every tenant.' },
];

@Component({
  selector: 'app-user-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog],
  templateUrl: './user-dialog.html',
})
export class UserDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ user?: any; tenants: any[]; canPickTenant: boolean }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly roles = ROLES;
  readonly saving = signal(false);
  readonly submitted = signal(false);

  readonly isEdit = computed(() => !!this.data.user);
  readonly role = signal<string>(this.data.user?.userRole ?? 'TENANT_USER');

  /** A platform admin spans every tenant, so a tenant choice would be meaningless. */
  readonly needsTenant = computed(() => this.role() !== 'PLATFORM_ADMIN');
  readonly roleHint = computed(() => ROLES.find(r => r.value === this.role())?.hint ?? '');

  readonly form: FormGroup = this.fb.group({
    appUserId: [this.data.user?.appUserId ?? null],
    fullName: [this.data.user?.fullName ?? '', Validators.required],
    position: [this.data.user?.position ?? ''],
    username: [this.data.user?.username ?? '', [Validators.required, Validators.email]],
    password: ['', this.data.user ? [] : [Validators.required, Validators.minLength(8)]],
    userRole: [this.data.user?.userRole ?? 'TENANT_USER', Validators.required],
    tenantId: [this.data.user?.tenantId ?? null],
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
    if (this.needsTenant() && this.data.canPickTenant && !this.form.get('tenantId')!.value) {
      this.toast.error('Choose a tenant for this user.');
      return;
    }

    const payload: any = { ...this.form.getRawValue() };
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
          this.toast.success(this.isEdit() ? 'User updated.' : 'User created.');
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
