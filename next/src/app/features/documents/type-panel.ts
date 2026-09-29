import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { SidePanel } from '../../shared/ui/side-panel';
import { Icon } from '../../shared/ui/icon';
import { Field } from '../../shared/ui/field';
import { StatusPill } from '../../shared/ui/status-pill';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import {
  DocumentType, RULE_KINDS, RULE_LABELS, RuleKind, TypeDefinition, TypeField, TypeRule, TypeTable, blankDefinition, blankRule, blankTable,
  definitionProblems, definitionToSave, editableDefinition, listText, refusalText, statusOf, textList,
} from './documents.model';
import { DocumentsApi, TypeSave } from './documents.service';
import { FieldListEditor } from './field-list-editor';

export interface TypePanelData {
  /** null: a new type. */
  documentTypeId: number | null;
  /** A workspace administrator: the only one whose save the service takes. */
  canManage: boolean;
  /** Every type the workspace sees, to find its own copy of a built-in one. */
  types: DocumentType[];
}

/** view: as saved; edit: the workspace's own type; copy: a built-in one being customised; version: an older version. */
type Mode = 'view' | 'edit' | 'copy' | 'new' | 'version';

/**
 * A document type in the wide side panel (MIG-272): what it extracts -- fields, line-item tables -- the rules a document
 * of it must keep, the auto-approve threshold, what the model is told, and its versions.
 *
 * A built-in starter never changes: an administrator Customises it, which saves a copy under the same key that takes
 * the starter's place for this workspace's documents. A workspace's own type saves as its next version on the version
 * it was opened at (baseVersion); a save on a type that moved on since is refused (409) and the panel says to open it
 * again. Everyone else reads it. A document keeps the version it was read with, so an older version can be looked at.
 */
