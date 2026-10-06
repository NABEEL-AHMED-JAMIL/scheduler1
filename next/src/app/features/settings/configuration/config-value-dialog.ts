import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { CONFIG_KEY_PATTERN, PipelineConfig, TenantOption, configReference, notBlank, suggestedKey } from './configuration.models';

export interface ConfigValueDialogData {
  /** create: a new entry. edit: a value, or a secret's description. replace: a secret's new value. */
  mode: 'create' | 'edit' | 'replace';
  row?: PipelineConfig;
  /** A platform administrator's workspaces, and the one the list is narrowed to, if any. */
  tenants?: TenantOption[];
  tenantId?: number | null;
}

type Kind = 'VALUE' | 'SECRET';

const KIND_OPTIONS: SegmentOption<Kind>[] = [
  { id: 'VALUE', label: 'Value', icon: 'settings' },
  { id: 'SECRET', label: 'Secret', icon: 'lock' },
];

/**
 * Adds a configuration entry, edits one, or replaces a secret.
 *
 * A secret is write-only from end to end: this box is a password field the browser is told not
 * to fill, it is never pre-filled (there is nothing to pre-fill it with -- no answer carries a
 * secret), and whatever was typed is wiped from the form the moment the request leaves, whether
 * the server then takes it or not.
 */
