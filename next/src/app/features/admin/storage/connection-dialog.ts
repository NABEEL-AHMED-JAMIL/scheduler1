import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { kafkaDependencyNote, kafkaProfilesUsing } from './kafka-dependents';

/**
 * Azure takes either a connection string or an account name plus account key, so neither field
 * can carry a required validator of its own -- it is the pair that has to be there. The error
 * sits on the connection string because that is the field the Azure section leads with.
 */
const azureCredentialPresent = (control: AbstractControl): ValidationErrors | null => {
  const group = control.parent;
  if (!group) return null;
  const accountName = String(group.get('azureAccountName')?.value ?? '').trim();
  return String(control.value ?? '').trim() || accountName ? null : { azureCredential: true };
};

/**
 * What an alias may contain. Jobs, tasks and Kafka profiles reference a connection by this string
 * alone, so it is held to characters that survive a path and a properties file unquoted. Exported
 * because the clone dialog mints an alias of its own, and a rule enforced on one of the two ways
 * of creating a connection is not a rule.
 */
export const ALIAS_PATTERN = /^[a-zA-Z0-9._-]+$/;

const PROVIDERS = [
  { value: 'MINIO', label: 'MinIO',      hint: 'Self-hosted, S3-compatible object storage.' },
  { value: 'S3',    label: 'AWS S3',     hint: 'Needs an access key and secret key of its own.' },
  { value: 'AZURE', label: 'Azure Blob', hint: 'A connection string, or an account name plus key.' },
  { value: 'FTP',   label: 'FTP',        hint: 'Plain FTP. Credentials travel unencrypted.' },
  { value: 'FTPS',  label: 'FTPS',       hint: 'FTP over TLS. Negotiates TLS 1.2.' },
];