@Component({
  selector: 'app-type-panel',
  imports: [SidePanel, Icon, Field, StatusPill, ServerTimePipe, FieldListEditor],
  template: `
    <app-side-panel [heading]="heading()" [subtitle]="subtitle()">
      <div class="flex flex-col gap-4 min-w-0" data-test="type-panel">
        @if (loadError()) { <p class="text-sm text-crit-500" role="alert">{{ loadError() }}</p> }
        @if (loading()) { <p class="text-sm text-[color:var(--text-muted)]">Loading…</p> }

        @if (!loading()) {
          @switch (mode()) {
            @case ('view') {
              @if (type()?.builtIn) {
                <p class="text-sm text-[color:var(--text-secondary)] flex items-start gap-1.5" role="note">
                  <app-icon name="lock" size="0.95em" class="mt-0.5 shrink-0" />
                  A built-in starter: every workspace uses it as it is.
                  @if (ownCopy(); as own) { This workspace reads documents with its own "{{ own.name }}" instead. }
                  @else if (data.canManage) { Customise it to save a copy of your own under the same key; your copy then takes its place here. }
                </p>
              } @else if (!data.canManage) {
                <p class="text-sm text-[color:var(--text-secondary)] flex items-start gap-1.5" role="note"><app-icon name="lock" size="0.95em" class="mt-0.5 shrink-0" />A workspace administrator changes document types.</p>
              }
            }
            @case ('copy') {
              <p class="text-sm text-[color:var(--text-secondary)] flex items-start gap-1.5" role="note"><app-icon name="info" size="0.95em" class="mt-0.5 shrink-0" />Your copy keeps the key {{ typeKey() }}: once saved, it reads this workspace's documents in the built-in one's place.</p>
            }
            @case ('version') {
              <p class="text-sm text-[color:var(--text-secondary)] flex items-center gap-2" role="note">
                <app-icon name="history" size="0.95em" />Version {{ viewing() }}, as it was saved. Documents read with it keep it.
                <button type="button" class="btn btn-ghost btn-xs" (click)="backToCurrent()">Back to the current version</button>
              </p>
            }
          }
          @if (conflict()) {
            <div class="text-sm text-crit-500 flex flex-wrap items-center gap-2" role="alert">
              {{ conflict() }}
              <button type="button" class="btn btn-default btn-xs" (click)="reopen()"><app-icon name="refresh" />Open it again</button>
            </div>
          }

          <section class="flex flex-col gap-3" aria-label="Details">
            <div class="form-grid">
              <app-field label="Name" for="typeName" [required]="editing()">
                <input id="typeName" class="input" [value]="name()" [readOnly]="!editing()" (input)="name.set($any($event.target).value)" />
              </app-field>
              <app-field label="Key" for="typeKey" [hint]="mode() === 'new' ? 'lower_snake_case; it cannot change later.' : ''">
                <input id="typeKey" class="input mono" [value]="typeKey()" [readOnly]="mode() !== 'new'" (input)="typeKey.set($any($event.target).value)" />
              </app-field>
            </div>
            <app-field label="What it is" for="typeDescription" hint="A sentence the model reads when it decides what a document is.">
              <textarea id="typeDescription" class="input min-h-16" rows="2" [value]="def().description ?? ''" [readOnly]="!editing()" (input)="patch({ description: $any($event.target).value })"></textarea>
            </app-field>
            <div class="form-grid">
              <app-field label="Words on the page" for="typeKeywords" hint="Comma-separated hints for classification.">
                <input id="typeKeywords" class="input" [value]="keywords()" [readOnly]="!editing()" (change)="patch({ keywords: split($any($event.target).value) })" />
              </app-field>
              <app-field label="Auto-approve at" for="typeThreshold" hint="A document whose every value is at least this sure, with no problem, is approved on its own. Empty: never.">
                <div class="flex items-center gap-1.5">
                  <input id="typeThreshold" class="input w-24" type="number" min="1" max="100" step="1" [value]="thresholdPct()" [readOnly]="!editing()"
                         (input)="setThreshold($any($event.target).value)" />
                  <span class="text-sm text-[color:var(--text-muted)]">%</span>
                </div>
              </app-field>
            </div>
            <app-field label="Instructions" for="typeInstructions" hint="Anything the model should know when it extracts this type: your own conventions.">
              <textarea id="typeInstructions" class="input min-h-16" rows="2" [value]="def().instructions ?? ''" [readOnly]="!editing()" (input)="patch({ instructions: $any($event.target).value })"></textarea>
            </app-field>
          </section>

          <section class="flex flex-col gap-2" aria-label="Fields">
            <h3 class="text-sm font-semibold">Fields ({{ def().fields.length }})</h3>
            <app-field-list-editor [fields]="def().fields" [readonly]="!editing()" noun="Field" (changed)="patch({ fields: $event })" />
          </section>

          <section class="flex flex-col gap-2" aria-label="Tables">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold flex-1">Line-item tables ({{ def().tables.length }})</h3>
              @if (editing()) { <button type="button" class="btn btn-ghost btn-sm" (click)="addTable()"><app-icon name="plus" />Add table</button> }
            </div>
            @for (t of def().tables; track $index; let i = $index) {
              <div class="card p-4 flex flex-col gap-2" role="group" [attr.aria-label]="'Table ' + (i + 1)">
                <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_auto] items-center">
                  <input class="input mono text-xs" [value]="t.key" placeholder="line_items" [readOnly]="!editing()" [attr.aria-label]="'Table ' + (i + 1) + ' key'" (input)="patchTable(i, { key: $any($event.target).value })" />
                  <input class="input text-xs" [value]="t.label" placeholder="Line items" [readOnly]="!editing()" [attr.aria-label]="'Table ' + (i + 1) + ' label'" (input)="patchTable(i, { label: $any($event.target).value })" />
                  <label class="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" class="checkbox" [disabled]="!editing()" [checked]="!!t.required" (change)="patchTable(i, { required: $any($event.target).checked })" />At least one row</label>
                  @if (editing()) { <button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-label]="'Remove table ' + (i + 1)" (click)="removeTable(i)"><app-icon name="trash" class="icon-crit" /></button> }
                </div>
                <app-field-list-editor [fields]="t.columns" [readonly]="!editing()" noun="Column" (changed)="patchTable(i, { columns: $event })" />
              </div>
            } @empty { <p class="text-xs text-[color:var(--text-muted)]">None: this type has no line items.</p> }
          </section>

          <section class="flex flex-col gap-2" aria-label="Rules">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold flex-1">Rules ({{ def().rules.length }})</h3>
              @if (editing()) { <button type="button" class="btn btn-ghost btn-sm" (click)="addRule()"><app-icon name="plus" />Add rule</button> }
            </div>
            @for (r of def().rules; track $index; let i = $index) {
              <div class="card p-4 flex flex-col gap-2" role="group" [attr.aria-label]="'Rule ' + (i + 1)">
                <div class="flex items-center gap-2">
                  <select class="input text-xs flex-1" [disabled]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' kind'" (change)="patchRule(i, { rule: $any($event.target).value })">
                    @for (k of ruleKinds; track k) { <option [value]="k" [selected]="k === r.rule">{{ ruleLabel(k) }}</option> }
                  </select>
                  @if (editing()) { <button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-label]="'Remove rule ' + (i + 1)" (click)="removeRule(i)"><app-icon name="trash" class="icon-crit" /></button> }
                </div>
                <div class="grid gap-2 sm:grid-cols-2">
                  @if (uses(r, 'table')) {
                    <select class="input text-xs" [disabled]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' table'" (change)="patchRule(i, { table: $any($event.target).value || null })">
                      <option value="">{{ r.rule === 'matches' || r.rule === 'checkDigit' ? 'No table (a field)' : 'Pick a table' }}</option>
                      @for (t of def().tables; track t.key) { <option [value]="t.key" [selected]="t.key === r.table">{{ t.label || t.key }}</option> }
                    </select>
                  }
                  @if (uses(r, 'column')) {
                    <select class="input text-xs" [disabled]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' column'" (change)="patchRule(i, { column: $any($event.target).value || null })">
                      <option value="">{{ r.rule === 'rowProduct' ? 'The product column' : 'Pick a column' }}</option>
                      @for (c of columnsOf(r.table); track c.key) { <option [value]="c.key" [selected]="c.key === r.column">{{ c.label || c.key }}</option> }
                    </select>
                  }
                  @if (uses(r, 'columns')) {
                    <input class="input mono text-xs" [value]="list(r.columns)" placeholder="quantity, unit_price" [readOnly]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' columns that multiply'" (change)="patchRule(i, { columns: split($any($event.target).value) })" />
                  }
                  @if (uses(r, 'fields')) {
                    <input class="input mono text-xs" [value]="list(r.fields)" placeholder="subtotal, tax" [readOnly]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' fields that add up'" (change)="patchRule(i, { fields: split($any($event.target).value) })" />
                  }
                  @if (uses(r, 'field')) {
                    <select class="input text-xs" [disabled]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' field'" (change)="patchRule(i, { field: $any($event.target).value || null })">
                      <option value="">{{ r.rule === 'matches' || r.rule === 'checkDigit' ? 'A field (or a table column)' : 'The total field' }}</option>
                      @for (f of def().fields; track f.key) { <option [value]="f.key" [selected]="f.key === r.field">{{ f.label || f.key }}</option> }
                    </select>
                  }
                  @if (uses(r, 'before')) {
                    @for (end of ends; track end) {
                      <select class="input text-xs" [disabled]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' ' + end + ' date'" (change)="patchRule(i, end === 'before' ? { before: $any($event.target).value || null } : { after: $any($event.target).value || null })">
                        <option value="">{{ end === 'before' ? 'The earlier date' : 'The later date' }}</option>
                        @for (f of dateFields(); track f.key) { <option [value]="f.key" [selected]="f.key === (end === 'before' ? r.before : r.after)">{{ f.label || f.key }}</option> }
                      </select>
                    }
                  }
                  @if (uses(r, 'tolerance')) {
                    <input class="input text-xs" type="number" step="0.01" min="0" [value]="r.tolerance ?? ''" placeholder="Tolerance (0.01)" [readOnly]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' tolerance'" (input)="patchRule(i, { tolerance: $any($event.target).value === '' ? null : +$any($event.target).value })" />
                  }
                  @if (uses(r, 'pattern')) {
                    <input class="input mono text-xs" [value]="r.pattern ?? ''" placeholder="[A-Z]{2}[0-9]{6}" [readOnly]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' pattern'" (input)="patchRule(i, { pattern: $any($event.target).value })" />
                  }
                  @if (uses(r, 'algorithm')) {
                    <select class="input text-xs" [disabled]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' algorithm'" (change)="patchRule(i, { algorithm: $any($event.target).value })">
                      <option value="luhn" [selected]="r.algorithm !== 'iban'">Luhn (cards, many account numbers)</option>
                      <option value="iban" [selected]="r.algorithm === 'iban'">IBAN</option>
                    </select>
                  }
                </div>
                <input class="input text-xs" [value]="r.message ?? ''" placeholder="What a reviewer is told when it fails (optional)" [readOnly]="!editing()" [attr.aria-label]="'Rule ' + (i + 1) + ' message'" (input)="patchRule(i, { message: $any($event.target).value })" />
              </div>
            } @empty { <p class="text-xs text-[color:var(--text-muted)]">None.</p> }
          </section>

          @if (type()?.versions?.length) {
            <section class="flex flex-col gap-2" aria-label="Versions">
              <h3 class="text-sm font-semibold">Versions</h3>
              <table class="table-modern">
                <thead><tr><th>Version</th><th>Name</th><th>Saved</th></tr></thead>
                <tbody>
                  @for (v of type()!.versions; track v.version) {
                    <tr>
                      <td>
                        <button type="button" class="link-inline mono" [attr.aria-pressed]="shownVersion() === v.version" (click)="showVersion(v.version)">v{{ v.version }}</button>
                        @if (v.version === type()!.currentVersion) { <span class="pill pill-brand ml-1">Current</span> }
                      </td>
                      <td class="text-xs">{{ v.name }}</td>
                      <td class="text-xs whitespace-nowrap">@if (v.dateCreated) { {{ v.dateCreated | serverTime: 'dateTime' }} } @else { — }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
          }

          @if (problems().length && tried()) {
            <ul class="text-xs text-crit-500 list-disc pl-5" role="alert" data-test="type-problems">@for (p of problems(); track $index) { <li>{{ p }}</li> }</ul>
          }
        }
      </div>

      <div foot class="flex flex-wrap items-center gap-2 w-full">
        @if (type() && !type()!.builtIn) { <app-status [label]="type()!.status" [quiet]="true" /> }
        <span class="flex-1"></span>
        @if (data.canManage && mode() === 'view') {
          @if (type()?.builtIn && !ownCopy()) { <button type="button" class="btn btn-primary btn-sm" (click)="customise()"><app-icon name="copy" />Customise</button> }
          @if (type() && !type()!.builtIn) {
            <button type="button" class="btn btn-default btn-sm" [disabled]="saving()" (click)="toggleStatus()">{{ type()!.status === 'Active' ? 'Switch off' : 'Switch on' }}</button>
            <button type="button" class="btn btn-primary btn-sm" (click)="startEdit()"><app-icon name="edit" />Edit</button>
          }
        }
        @if (editing()) {
          <button type="button" class="btn btn-default btn-sm" [disabled]="saving()" (click)="cancelEdit()">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" data-test="save-type" [disabled]="saving()" (click)="save()">
            @if (saving()) { <app-icon name="refresh" class="spin" /> }{{ mode() === 'edit' ? 'Save as the next version' : 'Save' }}
          </button>
        }
      </div>
    </app-side-panel>
  `,
})
export class TypePanel implements OnInit {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<TypePanelData>(DIALOG_DATA);
  private readonly api = inject(DocumentsApi);
  private readonly toast = inject(ToastService);