@Component({
  selector: 'app-config-value-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Combobox, Segmented],
  template: `
    <app-form-dialog
        [heading]="heading()"
        [subtitle]="subtitle()"
        [confirmLabel]="data.mode === 'create' ? 'Create' : data.mode === 'replace' ? 'Replace secret' : 'Save changes'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack" autocomplete="off">
        @if (needsWorkspace()) {
          <app-field label="Workspace" for="cfgTenant" [required]="true"
                     [control]="form.get('tenantId')" [submitted]="submitted()"
                     hint="An entry belongs to one workspace; only that workspace's tasks can reference it.">
            <app-combobox id="cfgTenant" formControlName="tenantId" [numeric]="true"
                          placeholder="Search workspaces…" [allowClear]="false" [options]="tenantOptions()" />
          </app-field>
        }

        @if (data.mode === 'create') {
          <app-field label="Key" for="cfgKey" [required]="true"
                     [control]="form.get('key')" [submitted]="submitted()"
                     hint="Capital letters, digits and underscores, a letter first — up to 64 characters."
                     [errorMessages]="{ pattern: 'Use capital letters, digits and underscores, starting with a letter — such as INPUT_BUCKET.' }">
            <input id="cfgKey" class="input mono" formControlName="key" placeholder="INPUT_BUCKET"
                   autocomplete="off" spellcheck="false" />
          </app-field>
          @if (suggestion(); as upper) {
            <div class="flex flex-wrap items-center gap-2 text-sm -mt-2">
              <span class="text-[color:var(--text-secondary)]">Keys are UPPER_SNAKE.</span>
              <button type="button" class="btn btn-default btn-sm" (click)="applySuggestion(upper)">
                Use <span class="mono">{{ upper }}</span>
              </button>
            </div>
          }

          <div class="field">
            <span class="label">Kind</span>
            <app-segmented [value]="kind()" (valueChange)="setKind($any($event))" [options]="kindOptions" ariaLabel="Kind" />
            <p class="field-note text-[color:var(--text-muted)]">
              {{ secret()
                  ? 'Stored encrypted and never shown again — not here, not to anyone. The worker reads it at run time.'
                  : 'Readable by anyone who can open this page.' }}
            </p>
          </div>
        }

        @if (showsValue()) {
          <app-field [label]="secret() ? (data.mode === 'replace' ? 'New secret' : 'Secret') : 'Value'" for="cfgValue" [required]="true"
                     [control]="form.get('value')" [submitted]="submitted()"
                     [hint]="valueHint()">
            <input id="cfgValue" class="input mono" formControlName="value"
                   [type]="secret() ? 'password' : 'text'"
                   [attr.autocomplete]="secret() ? 'new-password' : 'off'"
                   spellcheck="false"
                   [placeholder]="secret() ? 'Type the secret' : 's3://claims-in'" />
          </app-field>
        }

        @if (data.mode !== 'replace') {
          <app-field label="Description" for="cfgDescription"
                     [control]="form.get('description')" [submitted]="submitted()">
            <textarea id="cfgDescription" class="input" rows="2" formControlName="description"
                      placeholder="What this is for"></textarea>
          </app-field>
        }

        @if (reference()) {
          <p class="text-xs text-[color:var(--text-muted)]">
            A task references it as <span class="mono">{{ reference() }}</span>.
          </p>
        }
      </form>
    </app-form-dialog>
  `,
})
export class ConfigValueDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<ConfigValueDialogData>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly kindOptions = KIND_OPTIONS;
  readonly saving = signal(false);
  readonly submitted = signal(false);

  /** A platform administrator has no workspace of their own, so a new entry must name one. */
  readonly needsWorkspace = computed(() => this.data.mode === 'create' && this.auth.isPlatformAdmin());
  readonly tenantOptions = computed<ComboboxOption[]>(() =>
    (this.data.tenants ?? []).map(t => ({ value: String(t.tenantId), label: t.tenantName, hint: t.tenantCode ?? '' })));

  private readonly row = this.data.row;
  private readonly editsValue = this.data.mode === 'create' || this.data.mode === 'replace' || this.row?.kind === 'VALUE';

  readonly form = this.fb.group({
    tenantId: [this.data.tenantId ?? null as number | null, this.needsWorkspace() ? Validators.required : []],
    key: [this.row?.key ?? '', this.data.mode === 'create' ? [Validators.required, Validators.pattern(CONFIG_KEY_PATTERN)] : []],
    kind: this.fb.nonNullable.control<Kind>(this.row?.kind ?? 'VALUE'),
    // A secret's box always starts empty; a value's starts with what is stored.
    value: [this.data.mode === 'edit' && this.row?.kind === 'VALUE' ? (this.row.value ?? '') : '',
            this.editsValue ? [notBlank, Validators.maxLength(4000)] : []],
    description: [this.row?.description ?? ''],
  });

  readonly kind = toSignal(this.form.controls.kind.valueChanges, { initialValue: this.form.controls.kind.value });
  readonly secret = computed(() => this.kind() === 'SECRET');
  private readonly key = toSignal(this.form.controls.key.valueChanges, { initialValue: this.form.controls.key.value });
  /** The upper-cased key, offered when what was typed only fails on case or spacing. */
  readonly suggestion = computed(() => this.data.mode === 'create' ? suggestedKey(this.key()) : null);
  readonly reference = computed(() => {
    const key = (this.key() ?? '').trim();
    return CONFIG_KEY_PATTERN.test(key) ? configReference(this.kind() ?? 'VALUE', key) : '';
  });

  readonly showsValue = computed(() => this.editsValue);

  readonly heading = computed(() => {
    if (this.data.mode === 'create') return 'New configuration value';
    if (this.data.mode === 'replace') return `Replace ${this.row?.key}`;
    return `Edit ${this.row?.key}`;
  });

  readonly subtitle = computed(() => {
    if (this.data.mode === 'replace') return 'The current secret is never shown. Saving replaces it for every task that references it.';
    if (this.data.mode === 'edit' && this.row?.kind === 'SECRET') return 'The description only. Use Replace secret to change the secret itself.';
    return 'A value a task\'s payload reads at run time, per workspace.';
  });

  readonly valueHint = computed(() => this.secret()
    ? 'Write-only: once saved it cannot be read back, only replaced.'
    : 'Up to 4,000 characters.');

  setKind(kind: Kind): void { this.form.controls.kind.setValue(kind); }

  applySuggestion(upper: string): void {
    this.form.controls.key.setValue(upper);
    this.form.controls.key.markAsTouched();
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    const description = (v.description ?? '').trim();
    let body: Record<string, unknown>;
    if (this.data.mode === 'create') {
      body = { key: (v.key ?? '').trim(), kind: v.kind, value: v.value };
      if (description) body['description'] = description;
      if (this.needsWorkspace()) body['tenantId'] = v.tenantId;
    } else if (this.data.mode === 'replace') {
      body = { id: this.row!.id, value: v.value };
    } else {
      body = this.row?.kind === 'VALUE'
        ? { id: this.row.id, value: v.value, description }
        : { id: this.row!.id, description };
    }

    this.saving.set(true);
    const url = `${API_BASE}/setting.json/pipelineConfig`;
    const request = this.data.mode === 'create'
      ? this.http.post<ApiResponse<PipelineConfig>>(url, body)
      : this.http.put<ApiResponse<PipelineConfig>>(url, body);
    // Sent: a secret leaves the form now, not when (or whether) the answer comes back.
    if (this.secret()) {
      this.form.controls.value.setValue('');
      this.form.controls.value.markAsUntouched();
      body = {};
    }

    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) { this.toast.success(response.message || 'Saved.'); this.ref.close(true); }
        else this.toast.error(response.message);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The entry could not be saved.');
      },
    });
  }
}
