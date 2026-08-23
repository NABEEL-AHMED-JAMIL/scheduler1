import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { KafkaProfile } from './kafka-connections';
import { BucketSummary, StorageService } from '../../objects/storage.service';
import { copyText } from '../../../shared/ui/clipboard.util';

const SECURITY_PROTOCOLS = ['PLAINTEXT', 'SASL_PLAINTEXT', 'SASL_SSL', 'SSL'];
const SASL_MECHANISMS = ['PLAIN', 'SCRAM-SHA-256', 'SCRAM-SHA-512'];

@Component({
  selector: 'app-kafka-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Icon],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit Kafka profile' : 'New Kafka profile'"
        subtitle="Where a task publishes and consumes. Secrets are stored encrypted."
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

        <div class="form-grid">
          <app-field label="Profile name" for="profileName" [required]="true"
                     [control]="form.get('profileName')" [submitted]="submitted()">
            <input id="profileName" class="input" formControlName="profileName"
                   placeholder="Production cluster" />
          </app-field>

          <app-field label="Environment label" for="environmentLabel"
                     [control]="form.get('environmentLabel')" [submitted]="submitted()"
                     hint="Free text shown beside the name, e.g. staging.">
            <input id="environmentLabel" class="input" formControlName="environmentLabel"
                   placeholder="staging" />
          </app-field>
        </div>

        <app-field label="Bootstrap servers" for="bootstrapServers" [required]="true"
                   [control]="form.get('bootstrapServers')" [submitted]="submitted()"
                   hint="host:port, comma-separated for more than one broker.">
          <input id="bootstrapServers" class="input mono" formControlName="bootstrapServers"
                 placeholder="broker-1:9092,broker-2:9092" />
        </app-field>

        <div class="form-section">
          <div class="form-section-title">Security</div>
          <div class="form-grid">
            <app-field label="Security protocol" for="securityProtocol" [required]="true"
                       [control]="form.get('securityProtocol')" [submitted]="submitted()">
              <select id="securityProtocol" class="input" formControlName="securityProtocol">
                @for (p of protocols; track p) { <option [value]="p">{{ p }}</option> }
              </select>
            </app-field>

            @if (needsSasl()) {
              <app-field label="SASL mechanism" for="saslMechanism" [required]="true"
                         [control]="form.get('saslMechanism')" [submitted]="submitted()">
                <select id="saslMechanism" class="input" formControlName="saslMechanism">
                  @for (m of mechanisms; track m) { <option [value]="m">{{ m }}</option> }
                </select>
              </app-field>
            }
          </div>

          @if (protocol() === 'PLAINTEXT') {
            <p class="field-note text-warn-500 flex items-start gap-1.5 mt-3">
              <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
              <span>PLAINTEXT sends everything unencrypted, credentials included. Use it only on a trusted network.</span>
            </p>
          }
        </div>

        @if (needsSasl()) {
          <div class="form-section">
            <div class="form-section-title">SASL credentials</div>
            <div class="form-grid">
              <app-field label="Username" for="saslUsername" [required]="true"
                         [control]="form.get('saslUsername')" [submitted]="submitted()">
                <input id="saslUsername" class="input" formControlName="saslUsername" autocomplete="off" placeholder="kafka user" />
              </app-field>

              <app-field label="Password" for="saslPassword"
                         [required]="!data.profile?.saslPasswordConfigured"
                         [control]="form.get('saslPassword')" [submitted]="submitted()"
                         [hint]="secretHint(data.profile?.saslPasswordConfigured)">
                <input id="saslPassword" type="password" class="input" formControlName="saslPassword"
                       autocomplete="new-password"
                       [placeholder]="data.profile?.saslPasswordConfigured ? '••••••••' : ''" />
              </app-field>
            </div>
          </div>
        }

        @if (needsSsl()) {
          <div class="form-section">
            <div class="form-section-title">
              TLS material
              <button type="button" class="btn btn-ghost btn-sm ml-auto"
                      (click)="showGuide.set(!showGuide())">
                <app-icon name="info" class="icon-info" />
                {{ showGuide() ? 'Hide' : 'How do I get these files?' }}
              </button>
            </div>

            @if (showGuide()) {
              <div class="guide">
                <p class="guide-lead">
                  A truststore tells this client which broker certificates to trust. A keystore
                  is only needed when the broker asks the client to prove who it is (mTLS).
                  Both are files you generate once, then upload here.
                </p>

                <ol class="guide-steps">
                  <li>
                    <strong>Get the broker's certificate.</strong> Your Kafka provider supplies
                    it — on AWS MSK it is the Amazon root CA, on Confluent Cloud the public
                    root is already trusted and you can skip to SASL_SSL with no truststore.
                    <div class="guide-cmd">
                      <code class="guide-code">{{ commands.fetchCert }}</code>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0"
                              title="Copy command" (click)="copyCommand(commands.fetchCert)">
                        <app-icon name="copy" size="0.9em" />
                      </button>
                    </div>
                  </li>
                  <li>
                    <strong>Turn it into a truststore.</strong> Pick a password and keep it —
                    it goes in the Truststore password field.
                    <div class="guide-cmd">
                      <code class="guide-code">{{ commands.truststore }}</code>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0"
                              title="Copy command" (click)="copyCommand(commands.truststore)">
                        <app-icon name="copy" size="0.9em" />
                      </button>
                    </div>
                  </li>
                  <li>
                    <strong>Only for mTLS — make a keystore</strong> from the client certificate
                    and private key your provider issued.
                    <div class="guide-cmd">
                      <code class="guide-code">{{ commands.keystore }}</code>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0"
                              title="Copy command" (click)="copyCommand(commands.keystore)">
                        <app-icon name="copy" size="0.9em" />
                      </button>
                    </div>
                  </li>
                  <li>
                    <strong>Choose a bucket and upload.</strong> Pick a storage connection
                    below, choose the file, and press Upload — the path fills itself in. Files
                    land under <code class="guide-inline">kafka-secrets/</code> in that bucket.
                  </li>
                  <li>
                    <strong>Enter the passwords</strong> you chose, then press Test connection
                    before saving.
                  </li>
                </ol>

                <p class="guide-note">
                  <app-icon name="shield" size="0.95em" class="icon-warn" />
                  Passwords are stored encrypted and never sent back to this screen — an
                  existing one shows as dots and stays unless you type a new value.
                </p>
              </div>
            }
            <div class="form-grid">
              <app-field label="Truststore bucket" for="sslTruststoreBucket"
                         [control]="form.get('sslTruststoreBucket')" [submitted]="submitted()"
                         hint="The storage connection the broker's truststore lives in.">
                <select id="sslTruststoreBucket" class="input" formControlName="sslTruststoreBucket">
                  <option value="">Choose a bucket</option>
                  @for (b of buckets(); track b.bucket) {
                    <option [value]="b.bucket">{{ b.label || b.bucket }} · {{ b.provider }}</option>
                  }
                </select>
              </app-field>

              <app-field label="Truststore path" for="sslTruststoreLocation"
                         [control]="form.get('sslTruststoreLocation')" [submitted]="submitted()"
                         hint="Upload a file below, or paste the key of one already in the bucket.">
                <input id="sslTruststoreLocation" class="input mono" formControlName="sslTruststoreLocation"
                       placeholder="kafka-secrets/truststore.p12" />
              </app-field>

              <div class="upload-row sm:col-span-2">
                <input type="file" class="input" accept=".p12,.jks,.pfx" #truststoreFile
                       [disabled]="!form.get('sslTruststoreBucket')?.value" />
                <button type="button" class="btn btn-default btn-sm shrink-0"
                        [disabled]="uploading() !== null || !form.get('sslTruststoreBucket')?.value"
                        (click)="uploadStore('truststore', truststoreFile)">
                  <app-icon name="upload" [class.spin]="uploading() === 'truststore'" />
                  {{ uploading() === 'truststore' ? 'Uploading…' : 'Upload truststore' }}
                </button>
              </div>

              <app-field label="Truststore password" for="sslTruststorePassword"
                         [control]="form.get('sslTruststorePassword')" [submitted]="submitted()"
                         [hint]="secretHint(data.profile?.sslTruststorePasswordConfigured)">
                <input id="sslTruststorePassword" type="password" class="input"
                       formControlName="sslTruststorePassword" autocomplete="new-password"
                       [placeholder]="data.profile?.sslTruststorePasswordConfigured ? '••••••••' : ''" />
              </app-field>

              <app-field label="Keystore bucket" for="sslKeystoreBucket"
                         [control]="form.get('sslKeystoreBucket')" [submitted]="submitted()"
                         hint="Only needed when the broker asks the client for a certificate.">
                <select id="sslKeystoreBucket" class="input" formControlName="sslKeystoreBucket">
                  <option value="">Choose a bucket</option>
                  @for (b of buckets(); track b.bucket) {
                    <option [value]="b.bucket">{{ b.label || b.bucket }} · {{ b.provider }}</option>
                  }
                </select>
              </app-field>

              <app-field label="Keystore path" for="sslKeystoreLocation"
                         [control]="form.get('sslKeystoreLocation')" [submitted]="submitted()"
                         hint="Upload a file below, or paste the key of one already in the bucket.">
                <input id="sslKeystoreLocation" class="input mono" formControlName="sslKeystoreLocation"
                       placeholder="kafka-secrets/keystore.p12" />
              </app-field>

              <div class="upload-row sm:col-span-2">
                <input type="file" class="input" accept=".p12,.jks,.pfx" #keystoreFile
                       [disabled]="!form.get('sslKeystoreBucket')?.value" />
                <button type="button" class="btn btn-default btn-sm shrink-0"
                        [disabled]="uploading() !== null || !form.get('sslKeystoreBucket')?.value"
                        (click)="uploadStore('keystore', keystoreFile)">
                  <app-icon name="upload" [class.spin]="uploading() === 'keystore'" />
                  {{ uploading() === 'keystore' ? 'Uploading…' : 'Upload keystore' }}
                </button>
              </div>

              <app-field label="Keystore password" for="sslKeystorePassword"
                         [control]="form.get('sslKeystorePassword')" [submitted]="submitted()"
                         [hint]="secretHint(data.profile?.sslKeystorePasswordConfigured)">
                <input id="sslKeystorePassword" type="password" class="input"
                       formControlName="sslKeystorePassword" autocomplete="new-password"
                       [placeholder]="data.profile?.sslKeystorePasswordConfigured ? '••••••••' : ''" />
              </app-field>

              <app-field label="Key password" for="sslKeyPassword"
                         [control]="form.get('sslKeyPassword')" [submitted]="submitted()"
                         [hint]="secretHint(data.profile?.sslKeyPasswordConfigured)">
                <input id="sslKeyPassword" type="password" class="input"
                       formControlName="sslKeyPassword" autocomplete="new-password"
                       [placeholder]="data.profile?.sslKeyPasswordConfigured ? '••••••••' : ''" />
              </app-field>
            </div>
          </div>
        }

        <div class="form-section">
          <div class="form-section-title">Advanced</div>
          <app-field label="Additional properties" for="additionalProperties"
                     [control]="form.get('additionalProperties')" [submitted]="submitted()"
                     hint="One key=value per line, passed straight to the Kafka client.">
            <textarea id="additionalProperties" class="input mono" rows="3"
                      formControlName="additionalProperties"
                      placeholder="request.timeout.ms=30000"></textarea>
          </app-field>

          <app-field label="Status" for="kafkaStatus" [control]="form.get('status')"
                     [submitted]="submitted()">
            <select id="kafkaStatus" class="input" formControlName="status">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </app-field>
        </div>
      </form>
    </app-form-dialog>
  `,
})
export class KafkaDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ profile?: KafkaProfile }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly protocols = SECURITY_PROTOCOLS;
  readonly mechanisms = SASL_MECHANISMS;

  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly submitted = signal(false);
  readonly testResult = signal<{ ok: boolean; message: string } | null>(null);
  readonly isEdit = computed(() => !!this.data.profile);

  /** Where uploaded TLS material lands, matching the convention the legacy screen used. */
  private static readonly SECRET_PREFIX = 'kafka-secrets/';

  private readonly storage = inject(StorageService);
  readonly buckets = signal<BucketSummary[]>([]);
  readonly uploading = signal<'truststore' | 'keystore' | null>(null);
  readonly showGuide = signal(false);

  /** The commands are meant to be pasted into a terminal, so each is copyable rather than
      something to retype from a box that scrolls sideways. */
  readonly commands = {
    fetchCert: 'openssl s_client -connect BROKER:9093 -showcerts </dev/null | openssl x509 > broker.pem',
    truststore: 'keytool -import -alias kafka-broker -file broker.pem \\\n  -keystore truststore.p12 -storetype PKCS12 -storepass CHOOSE_ONE',
    keystore: 'openssl pkcs12 -export -in client.crt -inkey client.key \\\n  -out keystore.p12 -passout pass:CHOOSE_ONE',
  };

  async copyCommand(command: string): Promise<void> {
    if (await copyText(command)) this.toast.success('Command copied.');
    else this.toast.error('Could not copy the command.');
  }

  constructor() {
    // The bucket was a free-text box, so it had to be typed from memory and a typo only
    // surfaced when the broker connection failed. These are the same storage connections
    // the object browser lists.
    this.storage.buckets().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.buckets.set(r.data ?? []); },
      error: () => { /* the field falls back to accepting a typed alias */ },
    });
  }

  /**
   * Uploads the chosen .p12/.jks into the selected bucket and fills in the path it landed
   * at. Previously the path had to be typed by hand with no way to get the file there from
   * this screen at all; the unique prefix keeps one profile's material from overwriting
   * another's when two share a bucket and a filename.
   */
  uploadStore(kind: 'truststore' | 'keystore', input: HTMLInputElement): void {
    const file = input.files?.[0];
    const bucketField = kind === 'truststore' ? 'sslTruststoreBucket' : 'sslKeystoreBucket';
    const pathField = kind === 'truststore' ? 'sslTruststoreLocation' : 'sslKeystoreLocation';
    const bucket = this.form.get(bucketField)?.value;

    if (!bucket) { this.toast.error('Choose a bucket first.'); return; }
    if (!file) { this.toast.error(`Choose a ${kind} file first.`); return; }

    const prefix = `${KafkaDialog.SECRET_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
    this.uploading.set(kind);
    this.storage.upload(bucket, prefix, file).subscribe({
      next: response => {
        this.uploading.set(null);
        if (response.status === API_SUCCESS) {
          this.form.get(pathField)?.setValue(prefix + file.name);
          input.value = '';
          this.toast.success(`${kind === 'truststore' ? 'Truststore' : 'Keystore'} uploaded.`);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.uploading.set(null);
        this.toast.error(err?.error?.message || 'The upload failed.');
      },
    });
  }

  readonly form: FormGroup = this.fb.group({
    kafkaConnectionProfileId: [this.data.profile?.kafkaConnectionProfileId ?? null],
    profileName: [this.data.profile?.profileName ?? '', Validators.required],
    environmentLabel: [this.data.profile?.environmentLabel ?? ''],
    bootstrapServers: [this.data.profile?.bootstrapServers ?? '', Validators.required],
    securityProtocol: [this.data.profile?.securityProtocol ?? 'PLAINTEXT', Validators.required],
    saslMechanism: [this.data.profile?.saslMechanism ?? 'PLAIN'],
    saslUsername: [this.data.profile?.saslUsername ?? ''],
    saslPassword: [''],
    sslTruststoreBucket: [this.data.profile?.sslTruststoreBucket ?? ''],
    sslTruststoreLocation: [this.data.profile?.sslTruststoreLocation ?? ''],
    sslTruststorePassword: [''],
    sslKeystoreBucket: [this.data.profile?.sslKeystoreBucket ?? ''],
    sslKeystoreLocation: [this.data.profile?.sslKeystoreLocation ?? ''],
    sslKeystorePassword: [''],
    sslKeyPassword: [''],
    additionalProperties: [this.data.profile?.additionalProperties ?? ''],
    status: [this.data.profile?.status ?? 'Active'],
  });

  private readonly protocolValue = toSignal(this.form.get('securityProtocol')!.valueChanges, {
    initialValue: this.form.get('securityProtocol')!.value as string,
  });

  readonly protocol = computed(() => this.protocolValue() ?? 'PLAINTEXT');
  readonly needsSasl = computed(() => this.protocol().startsWith('SASL_'));
  readonly needsSsl = computed(() => this.protocol() === 'SSL' || this.protocol() === 'SASL_SSL');

  secretHint(configured?: boolean): string {
    return configured ? 'Already set. Leave blank to keep it.' : 'Stored encrypted; never shown again.';
  }

  private payload(): any {
    const raw = this.form.getRawValue();
    // The API only ever reports whether a secret is set, so a blank field means "unchanged"
    // rather than "clear it" -- sending the empty string would wipe a working credential.
    ['saslPassword', 'sslTruststorePassword', 'sslKeystorePassword', 'sslKeyPassword']
      .forEach(key => { if (!raw[key]) delete raw[key]; });
    if (!this.needsSasl()) {
      raw.saslMechanism = null; raw.saslUsername = null;
      delete raw.saslPassword;
    }
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
    this.http.post<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/testConnection`, this.payload())
      .subscribe({
        next: response => {
          this.testing.set(false);
          this.testResult.set({ ok: response.status === API_SUCCESS, message: response.message });
        },
        error: err => {
          this.testing.set(false);
          this.testResult.set({ ok: false, message: err?.error?.message || 'The broker could not be reached.' });
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
    if (this.needsSasl() && !this.form.get('saslUsername')!.value) {
      this.toast.error('SASL needs a username.');
      return;
    }

    this.saving.set(true);
    const request = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/updateProfile`, this.payload())
      : this.http.post<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/addProfile`, this.payload());

    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message);
          this.ref.close(true);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The profile could not be saved.');
      },
    });
  }
}