  readonly ruleKinds = RULE_KINDS;
  readonly ends = ['before', 'after'] as const;

  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly type = signal<DocumentType | null>(null);
  readonly mode = signal<Mode>(this.data.documentTypeId == null ? 'new' : 'view');
  readonly viewing = signal<number | null>(null);
  readonly name = signal('');
  readonly typeKey = signal('');
  readonly def = signal<TypeDefinition>(blankDefinition());
  readonly saving = signal(false);
  readonly tried = signal(false);
  readonly conflict = signal('');
  private changed = false;

  readonly editing = computed(() => this.data.canManage && ['edit', 'copy', 'new'].includes(this.mode()));
  readonly heading = computed(() => this.mode() === 'new' ? 'New document type'
    : this.mode() === 'copy' ? `Customise ${this.type()?.name ?? ''}` : `Document type · ${this.type()?.name ?? '…'}`);
  readonly subtitle = computed(() => {
    const t = this.type();
    if (!t || this.mode() === 'new') return 'Fields, tables, rules and when a document is approved on its own';
    return `${t.builtIn ? 'Built-in' : 'This workspace\'s'} · ${t.typeKey} · v${this.shownVersion()}`;
  });
  readonly shownVersion = computed(() => this.viewing() ?? this.type()?.currentVersion ?? 1);
  readonly ownCopy = computed(() => {
    const t = this.type();
    return t?.builtIn ? this.data.types.find(x => !x.builtIn && x.typeKey === t.typeKey) ?? null : null;
  });
  readonly keywords = computed(() => listText(this.def().keywords));
  readonly thresholdPct = computed(() => {
    const t = this.def().autoApproveThreshold;
    return t == null ? '' : String(Math.round(t * 100));
  });
  readonly problems = computed(() => definitionProblems(this.name(), this.typeKey(), this.def()));
  readonly dateFields = computed(() => this.def().fields.filter(f => f.type === 'date'));

