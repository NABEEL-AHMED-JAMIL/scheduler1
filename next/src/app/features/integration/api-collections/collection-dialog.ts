import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { AUTH_FIELDS, CollectionRow, SENSITIVITIES, authLabel, holdsReference, sensitivityLabel, sensitivityWord } from './api-collections.model';
import { ApiCollectionsApi } from './api-collections.service';
import { currentDefaultAuth } from './collection-save';

export interface CollectionDialogData {
  collection?: CollectionRow;
  /** A platform administrator's workspaces: a new collection names the one it is for. */
  tenants?: ComboboxOption[];
}

type AuthBlocks = Record<string, Record<string, string>>;

/**
 * New collection, or a collection's details: name, description, sensitivity, state and the default auth its
 * APIs inherit. The auth's secret fields take a {{variable}} only -- the value is set, sealed, in an environment,
 * which is where Replace lives. Closes with the collection's id when saved.
 */
@Component({
  selector: 'app-collection-dialog',
  imports: [FormDialog, Field, Combobox],
  template: `
    <app-form-dialog [heading]="isEdit() ? 'Edit collection' : 'New API collection'"
                     [subtitle]="isEdit() ? data.collection!.name : 'A set of APIs, with the auth they share and the environments they run in.'"
                     [confirmLabel]="isEdit() ? 'Save changes' : 'Create'" [saving]="saving()" [confirmDisabled]="loadingAuth()"
                     (confirmed)="save()" (cancelled)="ref.close(null)">
      <div class="form-stack">
        @if (data.tenants && !isEdit()) {
          <app-field label="Workspace" for="acTenant" [required]="true" hint="A collection belongs to one workspace; only its pipelines can use it.">
            <app-combobox id="acTenant" [selected]="tenantId()" (selectedChange)="tenantId.set($event || null)" [options]="data.tenants" [allowClear]="false" placeholder="Search workspaces…" />
          </app-field>
        }
        <div class="form-grid">
          <app-field label="Name" for="acName" [required]="true">
            <input id="acName" class="input" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="Healthcare APIs" />
          </app-field>
          <app-field label="Sensitivity" for="acSensitivity" hint="The data policy for this level applies to what its APIs return.">
            <select id="acSensitivity" class="input" [value]="sensitivity()" (change)="sensitivity.set($any($event.target).value)">
              <option value="">Not set</option>
              @for (s of sensitivities(); track s) { <option [value]="s" [selected]="s === sensitivity()">{{ label(s) }}</option> }
            </select>
          </app-field>
        </div>
        <app-field label="Description" for="acDescription">
          <input id="acDescription" class="input" [value]="description()" (input)="description.set($any($event.target).value)" placeholder="What these APIs are for" />
        </app-field>
        @if (isEdit()) {
          <app-field label="State" for="acStatus" hint="An inactive collection's APIs are not offered to new pipeline steps.">
            <select id="acStatus" class="input" [value]="status()" (change)="status.set($any($event.target).value)">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </app-field>
        }

        <fieldset class="form-section" [disabled]="loadingAuth() || !!authError()">
          <legend class="form-section-title">Default auth</legend>
          <p class="text-xs text-[color:var(--text-muted)] mb-3">
            What an API set to "From the collection" signs in with. Secret fields take a variable such as
            <span class="mono">{{ tokenExample }}</span>; set its value in an environment, marked Secret.
          </p>
          @if (loadingAuth()) {
            <p class="text-sm text-[color:var(--text-muted)]" role="status">Reading the current auth…</p>
          } @else if (authError()) {
            <p class="text-sm text-crit-500" role="alert">The current auth could not be read, so nothing can be saved: {{ authError() }}</p>
          } @else {
            <app-field label="Scheme" for="acAuthType">
              <select id="acAuthType" class="input" [value]="authType()" (change)="authType.set($any($event.target).value)">
                @for (m of schemes; track m) { <option [value]="m" [selected]="m === authType()">{{ authText(m) }}</option> }
              </select>
            </app-field>
            @if (fields().length) {
              <div class="form-grid mt-3">
                @for (f of fields(); track f.key) {
                  <app-field [label]="f.label" [for]="'acAuth-' + f.key" [hint]="f.secret ? secretHint : ''">
                    <input [id]="'acAuth-' + f.key" class="input mono" [value]="authValue(f.key)" [placeholder]="f.placeholder || ''"
                           autocomplete="off" (input)="setAuthField(f.key, $any($event.target).value)" />
                  </app-field>
                }
              </div>
            }
          }
        </fieldset>
        @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
      </div>
    </app-form-dialog>
  `,
})
export class CollectionDialog {
  readonly ref = inject<DialogRef<number | null>>(DialogRef);
  readonly data = inject<CollectionDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiCollectionsApi);
  private readonly toast = inject(ToastService);

  readonly isEdit = computed(() => !!this.data.collection?.collectionId);
  readonly name = signal(this.data.collection?.name ?? '');
  readonly description = signal(this.data.collection?.description ?? '');
  /** The word the collection was given -- what a save sends back; the service reads the level from it (MIG-243). */
  readonly sensitivity = signal(this.data.collection ? sensitivityWord(this.data.collection) ?? '' : '');
  readonly status = signal(this.data.collection?.status ?? 'Active');
  readonly tenantId = signal<string | null>(null);
  readonly authType = signal('NONE');
  /** Every scheme's block as read, so an imported collection's other schemes survive an edit of one. */
  private readonly blocks = signal<AuthBlocks>({});
  readonly loadingAuth = signal(false);
  readonly authError = signal('');
  readonly saving = signal(false);
  readonly error = signal('');

  readonly tokenExample = '{{token}}';
  readonly secretHint = 'A {{variable}}, never the secret itself.';
  readonly schemes = ['NONE', 'BEARER', 'BASIC', 'APIKEY', 'OAUTH2'];
  readonly fields = computed(() => AUTH_FIELDS[this.authType()] ?? []);
  /** The known levels, and whatever this collection already says if it is none of them. */
  readonly sensitivities = computed(() => {
    const current = this.sensitivity();
    return current && !(SENSITIVITIES as readonly string[]).includes(current) ? [...SENSITIVITIES, current] : [...SENSITIVITIES];
  });

  constructor() {
    const row = this.data.collection;
    if (row?.collectionId) {
      this.loadingAuth.set(true);
      currentDefaultAuth(this.api, row).subscribe({
        next: read => {
          this.loadingAuth.set(false);
          if ('error' in read) { this.authError.set(read.error); return; }
          this.readAuth(read.auth);
        },
        error: err => { this.loadingAuth.set(false); this.authError.set(err?.error?.message || 'the service did not answer'); },
      });
    }
  }

  label(level: string): string { return sensitivityLabel(level); }
  authText(mode: string): string { return mode === 'NONE' ? 'None' : authLabel(mode); }

  authValue(key: string): string { return this.blocks()[this.authType().toLowerCase()]?.[key] ?? ''; }

  setAuthField(key: string, value: string): void {
    const block = this.authType().toLowerCase();
    this.blocks.update(all => ({ ...all, [block]: { ...(all[block] ?? {}), [key]: value } }));
  }

  /** The default auth as saved: its type, then each block -- the settings at the top level move into their block. */
  private readAuth(auth: unknown): void {
    if (!auth || typeof auth !== 'object') return;
    const source = auth as Record<string, unknown>;
    const type = String(source['type'] ?? 'NONE').toUpperCase();
    const blocks: AuthBlocks = {};
    const loose: Record<string, string> = {};
    for (const [k, v] of Object.entries(source)) {
      if (k === 'type') continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        blocks[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([f, x]) => [f, x == null ? '' : String(x)]));
      } else if (v != null) loose[k] = String(v);
    }
    if (Object.keys(loose).length && type !== 'NONE') blocks[type.toLowerCase()] = { ...loose, ...(blocks[type.toLowerCase()] ?? {}) };
    this.blocks.set(blocks);
    this.authType.set(this.schemes.includes(type) ? type : 'NONE');
  }

  /** The default auth to send, or what to fix. Blank fields are left out; secret ones must be references. */
  private authBody(): { auth: unknown } | { error: string } {
    const type = this.authType();
    const blocks: Record<string, Record<string, string>> = {};
    for (const [name, block] of Object.entries(this.blocks())) {
      const kept = Object.fromEntries(Object.entries(block).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      if (Object.keys(kept).length) blocks[name] = kept;
    }
    for (const f of AUTH_FIELDS[type] ?? []) {
      const value = blocks[type.toLowerCase()]?.[f.key] ?? '';
      if (f.secret && value && !holdsReference(value)) return { error: `${f.label} must be a {{variable}}: put the secret in an environment, marked Secret.` };
    }
    if (type === 'NONE' && !Object.keys(blocks).length) return { auth: null };
    return { auth: { type, ...blocks } };
  }

  save(): void {
    this.error.set('');
    if (this.loadingAuth() || this.authError()) return;
    const name = this.name().trim();
    if (!name) { this.error.set('Give the collection a name.'); return; }
    if (this.data.tenants && !this.isEdit() && !this.tenantId()) { this.error.set('Choose the workspace the collection is for.'); return; }
    const auth = this.authBody();
    if ('error' in auth) { this.error.set(auth.error); return; }
    const body: Record<string, unknown> = {
      collectionId: this.data.collection?.collectionId ?? null,
      name,
      description: this.description().trim() || null,
      sensitivity: this.sensitivity() || null,
      status: this.status(),
      defaultAuth: auth.auth,
    };
    if (this.tenantId() && !this.isEdit()) body['tenantId'] = Number(this.tenantId());
    this.saving.set(true);
    this.api.saveCollection(body).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.toast.success(r.message);
        this.ref.close(r.data?.collectionId ?? r.data?.id ?? null);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The collection could not be saved.'); },
    });
  }
}
