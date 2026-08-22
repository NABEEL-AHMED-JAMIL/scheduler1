import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';

const PROVIDERS = [
  { value: 'MINIO', label: 'MinIO',      hint: 'Self-hosted, S3-compatible object storage.' },
  { value: 'S3',    label: 'AWS S3',     hint: 'Leave the keys blank to use the host IAM role.' },
  { value: 'AZURE', label: 'Azure Blob', hint: 'Authenticates with a connection string.' },
  { value: 'FTP',   label: 'FTP',        hint: 'Plain FTP. Credentials travel unencrypted.' },
  { value: 'FTPS',  label: 'FTPS',       hint: 'FTP over TLS. Negotiates TLS 1.2.' },
];

@Component({
  selector: 'app-connection-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog],
  templateUrl: './connection-dialog.html',
})
export class ConnectionDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ connection?: any }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly providers = PROVIDERS;
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly discovering = signal(false);
  readonly discovered = signal<string[]>([]);
  readonly discoverError = signal('');

  readonly isEdit = computed(() => !!this.data.connection);
  readonly provider = signal<string>(this.data.connection?.provider ?? 'MINIO');

  readonly isFtp = computed(() => this.provider() === 'FTP' || this.provider() === 'FTPS');
  readonly isAzure = computed(() => this.provider() === 'AZURE');
  readonly isS3 = computed(() => this.provider() === 'S3');
  readonly isObjectStore = computed(() => !this.isFtp());

  readonly providerHint = computed(() =>
    PROVIDERS.find(p => p.value === this.provider())?.hint ?? '');

  /** A stored secret is never returned, so on edit an empty field means "keep the existing one". */
  readonly hasStoredSecret = computed(() =>
    !!(this.data.connection?.secretKeyConfigured || this.data.connection?.passwordConfigured
       || this.data.connection?.azureConnectionStringConfigured));

  readonly form: FormGroup = this.fb.group({
    storageConnectionId: [this.data.connection?.storageConnectionId ?? null],
    connectionName: [this.data.connection?.connectionName ?? '', Validators.required],
    alias: [this.data.connection?.alias ?? '', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]+$/)]],
    provider: [this.data.connection?.provider ?? 'MINIO', Validators.required],
    description: [this.data.connection?.description ?? ''],
    bucketName: [this.data.connection?.bucketName ?? ''],
    endpoint: [this.data.connection?.endpoint ?? ''],
    region: [this.data.connection?.region ?? ''],
    accessKey: [this.data.connection?.accessKey ?? ''],
    secretKey: [''],
    azureConnectionString: [''],
    host: [this.data.connection?.host ?? ''],
    port: [this.data.connection?.port ?? null],
    username: [this.data.connection?.username ?? ''],
    password: [''],
    baseDirectory: [this.data.connection?.baseDirectory ?? '/'],
    passiveMode: [this.data.connection?.passiveMode ?? true],
    implicitTls: [this.data.connection?.implicitTls ?? false],
    status: [this.data.connection?.status ?? 'Active'],
  });

  constructor() {
    this.form.get('provider')!.valueChanges.subscribe(value => {
      this.provider.set(value);
      this.discovered.set([]);
      this.discoverError.set('');
      // FTPS defaults to the implicit port so the common case needs no thought.
      if (value === 'FTPS' && !this.form.get('port')!.value) this.form.get('port')!.setValue(990);
      if (value === 'FTP' && !this.form.get('port')!.value) this.form.get('port')!.setValue(21);
    });
  }

  discover(): void {
    this.discovering.set(true);
    this.discoverError.set('');
    this.http.post<ApiResponse<string[]>>(`${API_BASE}/storageConnection.json/discoverBuckets`,
      this.form.getRawValue()).subscribe({
      next: response => {
        this.discovering.set(false);
        if (response.status === API_SUCCESS) {
          this.discovered.set(response.data ?? []);
          if (!(response.data ?? []).length) this.discoverError.set(response.message);
        } else {
          this.discoverError.set(response.message);
        }
      },
      error: err => {
        this.discovering.set(false);
        this.discoverError.set(err?.error?.message || 'Could not list buckets.');
      },
    });
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }

    const payload = { ...this.form.getRawValue() };
    // Blank secret fields are dropped so an edit doesn't overwrite a stored secret with "".
    for (const key of ['secretKey', 'password', 'azureConnectionString']) {
      if (!payload[key]) delete payload[key];
    }

    this.saving.set(true);
    const request = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/storageConnection.json/updateConnection`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/storageConnection.json/addConnection`, payload);

    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(this.isEdit() ? 'Connection updated.' : 'Connection created.');
          this.ref.close(true);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The connection could not be saved.');
      },
    });
  }
}
