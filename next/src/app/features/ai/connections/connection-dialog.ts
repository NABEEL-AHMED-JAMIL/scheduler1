import { Component, computed, effect, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Combobox } from '../../../shared/ui/combobox';
import { AI_PROVIDERS, ModelConnection, providerOf } from '../ai-providers';

/**
 * Add or edit a model connection: where prompts run. The key travels in once and never
 * back; on an edit a blank key keeps the stored one. The two caps are here rather than on
 * a prompt because a bill is per key, not per prompt.
 */
@Component({
  selector: 'app-connection-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Combobox],
  template: `
    <app-form-dialog [heading]="isEdit() ? 'Edit connection' : 'New model connection'"
                     [subtitle]="isEdit() ? data.connection!.name : 'A provider, a key and a default model. Prompts pick a connection or take the workspace default.'"
                     [confirmLabel]="confirmLabel()" [saving]="saving()"
                     (confirmed)="save()" (cancelled)="ref.close(false)">
      <form [formGroup]="form" class="form-stack" (ngSubmit)="save()">
        <div class="form-grid">
          <app-field label="Name" for="cxName" [required]="true" [control]="form.get('name')" [submitted]="submitted()">
            <input id="cxName" class="input" formControlName="name" placeholder="OpenAI · production" />
          </app-field>
          <app-field label="Provider" for="cxProvider" [required]="true" [control]="form.get('provider')" [submitted]="submitted()">
            <select id="cxProvider" class="input" formControlName="provider">
              @for (p of providers; track p.key) { <option [value]="p.key">{{ p.label }}</option> }
            </select>
          </app-field>
        </div>
        @if (data.tenants?.length && !isEdit()) {
          <app-field label="Workspace" for="cxTenant" [required]="true" [control]="form.get('tenantId')" [submitted]="submitted()"
                     hint="A connection belongs to one workspace; only its prompts can run on it.">
            <app-combobox id="cxTenant" formControlName="tenantId" [numeric]="true" placeholder="Search workspaces…" [allowClear]="false" [options]="tenantOptions()" />
          </app-field>
        }
        <app-field label="API endpoint" for="cxEndpoint" [control]="form.get('apiEndpoint')" [submitted]="submitted()"
                   [required]="endpointRequired()" [hint]="provider().endpointHint">
          <input id="cxEndpoint" class="input mono" formControlName="apiEndpoint" [placeholder]="provider().builtInEndpoint ? 'built in' : 'https://…'" />
        </app-field>
        @if (provider().needsKey) {
          <app-field label="API key" for="cxKey" [control]="form.get('apiKey')" [submitted]="submitted()"
                     [required]="keyRequired()"
                     [hint]="isEdit() && data.connection?.apiKeyConfigured ? 'A key is stored. Leave blank to keep it; paste a new one to rotate it.' : 'Encrypted at rest and never sent back to the browser.'">
            <input id="cxKey" type="password" class="input" formControlName="apiKey" autocomplete="new-password" placeholder="paste the provider key" />
          </app-field>
        } @else {
          <p class="text-sm rounded-md px-3 py-2 bg-sunken">Ollama runs locally and needs no API key.</p>
        }
        <div class="form-grid">
          <app-field label="Default model" for="cxModel" [required]="true" [control]="form.get('defaultModel')" [submitted]="submitted()"
                     [hint]="'What a prompt runs on unless it names a model — e.g. ' + provider().modelHint + '. Test connection lists what the provider has.'">
            <input id="cxModel" class="input mono" formControlName="defaultModel" [placeholder]="provider().modelHint" list="cxModels" />
            <datalist id="cxModels">@for (m of data.connection?.models ?? []; track m) { <option [value]="m"></option> }</datalist>
          </app-field>
          <app-field label="State" for="cxStatus" [control]="form.get('status')" [submitted]="submitted()">
            <select id="cxStatus" class="input" formControlName="status">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </app-field>
        </div>
        <div class="form-grid">
          <app-field label="Calls in flight" for="cxConc" [control]="form.get('maxConcurrency')" [submitted]="submitted()"
                     hint="At most this many calls at once through this key; the rest wait in order.">
            <input id="cxConc" type="number" min="1" max="64" class="input" formControlName="maxConcurrency" />
          </app-field>
          <app-field label="Daily token budget" for="cxBudget" [control]="form.get('dailyTokenBudget')" [submitted]="submitted()"
                     hint="Once the day's runs reach it, a step fails before any call is made. Blank means no cap.">
            <input id="cxBudget" type="number" min="1" step="1000" class="input" formControlName="dailyTokenBudget" placeholder="e.g. 500000" />
          </app-field>
        </div>
      </form>
    </app-form-dialog>
  `,
})
export class ConnectionDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ connection?: ModelConnection; tenants?: { tenantId: number; tenantName: string }[] }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly providers = AI_PROVIDERS;
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.connection?.connectionId);
  readonly tenantOptions = computed(() => (this.data.tenants ?? []).map(t => ({ value: String(t.tenantId), label: t.tenantName })));

  readonly form = this.fb.group({
    name: [this.data.connection?.name ?? '', Validators.required],
    provider: [this.data.connection?.provider ?? 'OpenAI', Validators.required],
    tenantId: [null as number | null],
    apiEndpoint: [this.data.connection?.apiEndpoint ?? ''],
    apiKey: [''],
    defaultModel: [this.data.connection?.defaultModel ?? '', Validators.required],
    status: [this.data.connection?.status ?? 'Active'],
    maxConcurrency: [this.data.connection?.maxConcurrency ?? 4],
    dailyTokenBudget: [this.data.connection?.dailyTokenBudget ?? null as number | null],
  });

  private readonly providerKey = toSignal(this.form.get('provider')!.valueChanges, { initialValue: this.form.get('provider')!.value });
  readonly provider = computed(() => providerOf(this.providerKey()));

  /** Every other edit dialog says "Save changes". */
  readonly confirmLabel = computed(() => this.isEdit() ? 'Save changes' : 'Create');

  readonly endpointRequired = computed(() => !this.provider().builtInEndpoint);
  readonly keyRequired = computed(() =>
    this.provider().needsKey && !(this.isEdit() && this.data.connection?.apiKeyConfigured));
  private readonly workspaceRequired = !!this.data.tenants?.length && !this.isEdit();

  /**
   * app-field's [required] only draws the star. The endpoint, key and workspace were checked by
   * a toast each after the form had already passed as valid, with no field marked; the stars
   * and the validators now read the same signals, as the Kafka dialog does.
   */
  private readonly conditionalValidators = effect(() => {
    this.require('apiEndpoint', this.endpointRequired());
    this.require('apiKey', this.keyRequired());
    this.require('tenantId', this.workspaceRequired);
  });

  private require(name: string, required: boolean): void {
    const control = this.form.get(name)!;
    control.setValidators(required ? [Validators.required, notBlank] : null);
    control.updateValueAndValidity({ emitEvent: false });
  }

  save(): void {
    this.submitted.set(true);
    const v = this.form.getRawValue();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    this.saving.set(true);
    const body = {
      connectionId: this.data.connection?.connectionId,
      name: v.name, provider: v.provider, tenantId: v.tenantId, apiEndpoint: v.apiEndpoint, apiKey: v.apiKey || null,
      defaultModel: v.defaultModel, status: v.status,
      maxConcurrency: Number(v.maxConcurrency) || 4, dailyTokenBudget: v.dailyTokenBudget ? Number(v.dailyTokenBudget) : null,
    };
    this.http.post<ApiResponse>(`${API_BASE}/aiConnection.json/save`, body).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.ref.close(true); }
        else this.toast.error(r.message);
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.message || 'The connection could not be saved.'); },
    });
  }
}

/** Validators.required lets a string of spaces through; an endpoint or key of spaces is none. */
function notBlank(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  return typeof value === 'string' && !value.trim() ? { required: true } : null;
}
