import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { EnvironmentRow, VariableEdit, variableEdits, variableSaves } from './api-collections.model';
import { ApiCollectionsApi } from './api-collections.service';

export interface EnvironmentDialogData {
  collectionId: number;
  environment?: EnvironmentRow;
  /** The collection has no environment yet: this one becomes the default. */
  first?: boolean;
}

/**
 * An environment and its variables: what {{name}} fills in when an API runs. A variable marked Secret is sealed
 * as it arrives and never sent back -- here it is "••• configured" with Replace, and a replacement is a
 * write-only box. Plain variables (a base URL, a tenant code) show their values.
 */
@Component({
  selector: 'app-environment-dialog',
  imports: [FormDialog, Field, Icon],
  template: `
    <app-form-dialog [heading]="data.environment ? 'Edit environment' : 'New environment'"
                     [subtitle]="subtitle"
                     [confirmLabel]="data.environment ? 'Save changes' : 'Create'" [saving]="saving()" size="wide"
                     (confirmed)="save()" (cancelled)="ref.close(false)">
      <div class="form-stack">
        <div class="form-grid">
          <app-field label="Name" for="envName" [required]="true">
            <input id="envName" class="input" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="Production" />
          </app-field>
          <label class="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" class="checkbox" [checked]="isDefault()" (change)="isDefault.set($any($event.target).checked)" />
            Default: a test and a pipeline step run with it unless they name another
          </label>
        </div>

        <div class="overflow-x-auto">
        <table class="table-modern min-w-[34rem]">
          <thead><tr><th>Variable</th><th>Value</th><th>Secret</th><th class="w-10"><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>
            @for (v of rows(); track $index; let i = $index) {
              <tr>
                <td class="w-48"><input class="input input-sm mono" [value]="v.key" placeholder="baseUrl" [attr.aria-label]="'Name of variable ' + (i + 1)" (input)="setKey(i, $any($event.target).value)" /></td>
                <td>
                  @if (!v.secret) {
                    <input class="input input-sm mono" [value]="v.value" autocomplete="off" [attr.aria-label]="'Value of ' + (v.key || 'variable ' + (i + 1))" (input)="setValue(i, $any($event.target).value)" />
                  } @else if (v.wasSecret && v.configured && !v.replacing) {
                    <div class="flex items-center gap-2">
                      <span class="secret-mask mono" aria-hidden="true">•••••••</span>
                      <span class="text-xs text-[color:var(--text-secondary)]"><app-icon name="lock" size="0.85em" /> configured</span>
                      <button type="button" class="btn btn-ghost btn-xs ml-auto" [attr.aria-label]="'Replace ' + v.key" (click)="replace(i)">Replace</button>
                    </div>
                  } @else if (v.replacing) {
                    <div class="flex items-center gap-2">
                      <input class="input input-sm mono" type="password" autocomplete="new-password" [value]="v.value" placeholder="the new value"
                             [attr.aria-label]="'New value of ' + v.key" (input)="setValue(i, $any($event.target).value)" />
                      <button type="button" class="btn btn-ghost btn-xs" [attr.aria-label]="'Keep the stored ' + v.key" (click)="keep(i)">Keep</button>
                    </div>
                  } @else {
                    <div class="flex items-center gap-2">
                      <input class="input input-sm mono" type="password" autocomplete="new-password" [value]="v.value" placeholder="write-only"
                             [attr.aria-label]="'Value of ' + (v.key || 'variable ' + (i + 1))" (input)="setValue(i, $any($event.target).value)" />
                      @if (v.wasSecret && !v.configured) { <span class="text-xs text-[color:var(--text-muted)] whitespace-nowrap">not set</span> }
                    </div>
                  }
                </td>
                <td class="w-20">
                  <input type="checkbox" class="checkbox" [checked]="v.secret" [attr.aria-label]="'Secret: ' + (v.key || 'variable ' + (i + 1))"
                         (change)="setSecret(i, $any($event.target).checked)" />
                </td>
                <td>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Remove ' + (v.key || 'variable ' + (i + 1))" (click)="remove(i)">
                    <app-icon name="close" size="0.85em" />
                  </button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="text-sm text-[color:var(--text-muted)]">No variables yet.</td></tr>
            }
          </tbody>
        </table></div>
        <div><button type="button" class="btn btn-ghost btn-sm" (click)="addVariable()"><app-icon name="plus" size="0.85em" />Add variable</button></div>
        @if (discards().length) {
          <p class="text-xs text-warn-600" role="status">Saving discards the stored secret of {{ discards().join(', ') }}: it is not revealed, only replaced by what you type.</p>
        }
        @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
      </div>
    </app-form-dialog>
  `,
})
export class EnvironmentDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<EnvironmentDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiCollectionsApi);
  private readonly toast = inject(ToastService);

  readonly subtitle = 'Values an API\'s {{variables}} take when it runs. A secret is sealed on arrival and never shown again: replace it, don\'t read it.';
  readonly name = signal(this.data.environment?.name ?? '');
  readonly isDefault = signal(this.data.environment?.isDefault ?? !!this.data.first);
  readonly rows = signal<VariableEdit[]>(variableEdits(this.data.environment?.variables ?? []));
  readonly saving = signal(false);
  readonly error = signal('');
  /** Stored secrets switched to plain: saving drops the sealed value. */
  readonly discards = computed(() => this.rows().filter(r => r.wasSecret && r.configured && !r.secret).map(r => r.key));

  private update(i: number, change: Partial<VariableEdit>): void {
    this.rows.update(list => list.map((r, k) => k === i ? { ...r, ...change } : r));
  }

  setKey(i: number, key: string): void { this.update(i, { key }); }
  setValue(i: number, value: string): void { this.update(i, { value }); }
  replace(i: number): void { this.update(i, { replacing: true, value: '' }); }
  keep(i: number): void { this.update(i, { replacing: false, value: '' }); }
  /**
   * A secret's box always starts empty: switching either way never carries a value across. A plain variable marked
   * Secret and saved without a new value has its stored value sealed by the service.
   */
  setSecret(i: number, secret: boolean): void { this.update(i, { secret, value: '', replacing: false }); }
  addVariable(): void { this.rows.update(list => [...list, { key: '', secret: false, value: '', configured: false, replacing: false, wasSecret: false }]); }
  remove(i: number): void { this.rows.update(list => list.filter((_, k) => k !== i)); }

  save(): void {
    this.error.set('');
    const name = this.name().trim();
    if (!name) { this.error.set('Give the environment a name.'); return; }
    const seen = new Set<string>();
    for (const r of this.rows()) {
      const key = r.key.trim();
      if (!key) continue;
      if (seen.has(key)) { this.error.set(`${key} is listed twice.`); return; }
      seen.add(key);
    }
    this.saving.set(true);
    this.api.saveEnvironment({
      environmentId: this.data.environment?.environmentId ?? null, collectionId: this.data.collectionId, name,
      isDefault: this.isDefault(), variables: variableSaves(this.rows()),
    }).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        // What was typed into a secret's box is not kept a moment longer than the save needed it.
        this.rows.update(list => list.map(v => v.secret ? { ...v, value: '' } : v));
        this.toast.success(r.message);
        this.ref.close(true);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The environment could not be saved.'); },
    });
  }
}
