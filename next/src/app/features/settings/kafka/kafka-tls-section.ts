import {
  Component, DestroyRef, OnInit, computed, effect, inject, input, model, signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  ControlContainer, FormGroup, FormGroupDirective, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { formatSize } from '../../../shared/ui/format-size';
import { KafkaProfile } from './kafka-connections';
import {
  KAFKA_SECRET_BUCKET, KAFKA_SECRET_ROOT, KafkaSecret, KafkaSecretService,
} from './kafka-secret.service';
import {
  SKIP_HOSTNAME_CHECK, TLS_FILE_NEEDS, TlsFileId, TlsFileNeed, TlsRoute, VERIFY_HOSTNAME,
  identityFileIds, protocolNeedsSsl, tlsLead, trustFileIds,
} from './kafka-profile-form';

/** What one upload slot is doing and what it is holding. */
interface SlotState {
  busy: boolean;
  /** The server's own wording, never rewritten -- see `refuse` below. */
  error: string;
  files: KafkaSecret[];
  /**
   * Whether anything has happened to this slot since the dialog opened.
   *
   * It is what separates "an edit that has not been touched", where the profile keeps the store it
   * arrived with, from "the file was taken away", where it must not -- both of which look like an
   * empty slot and would otherwise leave a removed truststore still saved on the row.
   */
  handled: boolean;
}

const EMPTY: SlotState = { busy: false, error: '', files: [], handled: false };

/**
 * The profile fields one store writes to.
 *
 * The keystore has a second password the truststore has no counterpart for: the key inside it,
 * which the server keeps in a column of its own and hands to the client as ssl.key.password. A
 * store this server builds protects the key with the store's own password, so the two move
 * together -- and a keystore this session replaced must not be opened with the key password of
 * the one before it.
 */
interface StoreFields {
  bucket: string;
  path: string;
  password: string;
  enc: string;
  clear: string;
  /** The keystore only; the truststore has no key of its own. */
  keyPassword?: string;
  keyEnc?: string;
  keyClear?: string;
}

const STORE_FIELDS: Record<'truststore' | 'keystore', StoreFields> = {
  truststore: {
    bucket: 'sslTruststoreBucket', path: 'sslTruststoreLocation',
    password: 'sslTruststorePassword', enc: 'sslTruststorePasswordEnc',
    clear: 'clearSslTruststorePassword',
  },
  keystore: {
    bucket: 'sslKeystoreBucket', path: 'sslKeystoreLocation',
    password: 'sslKeystorePassword', enc: 'sslKeystorePasswordEnc',
    clear: 'clearSslKeystorePassword',
    keyPassword: 'sslKeyPassword', keyEnc: 'sslKeyPasswordEnc',
    keyClear: 'clearSslKeyPassword',
  },
};

/**
 * The TLS half of the Kafka profile dialog.
 *
 * Split out of kafka-dialog because it stopped being a handful of fields. It used to ask for a
 * bucket, a path and a password per store and leave the person to run keytool somewhere else; now
 * it takes the files a managed cluster actually hands out and has the server build the stores, so
 * it carries five upload slots, a route apiece for the two questions it asks, per-slot validation
 * feedback and the prose explaining which of them this protocol needs. The dialog keeps the
 * profile, the credentials and the save.
 *
 * It writes into the dialog's own FormGroup rather than emitting a value, because the bucket, key
 * and password of each store are ordinary profile fields that the save and Test connection already
 * read from there -- an output would mean the same four values living in two places.
 */
@Component({
  selector: 'app-kafka-tls-section',
  imports: [ReactiveFormsModule, NgTemplateOutlet, Field, Icon],
  // formControlName resolves its container with @Host(), which stops at a component boundary --
  // so without this the controls in here would not find the dialog's [formGroup] and every one
  // of them would throw at first render. Handing the parent's directive down is the supported
  // way to write a section of somebody else's form.
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <div class="form-section">
      <div class="form-section-title flex items-center">
        TLS material
        <button type="button" class="btn btn-ghost btn-sm ml-auto"
                (click)="showGuide.set(!showGuide())">
          <app-icon name="info" class="icon-info" />
          {{ showGuide() ? 'Hide' : 'Where do these files come from?' }}
        </button>
      </div>

      <p class="field-note text-[color:var(--text-secondary)] mb-4">{{ lead() }}</p>

      <div class="tls-layout" [class.tls-with-guide]="showGuide()">
        @if (showGuide()) {
          <!-- Each item is tied to a slot that is actually on screen, so the two halves can be
               answered differently without the guide offering commands for files nobody was
               asked for. -->
          <aside class="guide">
            @if (!shown().size) {
              <p class="guide-lead">
                Neither question below has been answered yes, so there is nothing to upload and
                nothing to prepare beforehand. Tick one to see what it wants.
              </p>
            } @else {
              <p class="guide-lead">
                These are the commands for the files this form is asking you for, and nothing else.
                Everything else your provider hands you can be uploaded exactly as it came.
              </p>
              <ol class="guide-steps">
                @if (shows('ca')) {
                  <li>
                    <strong>The CA certificate</strong> is usually a download in the provider's
                    console. If there is none to find, take it off the broker itself:
                    <div class="guide-cmd">
                      <code class="guide-code">{{ commands.fetchCert }}</code>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0"
                              title="Copy command" (click)="copyCommand(commands.fetchCert)">
                        <app-icon name="copy" size="0.9em" />
                      </button>
                    </div>
                  </li>
                }
                @if (shows('clientCertificate')) {
                  <li>
                    <strong>The client certificate and key</strong> are issued together, when you
                    create an API key or a service account with mutual TLS turned on. Upload both;
                    the server refuses the pair if they do not belong to each other.
                  </li>
                  <li>
                    <strong>A key in the wrong format</strong> is the one thing that gets refused
                    often. Anything beginning
                    <code class="guide-inline">BEGIN RSA PRIVATE KEY</code>, or asking for a
                    passphrase, converts in one line:
                    <div class="guide-cmd">
                      <code class="guide-code">{{ commands.toPkcs8 }}</code>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0"
                              title="Copy command" (click)="copyCommand(commands.toPkcs8)">
                        <app-icon name="copy" size="0.9em" />
                      </button>
                    </div>
                  </li>
                }
                @if (shows('truststore')) {
                  <li>
                    <strong>Truststore</strong> — the CAs this client will trust. If you have not
                    built one, switch that section to <strong>I have the CA certificate</strong>
                    and this command is not needed at all.
                    <div class="guide-cmd">
                      <code class="guide-code">{{ commands.truststore }}</code>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0"
                              title="Copy command" (click)="copyCommand(commands.truststore)">
                        <app-icon name="copy" size="0.9em" />
                      </button>
                    </div>
                  </li>
                }
                @if (shows('keystore')) {
                  <li>
                    <strong>Keystore</strong> — this client's own certificate and key in one file.
                    Same again: <strong>I have the certificate and key</strong> builds it for you.
                    <div class="guide-cmd">
                      <code class="guide-code">{{ commands.keystore }}</code>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0"
                              title="Copy command" (click)="copyCommand(commands.keystore)">
                        <app-icon name="copy" size="0.9em" />
                      </button>
                    </div>
                  </li>
                }
                @if (shows('truststore') || shows('keystore')) {
                  <li>
                    The password you chose with <code class="guide-inline">-storepass</code> or
                    <code class="guide-inline">-passout</code> is what the password field beside
                    that store wants. A store the system builds needs no password from you.
                  </li>
                }
              </ol>
            }
          </aside>
        }

        <div class="min-w-0">
          <!-- Broker trust -->
          <div class="mb-5">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-sm font-semibold">Trusting the broker</span>
              <span class="pill" [class.pill-brand]="privateCa()" [class.pill-neutral]="!privateCa()">
                {{ privateCa() ? 'Required' : 'Nothing needed' }}
              </span>
            </div>
            <label class="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" class="checkbox mt-0.5" [checked]="privateCa()"
                     (change)="setPrivateCa($any($event.target).checked)" />
              <span>The broker's certificate is signed by a private or self-signed CA</span>
            </label>
            <p class="field-note text-[color:var(--text-muted)] ml-6">
              Leave it off for a managed cluster on a public CA — the JVM already trusts those, and
              supplying a truststore there narrows trust rather than adding any.
            </p>

            @if (privateCa()) {
              <!-- Asked per half rather than once for the section: a site that publishes one
                   finished truststore and issues PEM client pairs is ordinary, and a single
                   answer for both left that combination with nowhere to put either file. -->
              <div class="seg mt-3" role="group" aria-label="How you are supplying the broker's CA">
                @for (option of trustRoutes; track option.id) {
                  <button type="button" class="seg-btn" [class.seg-on]="trustRoute() === option.id"
                          (click)="setTrustRoute(option.id)">
                    <app-icon [name]="option.icon" size="0.9em" />
                    {{ option.label }}
                  </button>
                }
              </div>
              <p class="field-note text-[color:var(--text-muted)] mt-2">{{ trustSteps() }}</p>

              <div class="mt-3 space-y-3">
                @for (need of trustNeeds(); track need.id) {
                  <ng-container [ngTemplateOutlet]="slotCard"
                                [ngTemplateOutletContext]="{ $implicit: need }" />
                }
                @if (trustRoute() === 'certificates') {
                  <ng-container [ngTemplateOutlet]="builtStore" [ngTemplateOutletContext]="{
                    $implicit: 'truststore', label: 'Truststore', from: 'CA certificate' }" />
                } @else {
                  <app-field label="Truststore password" for="sslTruststorePassword"
                             [required]="truststorePasswordRequired()"
                             [control]="form().get('sslTruststorePassword')" [submitted]="submitted()"
                             [hint]="storePasswordHint('truststore', profile()?.sslTruststorePasswordConfigured)">
                    <input id="sslTruststorePassword" type="password" class="input"
                           formControlName="sslTruststorePassword" autocomplete="new-password"
                           [placeholder]="profile()?.sslTruststorePasswordConfigured ? '••••••••' : ''" />
                  </app-field>
                }
              </div>
            }
          </div>

          <!-- Client identity -->
          <div class="mb-5">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-sm font-semibold">Identifying this client</span>
              <span class="pill" [class.pill-brand]="mutualTls()" [class.pill-neutral]="!mutualTls()">
                {{ mutualTls() ? 'Required' : 'Nothing needed' }}
              </span>
            </div>
            <label class="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" class="checkbox mt-0.5" [checked]="mutualTls()"
                     (change)="setMutualTls($any($event.target).checked)" />
              <span>The broker asks this client for a certificate (mTLS)</span>
            </label>
            <p class="field-note text-[color:var(--text-muted)] ml-6">{{ mutualTlsNote() }}</p>

            @if (mutualTls()) {
              <div class="seg mt-3" role="group"
                   aria-label="How you are supplying this client's certificate">
                @for (option of identityRoutes; track option.id) {
                  <button type="button" class="seg-btn" [class.seg-on]="identityRoute() === option.id"
                          (click)="setIdentityRoute(option.id)">
                    <app-icon [name]="option.icon" size="0.9em" />
                    {{ option.label }}
                  </button>
                }
              </div>
              <p class="field-note text-[color:var(--text-muted)] mt-2">{{ identitySteps() }}</p>

              <div class="mt-3 space-y-3">
                @for (need of identityNeeds(); track need.id) {
                  <ng-container [ngTemplateOutlet]="slotCard"
                                [ngTemplateOutletContext]="{ $implicit: need }" />
                }
                @if (identityRoute() === 'certificates') {
                  <ng-container [ngTemplateOutlet]="builtStore" [ngTemplateOutletContext]="{
                    $implicit: 'keystore', label: 'Keystore', from: 'certificate and key' }" />
                } @else {
                  <div class="form-grid">
                    <app-field label="Keystore password" for="sslKeystorePassword"
                               [required]="keystorePasswordRequired()"
                               [control]="form().get('sslKeystorePassword')" [submitted]="submitted()"
                               [hint]="storePasswordHint('keystore', profile()?.sslKeystorePasswordConfigured)">
                      <input id="sslKeystorePassword" type="password" class="input"
                             formControlName="sslKeystorePassword" autocomplete="new-password"
                             [placeholder]="profile()?.sslKeystorePasswordConfigured ? '••••••••' : ''" />
                    </app-field>

                    <app-field label="Key password" for="sslKeyPassword"
                               [control]="form().get('sslKeyPassword')" [submitted]="submitted()"
                               [hint]="keyPasswordHint()">
                      <input id="sslKeyPassword" type="password" class="input"
                             formControlName="sslKeyPassword" autocomplete="new-password"
                             [placeholder]="profile()?.sslKeyPasswordConfigured ? '••••••••' : ''" />
                    </app-field>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Said on the screen itself rather than only in the guide beside it: where a private
               key ends up is the question a first-time uploader stops on, and it was answerable
               only by opening a panel that is shut by default. -->
          @if (shown().size) {
            <p class="field-note text-[color:var(--text-muted)] flex items-start gap-1.5 mb-4">
              <app-icon name="shield" size="0.9em" class="mt-px shrink-0" />
              <span>Every file above, and every store built from one, is written to the platform's
                    own <span class="mono">{{ bucket }}</span> bucket under
                    <span class="mono">{{ root }}/</span>, in a folder the server picks per upload.
                    You do not choose a location, none of it is listed in the object browser, and
                    it is read back only when this profile opens a connection.</span>
            </p>
          }

          @if (carriedOver().length) {
            <p class="field-note text-[color:var(--text-muted)] flex items-start gap-1.5 mb-4">
              <app-icon name="history" size="0.9em" class="mt-px shrink-0" />
              <span>Keeping the {{ carriedOver().join(' and ') }} this profile was saved with.
                    Anything you upload above replaces it.</span>
            </p>
          }

          @if (submitted() && stillMissing().length) {
            <p class="field-note text-crit-500 flex items-start gap-1.5 mb-4" role="alert">
              <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
              <span>Still needed: {{ stillMissing().join(', ') }}.</span>
            </p>
          }

          <div class="form-grid">
            <app-field class="sm:col-span-2" label="Hostname verification"
                       for="sslEndpointIdentificationAlgorithm"
                       [control]="form().get('sslEndpointIdentificationAlgorithm')"
                       [submitted]="submitted()"
                       hint="Whether the broker's certificate has to match the host it was reached at.">
              <select id="sslEndpointIdentificationAlgorithm" class="input"
                      formControlName="sslEndpointIdentificationAlgorithm">
                <option [value]="verifyHostname">Verify the hostname (recommended)</option>
                <option [value]="skipHostnameCheck">Skip the check</option>
              </select>
            </app-field>

            @if (form().get('sslEndpointIdentificationAlgorithm')?.value === skipHostnameCheck) {
              <p class="field-note text-warn-500 flex items-start gap-1.5 sm:col-span-2">
                <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                <span>With the check off, any host holding a certificate this truststore trusts
                      is accepted. Only for brokers whose certificate names do not match their
                      DNS names.</span>
              </p>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- One upload slot. Five of them differ only in what they accept and what they are for, so
         they share a template rather than five near-identical blocks drifting apart. -->
    <ng-template #slotCard let-need>
      <div class="card p-3">
        <div class="flex items-start gap-2.5">
          <app-icon [name]="need.icon" class="icon-muted mt-0.5 shrink-0" />
          <div class="min-w-0 flex-1">
            <!-- Marked on the card and not only on the section header: with two cards under one
                 header, "Required" above them says nothing about whether both are wanted. Only
                 slots this combination actually needs are drawn, so every one of them is. -->
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ need.label }}</span>
              <span class="pill pill-neutral">Required</span>
            </div>
            <p class="field-note text-[color:var(--text-muted)]">{{ need.what }}</p>
            <p class="field-note text-[color:var(--text-muted)]">Accepts {{ need.accepts }}</p>
          </div>
          <button type="button" class="btn btn-default btn-sm shrink-0"
                  [disabled]="slot(need.id).busy" (click)="picker.click()">
            <app-icon name="upload" [class.spin]="slot(need.id).busy" />
            {{ pickLabel(need) }}
          </button>
          <!-- Hidden because the native control cannot be styled and reports a path nobody needs;
               everything it would have said is in the row below once the file is accepted. -->
          <input type="file" class="sr-only" #picker [accept]="need.accept"
                 [attr.aria-label]="need.label" (change)="pick(need.id, picker)" />
        </div>

        @if (slot(need.id).busy) {
          <!-- No percentage: these files are a few kilobytes and the wait is the server parsing
               them, not the transfer, so a bar would sit at 100% for the part that can fail. -->
          <p class="field-note text-[color:var(--text-muted)] flex items-center gap-1.5 mt-2">
            <app-icon name="refresh" size="0.9em" class="spin" />
            <span>Uploading and checking the file…</span>
          </p>
        }

        @for (stored of slot(need.id).files; track stored.objectKey) {
          <div class="mt-2 rounded-md border px-2.5 py-2 text-xs
                      bg-[color:var(--surface-inset)] border-[color:var(--border-subtle)]">
            <div class="flex items-center gap-2">
              <app-icon name="checkCircle" size="0.9em" class="icon-ok shrink-0" />
              <span class="mono truncate">{{ stored.fileName }}</span>
              <span class="text-[color:var(--text-muted)] shrink-0">{{ size(stored.sizeBytes) }}</span>
              <button type="button" class="btn btn-ghost btn-xs ml-auto shrink-0"
                      (click)="remove(need.id, stored)">Remove</button>
            </div>
            @if (stored.subject) {
              <!-- The point of showing these: it is the only way to tell the production CA from
                   the staging one before the connection is tried. -->
              <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 mt-1.5
                         text-[color:var(--text-muted)]">
                <dt>Subject</dt><dd class="truncate text-[color:var(--text-secondary)]">{{ stored.subject }}</dd>
                <dt>Issuer</dt><dd class="truncate text-[color:var(--text-secondary)]">{{ stored.issuer }}</dd>
                <dt>Expires</dt><dd class="text-[color:var(--text-secondary)]">{{ stored.expiresOn }}</dd>
              </dl>
            }
            @if (stored.expired) {
              <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
                <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                <span>This certificate expired on {{ stored.expiresOn }}. The broker will refuse
                      the connection until it is replaced with a current one.</span>
              </p>
            }
          </div>
        }

        @if (slot(need.id).error) {
          <!-- The server's message verbatim: for a private key it names the exact openssl command
               that fixes the file, which no wording of ours could replace. -->
          <p class="field-note text-crit-500 flex items-start gap-1.5 mt-2" role="alert">
            <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
            <span>{{ slot(need.id).error }}</span>
          </p>
        }

        @if (need.multiple && slot(need.id).files.length) {
          <button type="button" class="btn btn-ghost btn-xs mt-2" (click)="adder.click()">
            <app-icon name="plus" size="0.9em" />
            Add another file to the chain
          </button>
          <input type="file" class="sr-only" #adder [accept]="need.accept"
                 (change)="add(need.id, adder)" />
        }
      </div>
    </ng-template>

    <!-- What the server made out of the uploads, and the one place that says a password was
         generated. The value itself is never bound anywhere in this template. -->
    <ng-template #builtStore let-id let-label="label" let-from="from">
      @if (slot(id).busy) {
        <p class="field-note text-[color:var(--text-muted)] flex items-center gap-1.5">
          <app-icon name="refresh" size="0.9em" class="spin" />
          <span>Building the {{ label.toLowerCase() }}…</span>
        </p>
      } @else if (slot(id).error) {
        <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
          <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
          <span>{{ slot(id).error }}</span>
        </p>
      } @else if (slot(id).files.length) {
        <div class="card p-3 flex items-start gap-2.5">
          <app-icon name="checkCircle" class="icon-ok mt-0.5 shrink-0" />
          <div class="min-w-0">
            <div class="text-sm font-medium">{{ label }} built</div>
            <p class="field-note text-[color:var(--text-muted)]">
              Made from the {{ from }} above and stored beside it, with a password the system
              generated. It is saved with this profile encrypted — there is nothing for you to
              choose, copy or type.
            </p>
          </div>
        </div>
      } @else {
        <p class="field-note text-[color:var(--text-muted)]">
          The {{ label.toLowerCase() }} is built here once the {{ from }} above is uploaded.
        </p>
      }
    </ng-template>
  `,
})
export class KafkaTlsSection implements OnInit {
  /** The dialog's own group; every control this section touches already belongs to the profile. */
  readonly form = input.required<FormGroup>();
  readonly protocol = input.required<string>();
  readonly mechanism = input.required<string>();
  readonly profile = input<KafkaProfile | undefined>(undefined);
  readonly submitted = input(false);

  /** Two-way, because the dialog's own summary line and its save payload both turn on it. */
  readonly mutualTls = model(false);

  private readonly secrets = inject(KafkaSecretService);
  private readonly toast = inject(ToastService);

  readonly verifyHostname = VERIFY_HOSTNAME;
  readonly skipHostnameCheck = SKIP_HOSTNAME_CHECK;
  readonly size = formatSize;
  readonly bucket = KAFKA_SECRET_BUCKET;
  readonly root = KAFKA_SECRET_ROOT;

  readonly trustRoutes: { id: TlsRoute; label: string; icon: string }[] = [
    { id: 'certificates', label: 'I have the CA certificate', icon: 'file' },
    { id: 'stores', label: 'I already have a truststore', icon: 'lock' },
  ];

  readonly identityRoutes: { id: TlsRoute; label: string; icon: string }[] = [
    { id: 'certificates', label: 'I have the certificate and key', icon: 'file' },
    { id: 'stores', label: 'I already have a keystore', icon: 'lock' },
  ];

  readonly showGuide = signal(false);

  /** One route per half, because the two are supplied independently -- see trustFileIds. */
  readonly trustRoute = signal<TlsRoute>('certificates');
  readonly identityRoute = signal<TlsRoute>('certificates');

  /** Whether a truststore is wanted at all; opened in ngOnInit, where the inputs are readable. */
  readonly privateCa = signal(false);

  /**
   * Gate on the effect that writes back into the form.
   *
   * It has to be told when the opening answers below are real, because it decides what to clear
   * from those answers -- running once on the constructor's defaults would null the truststore of
   * every profile being edited, and ngOnInit would then read the field it had just emptied.
   */
  private readonly opened = signal(false);

  ngOnInit(): void {
    // On for a profile that already has a truststore, and for plain SSL, where a private CA is the
    // usual reason to be on that protocol rather than SASL_SSL. A managed cluster on SASL_SSL
    // starts off, which is the right answer for Confluent Cloud, Aiven and the public MSK
    // endpoints -- and the one the old screen made everybody work out from the guide.
    this.privateCa.set(!!this.form().get('sslTruststoreLocation')?.value || this.protocol() === 'SSL');
    this.opened.set(true);
  }

  private readonly slots = signal<Record<TlsFileId, SlotState>>({
    ca: EMPTY, clientCertificate: EMPTY, clientKey: EMPTY, truststore: EMPTY, keystore: EMPTY,
  });

  slot(id: TlsFileId): SlotState {
    return this.slots()[id];
  }

  readonly commands = {
    fetchCert: 'openssl s_client -connect BROKER:9093 -showcerts </dev/null | openssl x509 > ca.pem',
    toPkcs8: 'openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem',
    truststore: 'keytool -import -alias kafka-broker -file ca.pem \\\n  -keystore truststore.p12 -storetype PKCS12 -storepass CHOOSE_ONE',
    keystore: 'openssl pkcs12 -export -in client.crt -inkey client.key \\\n  -out keystore.p12 -passout pass:CHOOSE_ONE',
  };

  readonly lead = computed(() =>
    tlsLead(this.protocol(), this.mechanism(), this.privateCa(), this.mutualTls()));

  readonly trustNeeds = computed(() =>
    trustFileIds(this.protocol(), this.trustRoute(), this.privateCa())
      .map(id => TLS_FILE_NEEDS[id]));
  readonly identityNeeds = computed(() =>
    identityFileIds(this.protocol(), this.identityRoute(), this.mutualTls())
      .map(id => TLS_FILE_NEEDS[id]));

  /** Which upload slots are actually on screen, so the guide beside them can match. */
  readonly shown = computed(() =>
    new Set([...this.trustNeeds(), ...this.identityNeeds()].map(need => need.id)));

  shows(id: TlsFileId): boolean {
    return this.shown().has(id);
  }

  /**
   * What this half of the section is going to do, said before anything is uploaded.
   *
   * Split in two along with the routes, and kept beside the slots rather than at the top: the
   * answer to "do I have to make a store myself" is different for the broker's CA and for this
   * client's own certificate, and one line above both could only ever describe one of them.
   */
  trustSteps(): string {
    return this.trustRoute() === 'certificates'
      ? 'You upload the CA certificate; the system builds the truststore from it and picks its password. There is nothing for you to type.'
      : 'You upload the truststore you built and type the password you chose for it. Nothing is converted.';
  }

  identitySteps(): string {
    return this.identityRoute() === 'certificates'
      ? 'You upload the client certificate and its private key; the system checks the two are a pair, builds the keystore and picks its password.'
      : 'You upload the keystore you built and type the password you chose for it. Nothing is converted.';
  }

  mutualTlsNote(): string {
    return this.protocol() === 'SSL'
      ? 'On plain SSL this is the only thing that identifies the client, so leave it off only for a broker that authorises by network address.'
      : 'Leave it off unless the broker was set up to demand one — a managed cluster on SASL_SSL never asks.';
  }

  secretHint(configured?: boolean): string {
    return configured ? 'Already set. Leave blank to keep it.' : 'Stored encrypted; never shown again.';
  }

  /**
   * The same hint, except beside a store this session put on screen.
   *
   * "Leave blank to keep it" stops being true the moment the file the saved password opened is
   * replaced -- the password goes with the store it belonged to, so the box is asking for the one
   * that opens the file just uploaded.
   */
  storePasswordHint(id: 'truststore' | 'keystore', configured?: boolean): string {
    return this.slot(id).files.length
      ? 'The password you chose for the file just uploaded. The saved one went with the store it replaced.'
      : this.secretHint(configured);
  }

  /** Same again for the key inside the keystore, which applyKeyPassword drops with its store. */
  keyPasswordHint(): string {
    if (this.slot('keystore').files.length) {
      return 'Only if the key inside the file just uploaded has its own password. The saved one went with the keystore it replaced.';
    }
    return this.profile()?.sslKeyPasswordConfigured
      ? this.secretHint(true)
      : 'Only if the private key inside the keystore has its own password.';
  }

  pickLabel(need: TlsFileNeed): string {
    if (this.slot(need.id).busy) return 'Checking…';
    const held = this.slot(need.id).files.length;
    if (!held) return 'Choose file';
    // A pick replaces everything the slot holds, chain and all -- see `pick`. Calling that
    // "Replace first file" over a chain of two promised the second would survive it, and the
    // truststore was then rebuilt from a root with its intermediate quietly gone.
    return need.multiple && held > 1 ? 'Replace the whole chain' : 'Replace';
  }

  private readonly truststoreWanted = computed(() =>
    protocolNeedsSsl(this.protocol()) && this.privateCa());
  private readonly keystoreWanted = computed(() =>
    protocolNeedsSsl(this.protocol()) && this.mutualTls());

  /**
   * A store the operator built needs the password they chose for it.
   *
   * The saved one excuses the box only while the store it opens is still the one on the row: a
   * file uploaded here replaces it, and applyStore drops the password with it, so leaving the box
   * blank would save a store with no password rather than keep a working one.
   */
  readonly truststorePasswordRequired = computed(() =>
    this.truststoreWanted() && this.trustRoute() === 'stores'
    && (!!this.slot('truststore').files.length
        || !this.profile()?.sslTruststorePasswordConfigured));
  readonly keystorePasswordRequired = computed(() =>
    this.keystoreWanted() && this.identityRoute() === 'stores'
    && (!!this.slot('keystore').files.length
        || !this.profile()?.sslKeystorePasswordConfigured));

  /** Stores the profile arrived with and this session has not replaced, named so an edit does not
      look as though its material has gone missing. */
  readonly carriedOver = computed(() => {
    const kept: string[] = [];
    if (this.truststoreWanted() && !this.slot('truststore').files.length
        && this.alreadyPointsAt('sslTruststoreLocation')) kept.push('truststore');
    if (this.keystoreWanted() && !this.slot('keystore').files.length
        && this.alreadyPointsAt('sslKeystoreLocation')) kept.push('keystore');
    return kept;
  });

  /**
   * What is still outstanding, said in the section itself.
   *
   * The location controls are required but have no visible input any more, so an invalid one would
   * otherwise block the save with a toast pointing at nothing on screen.
   */
  readonly stillMissing = computed(() => {
    const missing: string[] = [];
    if (this.truststoreWanted() && !this.slot('truststore').files.length
        && !this.alreadyPointsAt('sslTruststoreLocation')) {
      missing.push(...this.outstanding('truststore', this.trustRoute(), ['ca']));
    }
    if (this.keystoreWanted() && !this.slot('keystore').files.length
        && !this.alreadyPointsAt('sslKeystoreLocation')) {
      missing.push(...this.outstanding('keystore', this.identityRoute(),
        ['clientCertificate', 'clientKey']));
    }
    return missing;
  });

  /**
   * Names only what is actually absent, rather than the whole route.
   *
   * Somebody who uploaded the client certificate and not its key was told to supply both again,
   * which reads as though the accepted file had been rejected. And once every source file is
   * there, what failed is the build -- the refusal is already shown against the slot, so this
   * points at it instead of asking for files that are plainly on screen.
   */
  private outstanding(
      store: 'truststore' | 'keystore', route: TlsRoute, sources: TlsFileId[]): string[] {
    if (route === 'stores') {
      return [`${TLS_FILE_NEEDS[store].label} file`];
    }
    if (this.slot(store).busy) {
      return [];
    }
    const absent = sources.filter(id => !this.slot(id).files.length);
    return absent.length
      ? absent.map(id => TLS_FILE_NEEDS[id].label)
      : [`${TLS_FILE_NEEDS[store].label} (it could not be built from the files above)`];
  }

  /** The location a control is already carrying -- from the profile being edited, or from an
      upload made earlier in this dialog and then switched away from and back. */
  private alreadyPointsAt(field: string): boolean {
    return !!this.form().get(field)?.value;
  }

  // ---------------------------------------------------------------- choices

  setTrustRoute(route: TlsRoute): void {
    if (route === this.trustRoute()) {
      return;
    }
    this.trustRoute.set(route);
    // A store the other route produced is not what this one is offering, so it is dropped rather
    // than left pointing the profile at a file the screen has stopped showing. The certificates
    // themselves are kept, so switching back rebuilds without re-uploading anything.
    this.reset('truststore');
    if (route === 'certificates') {
      this.buildTruststore();
    }
  }

  setIdentityRoute(route: TlsRoute): void {
    if (route === this.identityRoute()) {
      return;
    }
    this.identityRoute.set(route);
    this.reset('keystore');
    if (route === 'certificates') {
      this.buildKeystore();
    }
  }

  setPrivateCa(on: boolean): void {
    this.privateCa.set(on);
    if (!on) {
      this.reset('ca');
      this.reset('truststore');
    }
  }

  setMutualTls(on: boolean): void {
    this.mutualTls.set(on);
    if (!on) {
      this.reset('clientCertificate');
      this.reset('clientKey');
      this.reset('keystore');
    }
  }

  // ---------------------------------------------------------------- uploads

  /** Replaces whatever the slot holds. */
  pick(id: TlsFileId, input: HTMLInputElement): void {
    this.take(id, input, false);
  }

  /** Adds to a slot that takes several files -- a CA chain split across downloads. */
  add(id: TlsFileId, input: HTMLInputElement): void {
    this.take(id, input, true);
  }

  private take(id: TlsFileId, input: HTMLInputElement, append: boolean): void {
    const file = input.files?.[0];
    // Cleared before the request, not after: re-choosing the same file after a refusal fires no
    // change event while the input still holds it, so a corrected file of the same name is
    // silently ignored.
    input.value = '';
    if (!file) {
      return;
    }
    this.patch(id, { busy: true, error: '' });
    this.secrets.upload(file, TLS_FILE_NEEDS[id].kind).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.patch(id, { busy: false, error: this.refuse(response.message) });
          return;
        }
        const saved = response.data;
        const files = append ? [...this.slot(id).files, saved] : [saved];
        this.patch(id, { busy: false, error: '', files, handled: true });
        this.rebuildFor(id);
      },
      error: err => this.patch(id, { busy: false, error: this.refuse(err?.error?.message) }),
    });
  }

  remove(id: TlsFileId, unwanted: KafkaSecret): void {
    this.patch(id, {
      files: this.slot(id).files.filter(file => file !== unwanted), error: '', handled: true });
    this.rebuildFor(id);
  }

  /** The uploads a store is built from, and what to do when one of them changes. */
  private rebuildFor(id: TlsFileId): void {
    if (id === 'ca') {
      this.buildTruststore();
    }
    if (id === 'clientCertificate' || id === 'clientKey') {
      this.buildKeystore();
    }
  }

  /**
   * Built as soon as there is something to build from, rather than behind a button.
   *
   * The person uploading a CA certificate has already said what they want; asking them to press
   * Generate afterwards only adds a step they can forget, and a profile saved with the certificate
   * uploaded but the store never built fails at the first connection with nothing on screen having
   * looked wrong.
   */
  private buildTruststore(): void {
    if (this.trustRoute() !== 'certificates') {
      return;
    }
    const keys = this.slot('ca').files.map(file => file.objectKey);
    if (!keys.length) {
      this.reset('truststore');
      return;
    }
    this.patch('truststore', { busy: true, error: '' });
    this.secrets.generateTruststore(keys).subscribe({
      next: response => this.built('truststore', response.status === API_SUCCESS ? response.data : undefined,
        response.message),
      error: err => this.patch('truststore', { busy: false, error: this.refuse(err?.error?.message) }),
    });
  }

  private buildKeystore(): void {
    if (this.identityRoute() !== 'certificates') {
      return;
    }
    const certificate = this.slot('clientCertificate').files[0];
    const key = this.slot('clientKey').files[0];
    if (!certificate || !key) {
      this.reset('keystore');
      return;
    }
    this.patch('keystore', { busy: true, error: '' });
    this.secrets.generateKeystore(certificate.objectKey, key.objectKey).subscribe({
      next: response => this.built('keystore', response.status === API_SUCCESS ? response.data : undefined,
        response.message),
      error: err => this.patch('keystore', { busy: false, error: this.refuse(err?.error?.message) }),
    });
  }

  private built(id: 'truststore' | 'keystore', store: KafkaSecret | undefined, message: string): void {
    if (!store) {
      this.patch(id, { busy: false, error: this.refuse(message), files: [], handled: true });
      return;
    }
    this.patch(id, { busy: false, error: '', files: [store], handled: true });
  }

  /** The server's own wording wherever there is one; ours only when the request never arrived. */
  private refuse(message?: string): string {
    return message || 'The file could not be uploaded. Check the connection and try again.';
  }

  private patch(id: TlsFileId, change: Partial<SlotState>): void {
    this.slots.update(slots => ({ ...slots, [id]: { ...slots[id], ...change } }));
  }

  /** Empties a slot, and records that emptying it was something this session did. */
  private reset(id: TlsFileId): void {
    this.slots.update(slots => ({ ...slots, [id]: { ...EMPTY, handled: true } }));
  }

  async copyCommand(command: string): Promise<void> {
    if (await copyText(command)) this.toast.success('Command copied.');
    else this.toast.error('Could not copy the command.');
  }

  // ---------------------------------------------------------------- the form

  /**
   * Keeps the profile's own fields pointing at what the screen is showing.
   *
   * The bucket and key are the server's answer, not a choice: every upload comes back saying where
   * it was put, and that is what the profile is saved with. `storePasswordEnc` is carried across
   * the same way -- it is ciphertext under a key the browser has never seen, so it can only be
   * moved from one request to the other, never read, and asking somebody to invent a password for
   * a store the server both wrote and will open would be a password that opens nothing.
   */
  private readonly pointProfileAtChosenFiles = effect(() => {
    if (!this.opened()) {
      return;
    }
    this.applyStore('truststore', this.truststoreWanted());
    this.applyStore('keystore', this.keystoreWanted());
  });

  private applyStore(id: 'truststore' | 'keystore', wanted: boolean): void {
    const fields = STORE_FIELDS[id];
    const slot = this.slot(id);
    const store = slot.files[0];
    // An edit nobody has touched keeps the store it arrived with. Once this session has emptied the
    // slot -- the file removed, the route changed, the question answered no -- the profile has to
    // stop naming it, or a truststore somebody took off the screen is still downloaded at the next
    // connection and the row disagrees with what they were looking at.
    if (!wanted || (!store && slot.handled)) {
      this.set(fields.bucket, null);
      this.set(fields.path, null);
      this.set(fields.password, '');
      this.set(fields.enc, '');
      this.set(fields.clear, true);
      this.applyKeyPassword(fields, undefined, true);
      return;
    }
    if (!store) {
      return;
    }
    this.set(fields.bucket, store.bucket);
    this.set(fields.path, store.objectKey);
    if (store.storePasswordEnc) {
      // Into its own field, never the password box: this is already ciphertext, and the save path
      // encrypts whatever arrives in the password box -- storing encrypt(ciphertext) would leave a
      // store nothing could ever open.
      this.set(fields.enc, store.storePasswordEnc);
      this.set(fields.password, '');
      this.set(fields.clear, false);
    } else {
      // A store uploaded here brings no password with it: whatever is typed in the box beside it
      // is the password. The one on the row belongs to the file this has just replaced, so left
      // in place it is handed to a store it cannot open -- the same failure the key password
      // below was already guarded against, at the first publish rather than at the save. The
      // typed password still wins, since the server reads the flag only when none came with the
      // request, and truststorePasswordRequired/keystorePasswordRequired make sure one was typed.
      this.set(fields.clear, true);
    }
    this.applyKeyPassword(fields, store, slot.handled);
  }

  /**
   * The key inside the keystore, which the server holds separately from the store's own password.
   *
   * A store this server builds locks the key with the store password, so the same ciphertext has
   * to reach both columns -- the truststore has no such field and asks for nothing here. Anything
   * else this session put in the slot leaves the key password to the box beside it and takes the
   * stored one away, because it belonged to the keystore that has just been replaced: a keystore
   * saved with the previous one still attached is downloaded fine and then fails to unwrap its own
   * key, at the first publish rather than at the save. A password actually typed still wins, since
   * the server reads the clear flag only when no password came with the request.
   */
  private applyKeyPassword(
      fields: StoreFields, store: KafkaSecret | undefined, handled: boolean): void {
    if (!fields.keyEnc || !fields.keyPassword || !fields.keyClear) {
      return;
    }
    if (store?.storePasswordEnc) {
      this.set(fields.keyEnc, store.storePasswordEnc);
      this.set(fields.keyPassword, '');
      this.set(fields.keyClear, false);
      return;
    }
    this.set(fields.keyEnc, '');
    if (handled) {
      this.set(fields.keyClear, true);
    }
  }

  private set(field: string, value: unknown): void {
    const control = this.form().get(field);
    // emitEvent: false because these are written from an effect that other signals feed; letting
    // each one emit would re-enter through the dialog's own valueChanges signals.
    if (control && control.value !== value) {
      control.setValue(value, { emitEvent: false });
    }
  }

  /**
   * The stars and the validators read the same signals, so they cannot say different things.
   *
   * The two location controls have no visible input any longer -- they hold whatever the last
   * upload came back with -- but they are still required, because a profile pointing at no
   * truststore on a private CA fails at the first connection rather than at the save.
   */
  private readonly conditionalValidators = effect(() => {
    this.require('sslTruststoreLocation', this.truststoreWanted());
    this.require('sslKeystoreLocation', this.keystoreWanted());
    this.require('sslTruststorePassword', this.truststorePasswordRequired());
    this.require('sslKeystorePassword', this.keystorePasswordRequired());
  });

  constructor() {
    // This section is created and destroyed by the protocol select. Its validators live on the
    // dialog's controls, which outlive it, so a switch to PLAINTEXT would otherwise leave a
    // required rule on a field nothing can fill in any more.
    inject(DestroyRef).onDestroy(() => {
      ['sslTruststoreLocation', 'sslKeystoreLocation', 'sslTruststorePassword', 'sslKeystorePassword']
        .forEach(field => this.require(field, false));
    });
  }

  private require(name: string, required: boolean): void {
    const control = this.form().get(name);
    if (!control) {
      return;
    }
    control.setValidators(required ? Validators.required : null);
    control.updateValueAndValidity({ emitEvent: false });
  }
}
