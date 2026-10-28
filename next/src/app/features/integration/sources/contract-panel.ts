import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { Field } from '../../../shared/ui/field';
import { DataText } from '../../../shared/ui/data-text';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import {
  ContractRow, ContractVersionDetail, ContractVersionRow, FieldError, ValidationResult, directionLabel, isSchemaReadOnly, parsePayload,
} from './sources.model';
import { SourcesApi } from './sources.service';
import { SchemaView } from './schema-view';
import { ContractSampleDialog, ContractSampleData } from './contract-sample-dialog';
import { sensitivityText, typedWord } from '../../../shared/ui/sensitivity';
import { AppLoading, InlineStatus, createLoadState, loadErrorText } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';

export interface ContractPanelData {
  contract: ContractRow;
  canManage: boolean;
}

/**
 * One data contract (MIG-233), in the wide side panel: its versions (a workspace administrator activates one), the
 * schema of the version picked, read as fields or as raw JSON, and a check of a pasted payload against it -- which
 * everyone may run -- listing each error by path, rule and message. The shared system contract is read-only: no one
 * activates or adds to it, and its panel says so.
 */
@Component({
  selector: 'app-contract-panel',
  imports: [SidePanel, Icon, Field, DataText, ServerTimePipe, SchemaView, AppLoading, InlineStatus, LoadError, BlurLoader, SortHeader],
  template: `
    <app-side-panel [heading]="heading()" [subtitle]="subtitle()">
      <div class="flex flex-col gap-4 min-w-0">
        @if (system()) {
          <p class="text-sm text-[color:var(--text-secondary)] flex items-start gap-1.5" role="note">
            <app-icon name="lock" size="0.95em" class="mt-0.5 shrink-0" />A shared system contract: every workspace reads it and checks payloads against it; no one changes it.
          </p>
        }
        <!-- Owner 2026-10-27: a failed read says so with Try again (it also drew "No versions." under the alert), the first
             read is a skeleton, and a reload after Activate keeps the versions on screen. -->
        @if (loadError()) { <app-load-error [message]="loadError()" (retry)="load()" /> }

        <section class="flex flex-col gap-2" aria-label="Versions">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold flex-1">Versions</h3>
            @if (canChange()) {
              <button type="button" class="btn btn-default btn-sm" (click)="newVersion()"><app-icon name="plus" />New version from sample</button>
            }
          </div>
          @if (state.pending()) {
            <app-loading shape="rows" label="Loading versions…" [count]="3" />
          } @else if (!loadError()) {
          <app-blur-loader [active]="loading()" label="Refreshing…">
          <div class="overflow-x-auto">
            <table class="table-modern">
              <thead><tr>
                <th appSort="version" [sortBy]="versionSort">Version</th>
                <th appSort="state" [sortBy]="versionSort">State</th>
                <th appSort="saved" [sortBy]="versionSort">Saved</th>
                <th class="text-right th-actions">Actions</th>
              </tr></thead>
              <tbody>
                @for (v of sortedVersions(); track v.version) {
                  <tr [class.bg-sunken]="v.version === selected()">
                    <td><button type="button" class="link-inline mono" [attr.aria-pressed]="v.version === selected()" (click)="pick(v.version)">v{{ v.version }}</button></td>
                    <td>@if (v.status === 'ACTIVE') { <span class="pill pill-brand">Active</span> } @else { <span class="text-xs text-[color:var(--text-muted)]">{{ statusText(v.status) }}</span> }</td>
                    <td class="text-xs whitespace-nowrap">@if (v.dateCreated) { {{ v.dateCreated | serverTime: 'dateTime' }} } @else { — }</td>
                    <td class="text-right">
                      @if (canChange() && v.status !== 'ACTIVE') {
                        <button type="button" class="btn btn-default btn-xs" [disabled]="busy()" [attr.aria-label]="'Activate v' + v.version" (click)="activate(v.version)">Activate</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="text-sm text-[color:var(--text-muted)]" data-no-versions>
                    No version yet.{{ canChange() ? ' Make one with New version from sample.' : '' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          </app-blur-loader>
          }
        </section>

        <section class="flex flex-col gap-2 border-t border-subtle pt-4" aria-label="Schema">
          <h3 class="text-sm font-semibold">Schema @if (selected()) { <span class="mono text-[color:var(--text-muted)]">v{{ selected() }}</span> }</h3>
          <!-- Owner 2026-10-27: "Loading…" here stayed forever for a contract with no version, or when the contract could
               not be read; each case now says what it is. -->
          @if (versionDetail(); as v) {
            <app-schema-view [schema]="v.schema" [fields]="v.fields" />
          } @else if (versionError()) {
            <app-inline-status [error]="versionError()" (retry)="retryVersion()" data-version-error />
          } @else if (versionLoading() || state.pending()) {
            <app-loading shape="panel" label="Loading the schema…" [count]="4" />
          } @else if (loadError()) {
            <p class="text-sm text-[color:var(--text-muted)]">The schema shows once the contract can be read.</p>
          } @else if (!versions().length) {
            <p class="text-sm text-[color:var(--text-muted)]" data-no-schema>No version yet, so there is no schema to show.</p>
          } @else {
            <p class="text-sm text-[color:var(--text-muted)]">Pick a version to see its schema.</p>
          }
        </section>

        <section class="flex flex-col gap-3 border-t border-subtle pt-4" aria-label="Validate a payload">
          <h3 class="text-sm font-semibold">Validate a payload</h3>
          <div class="form-grid">
            <app-field label="Against" for="ctVersion" hint="The active version is what a pipeline checks with unless it pinned another.">
              <select id="ctVersion" class="input" [value]="validateVersion() ?? ''" (change)="validateVersion.set($any($event.target).value ? +$any($event.target).value : null)">
                <option value="">The active version</option>
                @for (v of versions(); track v.version) { <option [value]="v.version" [selected]="v.version === validateVersion()">v{{ v.version }}</option> }
              </select>
            </app-field>
          </div>
          <app-field label="Payload" for="ctPayload" hint="Paste the JSON a customer would send (or we would answer). Nothing is recorded.">
            <textarea id="ctPayload" class="input mono text-xs" rows="8" [value]="payload()" [placeholder]="payloadPlaceholder" (input)="payload.set($any($event.target).value)"></textarea>
          </app-field>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn btn-default btn-sm" [disabled]="validating()" (click)="validate()"><app-icon name="checkCircle" [class.spin]="validating()" />Validate</button>
            @if (validateError()) { <span class="text-sm text-crit-500" role="alert">{{ validateError() }}</span> }
          </div>
          @if (validation(); as r) {
            <div class="flex flex-col gap-2" role="status" data-test="validation">
              <p class="text-sm flex items-center gap-2">
                <span class="pill" [class.pill-ok]="r.valid" [class.pill-crit]="!r.valid">
                  <app-icon [name]="r.valid ? 'checkCircle' : 'xCircle'" size="0.9em" />{{ verdict(r) }}
                </span>
                <span class="text-[color:var(--text-secondary)]">{{ validationMessage() }}</span>
              </p>
              @if (r.errors.length) {
                <div class="overflow-x-auto">
                  <table class="table-modern" data-test="validation-errors">
                    <thead><tr>
                      <th appSort="path" [sortBy]="errorSort">Path</th>
                      <th appSort="rule" [sortBy]="errorSort">Rule</th>
                      <th appSort="message" [sortBy]="errorSort">Message</th>
                    </tr></thead>
                    <tbody>
                      @for (e of sortedErrors(); track $index) {
                        <tr>
                          <td class="mono text-xs max-w-64"><app-data-text [value]="e.path" label="Path" /></td>
                          <td class="mono text-xs whitespace-nowrap">{{ e.keyword }}</td>
                          <td class="text-xs max-w-96"><app-data-text [value]="e.message" label="Message" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (r.errorCount > r.errors.length) { <p class="text-xs text-[color:var(--text-muted)]">The first {{ r.errors.length }} of {{ r.errorCount }} are shown.</p> }
              }
            </div>
          }
        </section>
      </div>

      <ng-container foot>
        <span class="flex-1 min-w-0 text-xs text-crit-500 truncate" role="alert" [attr.title]="error() || null">{{ error() }}</span>
        <button type="button" class="btn btn-ghost btn-sm" (click)="close()">Close</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class ContractPanel {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<ContractPanelData>(DIALOG_DATA);
  private readonly api = inject(SourcesApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly payloadPlaceholder = '{"record_id": "R-1001", "customer": {"id": "C-77"}}';
  readonly contract = signal<ContractRow>(this.data.contract);
  readonly versions = signal<ContractVersionRow[]>([]);
  readonly selected = signal<number | null>(null);
  readonly versionDetail = signal<ContractVersionDetail | null>(null);
  readonly versionError = signal('');
  /** The contract's read: loading until the first answer. */
  readonly state = createLoadState();
  readonly loading = this.state.loading;
  readonly loadError = this.state.error;
  /** The picked version's schema is on its way. */
  readonly versionLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  private changed = false;

  readonly payload = signal('');
  readonly validateVersion = signal<number | null>(null);
  readonly validating = signal(false);
  readonly validateError = signal('');
  readonly validation = signal<ValidationResult | null>(null);
  readonly validationMessage = signal('');

  /**
   * Owner 2026-10-27: the versions sort by any column; newest first, as the panel always showed them. The errors of a
   * check keep the service's order until a heading is picked.
   */
  readonly versionSort = createTableSort<ContractVersionRow>({
    id: 'contract-versions',
    columns: {
      version: { value: v => v.version, kind: 'number' },
      state: { value: v => this.statusText(v.status), kind: 'status' },
      saved: { value: v => v.dateCreated, kind: 'date' },
    },
    initial: { key: 'version', direction: 'desc' },
  });
  readonly sortedVersions = computed(() => this.versionSort.apply(this.versions()));
  readonly errorSort = createTableSort<FieldError>({
    id: 'contract-validation-errors',
    columns: { path: e => e.path, rule: e => e.keyword, message: e => e.message },
  });
  readonly sortedErrors = computed(() => this.errorSort.apply(this.validation()?.errors ?? []));

  readonly system = computed(() => isSchemaReadOnly(this.contract()));
  /** A workspace administrator changes the workspace's own contracts; no one changes a system one. */
  readonly canChange = computed(() => this.data.canManage && !this.system());
  readonly heading = computed(() => `Data contract · ${this.contract().name}`);
  readonly subtitle = computed(() => {
    const c = this.contract();
    if (!c.sensitivity) return directionLabel(c.direction);
    const word = typedWord(c.sensitivity, c.sensitivityLabel);
    return `${directionLabel(c.direction)} · ${sensitivityText(c.sensitivity)}${word ? ` (${word})` : ''}`;
  });

  constructor() { this.load(); }

  load(): void {
    this.state.start();
    this.api.contract(this.data.contract.id).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.state.fail(r, 'The contract could not be read.'); return; }
        this.state.done();
        this.contract.set(r.data.contract);
        this.versions.set([...(r.data.versions ?? [])].sort((a, b) => b.version - a.version));
        const current = this.selected();
        const start = current && this.versions().some(v => v.version === current) ? current
          : r.data.contract.activeVersion ?? r.data.contract.currentVersion ?? this.versions()[0]?.version ?? null;
        if (start && start !== current) this.pick(start);
      },
      error: err => this.state.fail(err, 'The contract could not be read.'),
    });
  }

  /** A version's schema; a reply for a version picked away from is dropped. */
  pick(version: number): void {
    this.selected.set(version);
    this.versionDetail.set(null);
    this.versionError.set('');
    this.versionLoading.set(true);
    this.api.contractVersion(this.data.contract.id, version).subscribe({
      next: r => {
        if (this.selected() !== version) return;
        this.versionLoading.set(false);
        if (r.status === API_SUCCESS && r.data) this.versionDetail.set(r.data);
        else this.versionError.set(loadErrorText(r, 'The version could not be read.'));
      },
      error: err => {
        if (this.selected() !== version) return;
        this.versionLoading.set(false);
        this.versionError.set(loadErrorText(err, 'The version could not be read.'));
      },
    });
  }

  retryVersion(): void {
    const v = this.selected();
    if (v) this.pick(v);
  }

  verdict(r: ValidationResult): string { return r.valid ? 'Holds' : `${r.errorCount} error${r.errorCount === 1 ? '' : 's'}`; }

  statusText(status: string): string { return status ? status.charAt(0) + status.slice(1).toLowerCase() : '—'; }

  activate(version: number): void {
    if (!this.canChange()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.activate(this.data.contract.id, version).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.changed = true;
        this.toast.success(`v${version} is the active version.`);
        this.load();
      },
      error: err => { this.busy.set(false); this.error.set(err?.error?.message || 'The version could not be activated.'); },
    });
  }

  newVersion(): void {
    if (!this.canChange()) return;
    const data: ContractSampleData = { contract: this.contract() };
    this.dialog.open<boolean>(ContractSampleDialog, { data }).closed.subscribe(done => {
      if (!done) return;
      this.changed = true;
      this.selected.set(null);
      this.load();
    });
  }

  validate(): void {
    const parsed = parsePayload(this.payload());
    if (parsed.error !== undefined) { this.validateError.set(parsed.error); this.validation.set(null); return; }
    this.validateError.set('');
    this.validating.set(true);
    this.api.validate({ contractId: this.data.contract.id, version: this.validateVersion(), payload: parsed.value }).subscribe({
      next: r => {
        this.validating.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.validation.set(null); this.validateError.set(r.message); return; }
        this.validation.set({ ...r.data, errors: r.data.errors ?? [] });
        this.validationMessage.set(r.message);
      },
      error: err => { this.validating.set(false); this.validateError.set(err?.error?.message || 'The payload could not be checked.'); },
    });
  }

  close(): void { this.ref.close(this.changed); }
}
