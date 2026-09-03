import { Component, computed, effect, inject, signal } from '@angular/core';
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
import { KafkaTlsSection } from './kafka-tls-section';
import {
  SASL_MECHANISMS, SECURITY_PROTOCOLS, VERIFY_HOSTNAME,
  additionalPropertiesJson, combinationSummary, profilePayload, protocolNeedsSasl, protocolNeedsSsl,
} from './kafka-profile-form';

@Component({
  selector: 'app-kafka-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Icon, KafkaTlsSection],
  template: `
    <app-form-dialog
      size="wide"
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
                         [control]="form.get('saslMechanism')" [submitted]="submitted()"
                         [hint]="mechanismHint()">
                <select id="saslMechanism" class="input" formControlName="saslMechanism">
                  @for (m of mechanismOptions(); track m) { <option [value]="m">{{ m }}</option> }
                </select>
              </app-field>
            }
          </div>

          <p class="field-note text-[color:var(--text-muted)] mt-3">{{ summary() }}</p>

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
                         [control]="form.get('saslUsername')" [submitted]="submitted()"
                         hint="The user your Kafka provider issued, not a person's login here.">
                <input id="saslUsername" class="input" formControlName="saslUsername" autocomplete="off" placeholder="kafka user" />
              </app-field>

              <app-field label="Password" for="saslPassword"
                         [required]="saslPasswordRequired()"
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
          <app-kafka-tls-section [form]="form" [protocol]="protocol()" [mechanism]="mechanism()"
                                 [profile]="data.profile" [submitted]="submitted()"
                                 [(mutualTls)]="mutualTls" />
        }

        <div class="form-section">
          <div class="form-section-title">Advanced</div>
          <app-field label="Additional properties" for="additionalProperties"
                     [control]="form.get('additionalProperties')" [submitted]="submitted()"
                     [errorMessages]="propertyErrors"
                     hint="A JSON object of Kafka client properties, merged over everything above.">
            <textarea id="additionalProperties" class="input mono" rows="3"
                      formControlName="additionalProperties"
                      [placeholder]="propertiesPlaceholder"></textarea>
          </app-field>

          @if (isEdit()) {
            <app-field label="Status" for="kafkaStatus" [control]="form.get('status')"
                       [submitted]="submitted()"
                       hint="Inactive keeps the profile and its files but takes it out of service.">
              <select id="kafkaStatus" class="input" formControlName="status">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </app-field>
          }
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

  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly submitted = signal(false);
  readonly testResult = signal<{ ok: boolean; message: string } | null>(null);
  readonly isEdit = computed(() => !!this.data.profile);

  /** Only mTLS brokers ask for a keystore, so nothing about one is shown until somebody says this
      is one of those. An existing keystore turns it on by itself. Owned here rather than in the
      TLS section because the Security summary line above it turns on the same answer. */
  readonly mutualTls = signal(!!this.data.profile?.sslKeystoreLocation);

  /** The wording the server would send back as a toast, said on the field instead. */
  readonly propertyErrors = {
    jsonObject: 'Enter a JSON object of properties, not key=value lines',
    jsonScalarValues: 'Each value must be a single string or number, not a list or an object',
  };
  readonly propertiesPlaceholder = '{"request.timeout.ms": "30000"}';

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
    // Ciphertext, not a password: when the server builds a store it hands back the password it
    // chose, already encrypted, and these carry it into the save. The browser cannot read them and
    // nothing renders them -- they exist only because the store is built in one request and the
    // profile saved in the next.
    sslTruststorePasswordEnc: [''],
    sslKeystorePasswordEnc: [''],
    // The key inside a generated keystore is protected with the store's own password, and the
    // server keeps it in a column of its own. Without this control the field never left the
    // browser, so a keystore replaced on an existing profile was opened with the key password of
    // the one before it and every publish failed on a key it could not unwrap.
    sslKeyPasswordEnc: [''],
    // A blank password means "keep the stored one", so taking a store away needs a flag of its
    // own -- otherwise the password of a truststore that has just been removed stays in the row
    // with nothing left to open.
    clearSslTruststorePassword: [false],
    clearSslKeystorePassword: [false],
    clearSslKeyPassword: [false],
    // The control was missing entirely, so the key never appeared in the body and every save
    // from this screen overwrote the stored setting with null -- turning hostname verification
    // back on under a profile that had been set up without it.
    sslEndpointIdentificationAlgorithm: [
      this.data.profile?.sslEndpointIdentificationAlgorithm ?? VERIFY_HOSTNAME],
    additionalProperties: [this.data.profile?.additionalProperties ?? '', additionalPropertiesJson],
    status: [this.data.profile?.status ?? 'Active'],
  });

  private readonly protocolValue = toSignal(this.form.get('securityProtocol')!.valueChanges, {
    initialValue: this.form.get('securityProtocol')!.value as string,
  });

  private readonly mechanismValue = toSignal(this.form.get('saslMechanism')!.valueChanges, {
    initialValue: this.form.get('saslMechanism')!.value as string,
  });

  readonly protocol = computed(() => this.protocolValue() ?? 'PLAINTEXT');
  readonly mechanism = computed(() => this.mechanismValue() ?? 'PLAIN');
  readonly needsSasl = computed(() => protocolNeedsSasl(this.protocol()));
  readonly needsSsl = computed(() => protocolNeedsSsl(this.protocol()));
  readonly summary = computed(() =>
    combinationSummary(this.protocol(), this.mechanism(), this.mutualTls()));

  readonly saslPasswordRequired = computed(() =>
    this.needsSasl() && !this.data.profile?.saslPasswordConfigured);

  /**
   * app-field's [required] only draws an asterisk -- it never touches the control -- so every
   * star on this form was decoration. A SASL profile could be saved with no password at all,
   * and the broker then rejected each publish with an authentication error naming no field.
   * The stars and the validators read the same signals now, so they cannot drift apart again.
   */
  private readonly conditionalValidators = effect(() => {
    this.require('saslMechanism', this.needsSasl());
    this.require('saslUsername', this.needsSasl());
    this.require('saslPassword', this.saslPasswordRequired());
    // The TLS controls are left to app-kafka-tls-section: what a store's presence turns on is
    // answered by questions that live inside it, and two effects setting the same validators
    // from different answers is exactly how the stars and the rules drifted apart before.
  });

  private require(name: string, required: boolean): void {
    const control = this.form.get(name)!;
    control.setValidators(required ? Validators.required : null);
    // Without emitEvent: false this re-enters the effect through the valueChanges signals above.
    control.updateValueAndValidity({ emitEvent: false });
  }

  /** A row stored with a mechanism the server no longer accepts would select nothing at all,
      leaving a blank box that says neither what is in the row nor what to do about it. */
  readonly mechanismOptions = computed(() => {
    const stored = this.data.profile?.saslMechanism;
    return stored && !SASL_MECHANISMS.includes(stored)
      ? SASL_MECHANISMS.concat(stored) : SASL_MECHANISMS;
  });

  mechanismHint(): string {
    return SASL_MECHANISMS.includes(this.mechanism())
      ? ''
      : `${this.mechanism()} is not one the server accepts — pick PLAIN or one of the SCRAM digests.`;
  }

  secretHint(configured?: boolean): string {
    return configured ? 'Already set. Leave blank to keep it.' : 'Stored encrypted; never shown again.';
  }

  private payload(): any {
    return profilePayload(this.form.getRawValue(), this.mutualTls());
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
    // The id goes with it on an edit: the server tests the values in this body and falls back
    // to the stored secrets for whichever password fields were left blank.
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
