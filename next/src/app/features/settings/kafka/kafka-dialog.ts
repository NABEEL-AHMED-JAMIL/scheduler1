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
                <input id="saslUsername" class="input" formControlName="saslUsername" autocomplete="off" />
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
            <div class="form-section-title">TLS material</div>
            <div class="form-grid">
              <app-field label="Truststore bucket" for="sslTruststoreBucket"
                         [control]="form.get('sslTruststoreBucket')" [submitted]="submitted()"
                         hint="Storage connection alias holding the truststore.">
                <input id="sslTruststoreBucket" class="input" formControlName="sslTruststoreBucket" />
              </app-field>

              <app-field label="Truststore path" for="sslTruststoreLocation"
                         [control]="form.get('sslTruststoreLocation')" [submitted]="submitted()">
                <input id="sslTruststoreLocation" class="input mono" formControlName="sslTruststoreLocation"
                       placeholder="kafka-secrets/truststore.p12" />
              </app-field>

              <app-field label="Truststore password" for="sslTruststorePassword"
                         [control]="form.get('sslTruststorePassword')" [submitted]="submitted()"
                         [hint]="secretHint(data.profile?.sslTruststorePasswordConfigured)">
                <input id="sslTruststorePassword" type="password" class="input"
                       formControlName="sslTruststorePassword" autocomplete="new-password"
                       [placeholder]="data.profile?.sslTruststorePasswordConfigured ? '••••••••' : ''" />
              </app-field>

              <app-field label="Keystore path" for="sslKeystoreLocation"
                         [control]="form.get('sslKeystoreLocation')" [submitted]="submitted()"
                         hint="Only needed when the broker asks the client for a certificate.">
                <input id="sslKeystoreLocation" class="input mono" formControlName="sslKeystoreLocation"
                       placeholder="kafka-secrets/keystore.p12" />
              </app-field>

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
