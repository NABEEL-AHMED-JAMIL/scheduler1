import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { ComboboxOption } from '../../../shared/ui/combobox';
import { TemplateRow, directionLabel } from './sources.model';
import { SourcesApi } from './sources.service';

export interface TemplateDialogData {
  /** The names of the workspace's own contracts: a template already installed is not offered again. */
  installed: string[];
  /** A platform administrator's workspaces: a template is installed into one. */
  tenants?: ComboboxOption[];
}

/** The templates of one group, as the dialog lists them. */
export interface TemplateGroup { key: string; label: string; hint: string; templates: TemplateRow[]; }

/**
 * The contracts a workspace may install (MIG-233): the generic ones first (record_intake, image_measurement_result),
 * then the examples for one domain (wound_intake, wound_result). Installing makes the template the workspace's own
 * contract with v1 active; the service refuses a name the workspace already has. Closes with whether anything was
 * installed.
 */
@Component({
  selector: 'app-template-dialog',
  imports: [FormDialog, Field, Icon],
  template: `
    <app-form-dialog heading="Install a contract template" [subtitle]="subtitle" [showConfirm]="false" cancelLabel="Close" size="wide"
                     (cancelled)="close()">
      <div class="form-stack">
        @if (data.tenants) {
          <app-field label="Workspace" for="tplTenant" [required]="true">
            <select id="tplTenant" class="input" [value]="tenantId() ?? ''" (change)="tenantId.set($any($event.target).value ? +$any($event.target).value : null)">
              <option value="">Pick a workspace</option>
              @for (t of data.tenants; track t.value) { <option [value]="t.value" [selected]="t.value === (tenantId() + '')">{{ t.label }}</option> }
            </select>
          </app-field>
        }
        @if (loading()) {
          <p class="text-sm text-[color:var(--text-muted)]" role="status">Loading…</p>
        }
        @for (g of groups(); track g.key) {
          <section class="flex flex-col gap-2" [attr.aria-labelledby]="'tplGroup-' + g.key">
            <div>
              <h3 class="font-medium" [id]="'tplGroup-' + g.key">{{ g.label }}</h3>
              <p class="text-xs text-[color:var(--text-muted)]">{{ g.hint }}</p>
            </div>
            <ul class="flex flex-col gap-2">
              @for (t of g.templates; track t.code) {
                <li class="card p-3 flex items-start gap-3">
                  <span class="stat-glyph shrink-0"><app-icon name="template" /></span>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium mono">{{ t.code }}</p>
                    <p class="text-xs text-[color:var(--text-muted)]">{{ directionText(t.direction) }}</p>
                    @if (t.description) { <p class="text-sm text-[color:var(--text-secondary)] mt-1">{{ t.description }}</p> }
                  </div>
                  @if (isInstalled(t.code)) {
                    <span class="pill pill-ok shrink-0"><app-icon name="check" size="0.85em" />Installed</span>
                  } @else {
                    <button type="button" class="btn btn-primary btn-sm shrink-0" [disabled]="installing() === t.code" [attr.aria-label]="'Install ' + t.code" (click)="install(t.code)">
                      @if (installing() === t.code) { <app-icon name="refresh" class="spin" /> }Install
                    </button>
                  }
                </li>
              }
            </ul>
          </section>
        }
        @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
      </div>
    </app-form-dialog>
  `,
})
export class TemplateDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<TemplateDialogData>(DIALOG_DATA);
  private readonly api = inject(SourcesApi);
  private readonly toast = inject(ToastService);

  readonly subtitle = 'A template becomes this workspace\'s own contract, with v1 active. Its schema is the one the platform is built around.';
  readonly templates = signal<TemplateRow[]>([]);
  /** Generic first, examples after; a template without a group is generic. */
  readonly groups = computed<TemplateGroup[]>(() => {
    const all = this.templates();
    const examples = all.filter(t => t.group === 'example');
    return [
      { key: 'generic', label: 'Generic', hint: 'A starting point for any contract: install one, then mark the fields your records must have.',
        templates: all.filter(t => t.group !== 'example') },
      { key: 'example', label: 'Examples', hint: 'Complete contracts for one domain, to copy from or install as they are.', templates: examples },
    ].filter(g => g.templates.length);
  });
  readonly loading = signal(true);
  readonly error = signal('');
  readonly installing = signal('');
  readonly tenantId = signal<number | null>(null);
  private readonly installed = signal(new Set(this.data.installed ?? []));
  private done = false;

  constructor() {
    this.api.templates().subscribe({
      next: r => { this.loading.set(false); if (r.status === API_SUCCESS) this.templates.set(r.data ?? []); else this.error.set(r.message); },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the templates.'); },
    });
  }

  directionText(d: string): string { return directionLabel(d); }
  /** For a platform administrator the list of installed names is every workspace's, so nothing is marked. */
  isInstalled(code: string): boolean { return this.installed().has(code); }

  install(code: string): void {
    if (this.data.tenants && this.tenantId() == null) { this.error.set('Pick the workspace to install it into.'); return; }
    this.error.set('');
    this.installing.set(code);
    this.api.install(code, this.data.tenants ? this.tenantId() : null).subscribe({
      next: r => {
        this.installing.set('');
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.done = true;
        this.installed.update(set => new Set(set).add(code));
        this.toast.success(`${code} installed, v1 active.`);
      },
      error: err => { this.installing.set(''); this.error.set(err?.error?.message || 'The template could not be installed.'); },
    });
  }

  close(): void { this.ref.close(this.done); }
}
