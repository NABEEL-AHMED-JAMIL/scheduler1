import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { DbConnection } from './types';

@Component({
  selector: 'app-db-connection-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Icon],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit database connection' : 'New database connection'"
        subtitle="Where queries run. The password is encrypted and never sent back."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">

      <ng-container footer-start>
        <button type="button" class="btn btn-default btn-sm btn-intent-ok"
                [disabled]="testing() || saving()" (click)="test()">
          <app-icon [name]="testing() ? 'refresh' : 'plug'" [class.spin]="testing()" />
          {{ testing() ? 'Testing…' : 'Test connection' }}
        </button>
      </ng-container>

      <form [formGroup]="form" class="form-stack">
        @if (testResult(); as result) {
          <div class="card flex items-start gap-2 px-3 py-2.5 text-sm"
               [style.border-color]="result.ok ? 'var(--color-ok-500)' : 'var(--color-crit-500)'">
            <app-icon [name]="result.ok ? 'checkCircle' : 'xCircle'"
                      [class]="result.ok ? 'icon-ok' : 'icon-crit'" class="mt-0.5 shrink-0" />
            <span>{{ result.message }}</span>
          </div>
        }

        <app-field label="Profile name" for="profileName" [required]="true"
                   [control]="form.get('profileName')" [submitted]="submitted()">
          <input id="profileName" class="input" formControlName="profileName"
                 placeholder="Reporting replica" />
        </app-field>

        <div class="form-grid">
          <app-field label="Database type" for="databaseType" [control]="form.get('databaseType')"
                     [submitted]="submitted()" hint="PostgreSQL is the only engine supported today.">
            <select id="databaseType" class="input" formControlName="databaseType">
              <option value="POSTGRES">PostgreSQL</option>
            </select>
          </app-field>

          <app-field label="Host" for="host" [required]="true"
                     [control]="form.get('host')" [submitted]="submitted()">
            <input id="host" class="input mono" formControlName="host" placeholder="db.internal" />
          </app-field>

          <app-field label="Port" for="port" [required]="true"
                     [control]="form.get('port')" [submitted]="submitted()">
            <input id="port" type="number" class="input mono" formControlName="port" placeholder="5432" />
          </app-field>

          <app-field label="Database" for="databaseName" [required]="true"
                     [control]="form.get('databaseName')" [submitted]="submitted()">
            <input id="databaseName" class="input mono" formControlName="databaseName" placeholder="reporting" />
          </app-field>

          <app-field label="Username" for="username" [required]="true"
                     [control]="form.get('username')" [submitted]="submitted()">
            <input id="username" class="input" formControlName="username" autocomplete="off" placeholder="db user" />
          </app-field>

          <app-field label="Password" for="password"
                     [required]="!data.connection?.passwordConfigured"
                     [control]="form.get('password')" [submitted]="submitted()"
                     [hint]="data.connection?.passwordConfigured
                       ? 'Already set. Leave blank to keep it.'
                       : 'Stored encrypted; never shown again.'">
            <input id="password" type="password" class="input" formControlName="password"
                   autocomplete="new-password"
                   [placeholder]="data.connection?.passwordConfigured ? '••••••••' : ''" />
          </app-field>
        </div>

        <app-field label="Additional properties" for="additionalProperties"
                   [control]="form.get('additionalProperties')" [submitted]="submitted()"
                   hint="One key=value per line, appended to the JDBC URL.">
          <textarea id="additionalProperties" class="input mono" rows="2"
                    formControlName="additionalProperties" placeholder="sslmode=require"></textarea>
        </app-field>

        <app-field label="Status" for="dbStatus" [control]="form.get('status')" [submitted]="submitted()">
          <select id="dbStatus" class="input" formControlName="status">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </app-field>
      </form>
    </app-form-dialog>
  `,
})
export class DbConnectionDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ connection?: DbConnection }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly submitted = signal(false);
  readonly testResult = signal<{ ok: boolean; message: string } | null>(null);
  readonly isEdit = computed(() => !!this.data.connection);

  readonly form: FormGroup = this.fb.group({
    databaseConnectionProfileId: [this.data.connection?.databaseConnectionProfileId ?? null],
    profileName: [this.data.connection?.profileName ?? '', Validators.required],
    databaseType: [this.data.connection?.databaseType ?? 'POSTGRES'],
    host: [this.data.connection?.host ?? '', Validators.required],
    port: [this.data.connection?.port ?? 5432, Validators.required],
    databaseName: [this.data.connection?.databaseName ?? '', Validators.required],
    username: [this.data.connection?.username ?? '', Validators.required],
    password: [''],
    additionalProperties: [this.data.connection?.additionalProperties ?? ''],
    status: [this.data.connection?.status ?? 'Active'],
  });

  private payload(): any {
    const raw = this.form.getRawValue();
    raw.port = Number(raw.port);
    if (!raw.password) delete raw.password;
    return raw;
  }

  test(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Fill in the required fields before testing.');
      return;
    }
    this.testing.set(true);
    this.testResult.set(null);
    this.http.post<ApiResponse>(`${API_BASE}/queryEngine.json/connections/testConnection`, this.payload())
      .subscribe({
        next: r => { this.testing.set(false); this.testResult.set({ ok: r.status === API_SUCCESS, message: r.message }); },
        error: e => { this.testing.set(false); this.testResult.set({ ok: false, message: e?.error?.message || 'The database could not be reached.' }); },
      });
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    this.saving.set(true);
    const req = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/queryEngine.json/connections/update`, this.payload())
      : this.http.post<ApiResponse>(`${API_BASE}/queryEngine.json/connections/add`, this.payload());
    req.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.ref.close(true); }
        else this.toast.error(r.message);
      },
      error: e => { this.saving.set(false); this.toast.error(e?.error?.message || 'The connection could not be saved.'); },
    });
  }
}