@Component({
  selector: 'app-connection-dialog',
  imports: [Icon, ReactiveFormsModule, Field, FormDialog],
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
  readonly status = signal<string>(this.data.connection?.status ?? 'Active');

  /** Kafka profiles that load a keystore or truststore from this connection's alias. */
  readonly dependentProfiles = signal<string[]>([]);
  private dependentsRequested = false;

  readonly isFtp = computed(() => this.provider() === 'FTP' || this.provider() === 'FTPS');
  readonly isAzure = computed(() => this.provider() === 'AZURE');
  readonly isS3 = computed(() => this.provider() === 'S3');
  readonly isObjectStore = computed(() => !this.isFtp());

  readonly providerHint = computed(() =>
    PROVIDERS.find(p => p.value === this.provider())?.hint ?? '');

  /** Names what an Inactive save would break, or '' when nothing depends on this connection. */
  readonly dependentWarning = computed(() => {
    if (this.status() !== 'Inactive') return '';
    const note = kafkaDependencyNote(this.dependentProfiles());
    return note
      ? `${note} An Inactive connection is not resolved, so their next publish will fail.`
      : '';
  });

  /** A stored secret is never returned, so on edit an empty field means "keep the existing one". */
  readonly hasStoredSecret = computed(() =>
    !!(this.data.connection?.secretKeyConfigured || this.data.connection?.passwordConfigured
       || this.data.connection?.azureConnectionStringConfigured));

  /**
   * The two Azure credentials are asked for separately, so they are answered separately.
   *
   * hasStoredSecret is true when any one of them is set, which is the right question for a
   * provider with a single secret and the wrong one here: an account credentialled by a
   * connection string would have told the Account key box "leave blank to keep the stored key"
   * with no key stored at all, and the reader would have left an Azure connection with an account
   * name and nothing to sign requests with.
   */
  readonly hasStoredAzureString = computed(() =>
    !!this.data.connection?.azureConnectionStringConfigured);
  readonly hasStoredAzureKey = computed(() => !!this.data.connection?.secretKeyConfigured);

  readonly form: FormGroup = this.fb.group({
    storageConnectionId: [this.data.connection?.storageConnectionId ?? null],
    connectionName: [this.data.connection?.connectionName ?? '', Validators.required],
    alias: [this.data.connection?.alias ?? '', [Validators.required, Validators.pattern(ALIAS_PATTERN)]],
    provider: [this.data.connection?.provider ?? 'MINIO', Validators.required],
    description: [this.data.connection?.description ?? ''],
    bucketName: [this.data.connection?.bucketName ?? ''],
    endpoint: [this.data.connection?.endpoint ?? ''],
    region: [this.data.connection?.region ?? ''],
    accessKey: [this.data.connection?.accessKey ?? ''],
    secretKey: [''],
    // Carried through an edit deliberately. The server treats a blank one as "leave it alone",
    // the same footing as the account key it pairs with, so a form that opened empty and posted
    // empty would leave the box saying the account has no name while the row still had one.
    azureAccountName: [this.data.connection?.azureAccountName ?? ''],
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
    this.applyProviderRules();
    this.form.get('provider')!.valueChanges.subscribe(value => {
      this.provider.set(value);
      this.discovered.set([]);
      this.discoverError.set('');
      // FTPS defaults to the implicit port so the common case needs no thought.
      if (value === 'FTPS' && !this.form.get('port')!.value) this.form.get('port')!.setValue(990);
      if (value === 'FTP' && !this.form.get('port')!.value) this.form.get('port')!.setValue(21);
      this.applyProviderRules();
    });
    // The account name is the other half of the Azure credential pair, so filling it in has to
    // clear the complaint sitting on the connection string.
    this.form.get('azureAccountName')!.valueChanges.subscribe(() =>
      this.form.get('azureConnectionString')!.updateValueAndValidity({ emitEvent: false }));
    this.form.get('status')!.valueChanges.subscribe(value => {
      this.status.set(value);
      if (value === 'Inactive') this.loadDependentProfiles();
    });
  }

  /**
   * Mirrors the server's per-provider rules onto the form.
   *
   * Without them the dialog submits a form it knows is incomplete and the only feedback is a
   * toast at the edge of the screen, with nothing marked on the field that caused it. Re-run on
   * every provider change, since a rule that applies to MinIO must not survive a switch to FTP.
   */
  private applyProviderRules(): void {
    const provider = this.provider();
    const ftp = provider === 'FTP' || provider === 'FTPS';
    this.setRequired('bucketName', !ftp);
    this.setRequired('endpoint', provider === 'MINIO');
    this.setRequired('host', ftp);
    this.setRequired('username', ftp);
    // On edit a blank password means "keep the stored one", so it is only required on create.
    this.setRequired('password', ftp && !this.isEdit());
    // S3 no longer falls back to the host IAM role, so blank keys are a server error rather
    // than a choice. The one deployment that opts back into ambient credentials can only do so
    // for platform-level connections, and the browser cannot tell whether it did -- asking for
    // the keys there costs a platform admin two fields they could have left empty, which is the
    // better half of the trade against every other tenant getting a 400 with nothing marked.
    this.setRequired('accessKey', provider === 'S3');
    this.setRequired('secretKey', provider === 'S3' && !this.isEdit());
    const azure = this.form.get('azureConnectionString')!;
    provider === 'AZURE' && !this.isEdit()
      ? azure.setValidators(azureCredentialPresent)
      : azure.clearValidators();
    azure.updateValueAndValidity({ emitEvent: false });
  }

  private setRequired(name: string, required: boolean): void {
    const control = this.form.get(name)!;
    required ? control.setValidators(Validators.required) : control.clearValidators();
    control.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * Looks up what an Inactive save would break, the first time Inactive is chosen. Asked lazily
   * so the ordinary edit costs no extra request, and asked once so flicking the select back and
   * forth does not repeat it.
   */
  private async loadDependentProfiles(): Promise<void> {
    if (this.dependentsRequested || !this.isEdit()) return;
    this.dependentsRequested = true;
    this.dependentProfiles.set(
      await kafkaProfilesUsing(this.http, this.data.connection?.alias ?? ''));
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
