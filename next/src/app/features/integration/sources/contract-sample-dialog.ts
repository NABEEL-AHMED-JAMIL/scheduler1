import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { ComboboxOption } from '../../../shared/ui/combobox';
import {
  ContractRow, DIRECTIONS, Proposal, SENSITIVITIES, contractSaveOf, directionLabel, parseSample, requiredPaths,
} from './sources.model';
import { SourcesApi } from './sources.service';

export interface ContractSampleData {
  /** Absent: a new contract, saved as v1. Present: a new version of this one. */
  contract?: ContractRow;
  /** A platform administrator's workspaces: a new contract names the one it is for. */
  tenants?: ComboboxOption[];
}

/**
 * A contract proposed from a sample (MIG-233): paste a JSON payload, the service proposes a schema from it (nothing
 * is saved), tick the fields every payload must carry, and save -- v1 of a new contract, or the next version of an
 * existing one. The sample is kept with the version, masked by the service.
 */
@Component({
  selector: 'app-contract-sample-dialog',
  imports: [FormDialog, Field, Icon],
  template: `
    <app-form-dialog [heading]="data.contract ? 'New version of ' + data.contract.name : 'New data contract'"
                     [subtitle]="subtitle" size="wide" [confirmLabel]="data.contract ? 'Save version' : 'Save v1'"
                     [saving]="saving()" [confirmDisabled]="!proposal()" (confirmed)="save()" (cancelled)="ref.close(false)">
      <div class="form-stack">
        @if (!data.contract) {
          @if (data.tenants) {
            <app-field label="Workspace" for="csTenant" [required]="true">
              <select id="csTenant" class="input" [value]="tenantId() ?? ''" (change)="tenantId.set($any($event.target).value ? +$any($event.target).value : null)">
                <option value="">Pick a workspace</option>
                @for (t of data.tenants; track t.value) { <option [value]="t.value" [selected]="t.value === (tenantId() + '')">{{ t.label }}</option> }
              </select>
            </app-field>
          }
          <div class="form-grid">
            <app-field label="Name" for="csName" [required]="true" hint="Letters, digits, spaces, _ . and -.">
              <input id="csName" class="input" [value]="name()" placeholder="orders_intake" (input)="name.set($any($event.target).value)" />
            </app-field>
            <app-field label="Direction" for="csDirection">
              <select id="csDirection" class="input" [value]="direction()" (change)="direction.set($any($event.target).value)">
                @for (d of directions; track d) { <option [value]="d" [selected]="d === direction()">{{ directionText(d) }}</option> }
              </select>
            </app-field>
            <app-field label="Sensitivity" for="csSensitivity">
              <select id="csSensitivity" class="input" [value]="sensitivity()" (change)="sensitivity.set($any($event.target).value)">
                <option value="">Not set</option>
                @for (s of sensitivities; track s) { <option [value]="s" [selected]="s === sensitivity()">{{ s }}</option> }
              </select>
            </app-field>
          </div>
        }
        <app-field label="Sample" for="csSample" [required]="true" hint="One payload as JSON, or a list of them. Values a policy hides are masked before the sample is kept.">
          <textarea id="csSample" class="input mono text-xs" rows="8" [value]="sample()" [placeholder]="samplePlaceholder" (input)="sample.set($any($event.target).value)"></textarea>
        </app-field>
        <div><button type="button" class="btn btn-default btn-sm" [disabled]="proposing()" (click)="propose()"><app-icon name="sparkle" [class.spin]="proposing()" />Propose schema</button></div>

        @if (proposal(); as p) {
          <fieldset class="form-section">
            <legend class="form-section-title">Fields: tick what every payload must carry</legend>
            <div class="overflow-x-auto">
              <table class="table-modern" data-test="proposal-fields">
                <thead><tr><th>Required</th><th>Field</th><th>Type</th></tr></thead>
                <tbody>
                  @for (f of p.fields; track f.path) {
                    <tr>
                      <td class="w-24"><input type="checkbox" class="checkbox" [checked]="isRequired(f.path)" [attr.aria-label]="'Required: ' + f.path" (change)="toggleRequired(f.path, $any($event.target).checked)" /></td>
                      <td class="mono text-xs [overflow-wrap:anywhere]">{{ f.path }}</td>
                      <td class="mono text-xs whitespace-nowrap">{{ f.type }}@if (f.nullable) { <span class="text-[color:var(--text-muted)]"> | null</span> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <label class="flex items-center gap-2 text-sm mt-3">
              <input type="checkbox" class="checkbox" [checked]="activate()" (change)="activate.set($any($event.target).checked)" />
              Make it the active version: pipelines check with it unless they pinned another
            </label>
          </fieldset>
        }
        @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
      </div>
    </app-form-dialog>
  `,
})
export class ContractSampleDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<ContractSampleData>(DIALOG_DATA);
  private readonly api = inject(SourcesApi);
  private readonly toast = inject(ToastService);

  readonly directions = DIRECTIONS;
  readonly sensitivities = SENSITIVITIES;
  readonly subtitle = 'Paste a sample, propose a schema from it, then mark the fields every payload must carry.';
  readonly samplePlaceholder = '{"order_id": "A-1", "total": 12.5, "items": [{"sku": "X", "qty": 1}]}';

  readonly tenantId = signal<number | null>(null);
  readonly name = signal('');
  readonly direction = signal(this.data.contract?.direction ?? 'IN');
  readonly sensitivity = signal('');
  readonly sample = signal('');
  readonly activate = signal(true);
  readonly proposal = signal<Proposal | null>(null);
  private readonly requiredSet = signal<Set<string>>(new Set());
  readonly required = computed(() => (this.proposal()?.fields ?? []).map(f => f.path).filter(p => this.requiredSet().has(p)));
  readonly proposing = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  directionText(d: string): string { return directionLabel(d); }
  isRequired(path: string): boolean { return this.requiredSet().has(path); }

  toggleRequired(path: string, on: boolean): void {
    this.requiredSet.update(set => { const next = new Set(set); if (on) next.add(path); else next.delete(path); return next; });
  }

  propose(): void {
    const parsed = parseSample(this.sample());
    if (parsed.error !== undefined) { this.error.set(parsed.error); return; }
    this.error.set('');
    this.proposing.set(true);
    this.api.infer({ sample: parsed.value }).subscribe({
      next: r => {
        this.proposing.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message); return; }
        this.proposal.set({ ...r.data, fields: r.data.fields ?? [] });
        this.requiredSet.set(new Set(requiredPaths(r.data.fields ?? [])));
      },
      error: err => { this.proposing.set(false); this.error.set(err?.error?.message || 'No schema could be proposed.'); },
    });
  }

  save(): void {
    const p = this.proposal();
    if (this.data.tenants && !this.data.contract && this.tenantId() == null) { this.error.set('Pick the workspace the contract is for.'); return; }
    const out = contractSaveOf({
      contractId: this.data.contract?.id ?? null, name: this.name(), direction: this.direction(), sensitivity: this.sensitivity(),
      schema: p?.schema ?? null, required: this.required(), sample: p?.sample ?? null, activate: this.activate(), tenantId: this.tenantId(),
    });
    if ('error' in out) { this.error.set(out.error); return; }
    this.saving.set(true);
    this.api.saveContract(out.body).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message); return; }
        this.toast.success(`Saved as v${r.data.version}${r.data.status === 'ACTIVE' ? ', the active version' : ''}.`);
        this.ref.close(true);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The contract could not be saved.'); },
    });
  }
}