  ngOnInit(): void {
    if (this.data.documentTypeId == null) {
      this.def.set(blankDefinition());
      return;
    }
    this.reopen();
  }

  /** Reads the type as it is now: its current definition, and its versions. */
  reopen(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.conflict.set('');
    this.api.type(this.data.documentTypeId!).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.loadError.set(r.message || 'The document type could not be read.'); return; }
        this.type.set(r.data);
        this.viewing.set(null);
        this.mode.set('view');
        this.fill(r.data.name, r.data.typeKey, r.data.definition);
      },
      error: err => { this.loading.set(false); this.loadError.set(refusalText(err, 'The document type could not be read.')); },
    });
  }

  private fill(name: string, key: string, d: TypeDefinition | null | undefined): void {
    this.name.set(name);
    this.typeKey.set(key);
    this.def.set(editableDefinition(d));
    this.tried.set(false);
  }

  showVersion(version: number): void {
    const t = this.type();
    if (!t) return;
    if (version === t.currentVersion) { this.backToCurrent(); return; }
    this.api.typeVersion(t.documentTypeId, version).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); return; }
        this.viewing.set(version);
        this.mode.set('version');
        this.fill(r.data.name, r.data.typeKey, r.data.definition);
      },
      error: err => this.toast.error(refusalText(err, 'That version could not be read.')),
    });
  }

  backToCurrent(): void {
    const t = this.type();
    if (!t) return;
    this.viewing.set(null);
    this.mode.set('view');
    this.fill(t.name, t.typeKey, t.definition);
  }

  customise(): void {
    const t = this.type();
    if (!t) return;
    this.fill(t.name, t.typeKey, t.definition);
    this.mode.set('copy');
  }

  startEdit(): void { this.backToCurrent(); this.mode.set('edit'); }

  cancelEdit(): void {
    if (this.mode() === 'new') { this.ref.close(this.changed); return; }
    this.backToCurrent();
  }

  // -------------------------------------------------------------------------------------------- editing

  patch(p: Partial<TypeDefinition>): void { this.def.update(d => ({ ...d, ...p })); }
  split(text: string): string[] { return textList(text); }
  list(values: string[] | null | undefined): string { return listText(values); }
  ruleLabel(kind: RuleKind): string { return RULE_LABELS[kind]; }

  setThreshold(text: string): void {
    const n = text.trim() === '' ? null : Number(text) / 100;
    this.patch({ autoApproveThreshold: n });
  }

  addTable(): void { this.patch({ tables: [...this.def().tables, blankTable()] }); }
  removeTable(i: number): void { this.patch({ tables: this.def().tables.filter((_, x) => x !== i) }); }
  patchTable(i: number, p: Partial<TypeTable>): void { this.patch({ tables: this.def().tables.map((t, x) => x === i ? { ...t, ...p } : t) }); }

  addRule(): void { this.patch({ rules: [...this.def().rules, blankRule()] }); }
  removeRule(i: number): void { this.patch({ rules: this.def().rules.filter((_, x) => x !== i) }); }
  patchRule(i: number, p: Partial<TypeRule>): void { this.patch({ rules: this.def().rules.map((r, x) => x === i ? { ...r, ...p } : r) }); }

  columnsOf(table: string | null | undefined): TypeField[] { return this.def().tables.find(t => t.key === table)?.columns ?? []; }

  /** Which of a rule's settings its kind uses. */
  uses(r: TypeRule, what: keyof TypeRule): boolean {
    const USES: Record<string, (keyof TypeRule)[]> = {
      sumEquals: ['table', 'column', 'field', 'tolerance'], sumOf: ['fields', 'field', 'tolerance'],
      rowProduct: ['table', 'columns', 'column', 'tolerance'], notAfter: ['before', 'after'],
      matches: ['field', 'table', 'column', 'pattern'], checkDigit: ['field', 'table', 'column', 'algorithm'],
    };
    return (USES[r.rule] ?? []).includes(what);
  }

  // -------------------------------------------------------------------------------------------- saving

  save(): void {
    this.tried.set(true);
    if (this.problems().length || this.saving()) return;
    const t = this.type();
    const body: TypeSave = {
      typeKey: this.typeKey().trim(), name: this.name().trim(), description: this.def().description?.trim() || null,
      definition: definitionToSave(this.def()),
    };
    if (this.mode() === 'edit' && t) { body.documentTypeId = t.documentTypeId; body.baseVersion = t.currentVersion; }
    this.saving.set(true);
    this.conflict.set('');
    this.api.saveType(body).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The document type was not saved.'); return; }
        this.changed = true;
        this.toast.success(r.message || 'Saved.');
        this.ref.close(true);
      },
      error: err => {
        this.saving.set(false);
        const message = refusalText(err, 'The document type was not saved.');
        if (statusOf(err) === 409) this.conflict.set(message);
        else this.toast.error(message);
      },
    });
  }

  toggleStatus(): void {
    const t = this.type();
    if (!t || t.builtIn) return;
    this.saving.set(true);
    this.api.setTypeStatus(t.documentTypeId, t.status === 'Active' ? 'Inactive' : 'Active').subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); return; }
        this.changed = true;
        this.type.set({ ...t, ...r.data, versions: t.versions });
        this.toast.success(r.message);
      },
      error: err => { this.saving.set(false); this.toast.error(refusalText(err, 'The document type was not switched.')); },
    });
  }
}
