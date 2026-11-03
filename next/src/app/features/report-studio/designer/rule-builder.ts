import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';
import {
  ExprError, NotEvaluated, RULE_TESTS, RuleRow, RuleSet, RuleTest, RuleValue, holds, parseExpression, readerFor, rowProblem, rulesOf,
  rulesOfCondition, toExpression,
} from './rule-expr';

/** A field the builder offers: the path it writes (primary.wound.stage, item.stage) and the data's type for it. */
export interface RuleField { path: string; type: string; }

/** One test record the rules are counted over: the record the primary dataset reads, and a repeat's item when inside one. */
export interface RuleContext { record: unknown; scopes: Record<string, unknown>; }

type Kind = 'number' | 'text' | 'boolean' | 'date';
const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,3})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Reports redesign, feature 14: "Show only when" as rows of field · test · value joined by all or any, with how many test
 * records it shows for. It writes the conditional's `when` in the expression language media-service parses; a hand-written
 * expression the builder cannot show stays as text, and the builder never rewrites it unless the person asks to.
 */
@Component({
  selector: 'app-rs-rule-builder',
  imports: [Icon, AdvancedSelect],
  template: `
    <div class="rsr" role="group" aria-label="Show when">
      <div class="rsr-head">
        <span class="label">Show when</span>
        @if (mode() === 'rules') {
          <button type="button" class="btn btn-default btn-xs" (click)="toText()" [disabled]="readonly()">Edit as text</button>
        } @else {
          <button type="button" class="btn btn-default btn-xs" (click)="toRules()" [disabled]="readonly() || !textRules()"
                  [attr.title]="textRules() ? null : 'The builder cannot show this expression'">Use the builder</button>
        }
      </div>
      @if (mode() === 'rules') {
        @if (rows().length > 1) {
          <label class="rsr-join text-xs">
            <select class="input text-xs" aria-label="Join the rules" [disabled]="readonly()" (change)="setJoin($any($event.target).value)">
              <option value="all" [selected]="join() === 'all'">All of these hold</option>
              <option value="any" [selected]="join() === 'any'">Any of these holds</option>
            </select>
          </label>
        }
        @for (r of rows(); track $index; let i = $index) {
          <div class="rsr-row" [attr.aria-label]="'Rule ' + (i + 1)" role="group">
            <div class="rsr-line">
              @if (fieldOptions().length) {
                <app-advanced-select class="min-w-0 flex-1" [disabled]="readonly()" [ariaLabel]="'Rule ' + (i + 1) + ' field'" [options]="fieldOptions()"
                                     [value]="r.field" (valueChange)="setField(i, $event)" placeholder="Choose a field" unknownText="Not in the test data"
                                     searchLabel="Search the fields" panelWidth="22rem" />
              } @else {
                <input class="input mono text-xs min-w-0 flex-1" [value]="r.field" [disabled]="readonly()" [attr.aria-label]="'Rule ' + (i + 1) + ' field'"
                       placeholder="primary.field" (change)="setField(i, $any($event.target).value)" />
              }
              @if (!readonly() && rows().length > 1) {
                <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Remove rule ' + (i + 1)" (click)="removeRow(i)"><app-icon name="close" /></button>
              }
            </div>
            <div class="rsr-line">
              <select class="input text-xs rsr-test" [disabled]="readonly()" [attr.aria-label]="'Rule ' + (i + 1) + ' test'" (change)="setTest(i, $any($event.target).value)">
                @for (t of testsFor(r); track t.id) { <option [value]="t.id" [selected]="t.id === r.test">{{ t.label }}</option> }
              </select>
              @switch (valueCount(r)) {
                @case (0) {}
                @case (2) {
                  <input class="input text-xs min-w-0 flex-1" [value]="shown(r, 0)" [disabled]="readonly()" [attr.aria-label]="'Rule ' + (i + 1) + ' from'"
                         placeholder="From" [attr.list]="'rsr-values-' + i" (change)="setValue(i, 0, $any($event.target).value)" />
                  <span class="text-xs text-[color:var(--text-muted)]">and</span>
                  <input class="input text-xs min-w-0 flex-1" [value]="shown(r, 1)" [disabled]="readonly()" [attr.aria-label]="'Rule ' + (i + 1) + ' to'"
                         placeholder="To" [attr.list]="'rsr-values-' + i" (change)="setValue(i, 1, $any($event.target).value)" />
                }
                @case (-1) {
                  <textarea class="input text-xs min-w-0 flex-1" rows="2" [value]="listText(r)" [disabled]="readonly()"
                            [attr.aria-label]="'Rule ' + (i + 1) + ' values'" placeholder="One value per line" (change)="setValues(i, $any($event.target).value)"></textarea>
                }
                @default {
                  @if (kindOf(r.field) === 'boolean' && (r.test === 'eq' || r.test === 'ne')) {
                    <select class="input text-xs min-w-0 flex-1" [disabled]="readonly()" [attr.aria-label]="'Rule ' + (i + 1) + ' value'" (change)="setValue(i, 0, $any($event.target).value)">
                      <option value="true" [selected]="r.values[0] === true">Yes (true)</option>
                      <option value="false" [selected]="r.values[0] === false">No (false)</option>
                    </select>
                  } @else {
                    <input class="input text-xs min-w-0 flex-1" maxlength="1000" [value]="shown(r, 0)" [disabled]="readonly()" [attr.aria-label]="'Rule ' + (i + 1) + ' value'"
                           placeholder="Value" [attr.list]="'rsr-values-' + i" (change)="setValue(i, 0, $any($event.target).value)" />
                  }
                }
              }
              <datalist [id]="'rsr-values-' + i">@for (v of suggestions()[r.field] ?? []; track v) { <option [value]="v"></option> }</datalist>
            </div>
            @if (problems()[i]; as p) { <p class="text-xs text-[color:var(--crit-text)]" role="alert">{{ p }}</p> }
          </div>
        }
        @if (!readonly() && rows().length < 20) {
          <button type="button" class="btn btn-default btn-sm self-start" (click)="addRow()"><app-icon name="plus" />Rule</button>
        }
      } @else {
        <textarea class="input mono text-xs" rows="4" [value]="text()" [disabled]="readonly()" aria-label="Show when, as an expression"
                  (input)="setText($any($event.target).value)"></textarea>
        @if (textError(); as e) {
          <p class="text-xs text-[color:var(--crit-text)]" role="alert">{{ e }}</p>
        } @else if (!textRules() && text().trim()) {
          <p class="text-xs text-[color:var(--text-muted)]" data-kept-as-text>The builder cannot show this expression, so it stays as you wrote it.</p>
        }
        @if (keptCondition(); as c) {
          <p class="text-xs text-[color:var(--text-muted)]">Kept as it is until you write an expression: <span class="mono">{{ c }}</span></p>
        }
        <span class="text-xs text-[color:var(--text-muted)]">Paths, numbers, 'words', =, !=, &lt;, &gt;, and, or, not, is null, in (…), contains(…).</span>
      }
      @if (count(); as c) {
        <p class="text-xs flex items-center gap-1" role="status" data-shows-for
           [class]="c.kind === 'some' ? 'text-[color:var(--ok-text)]' : c.kind === 'none' ? 'text-[color:var(--warn-text)]' : 'text-[color:var(--text-muted)]'">
          <app-icon [name]="c.kind === 'some' ? 'checkCircle' : c.kind === 'none' ? 'alert' : 'info'" />{{ c.text }}
        </p>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .rsr { display: flex; flex-direction: column; gap: 0.375rem; padding: 0.5rem 0.625rem 0.625rem; border: 1px solid var(--border-control);
      border-radius: var(--radius-md); background: var(--surface-sunken); }
    .rsr-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 1.75rem; }
    .rsr-head .label { margin-bottom: 0; }
    .rsr-row { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.375rem; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); background: var(--surface-raised); }
    .rsr-line { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
    .rsr-test { flex: 0 0 7.5rem; }
  `,
})
export class RuleBuilder {
  /** The conditional's expression (`when`), or its structured condition when it has no expression. */
  readonly when = input<string | undefined>(undefined);
  readonly condition = input<{ left?: string; operator?: string; right?: unknown } | undefined>(undefined);
  readonly readonly = input(false);
  readonly fields = input<RuleField[]>([]);
  /** The primary dataset's names (a path starting with one reads the record). */
  readonly names = input<string[]>(['primary']);
  /** The test records it is counted over, what one is called, and how many the data has in all (when more than the sample). */
  readonly contexts = input<RuleContext[]>([]);
  readonly noun = input('test record');
  /** Words after the count ("of primary.visits in the first test record"). */
  readonly note = input('');
  readonly total = input<number | null>(null);
  /** The new expression; the designer writes `when` and drops a structured condition. */
  readonly changed = output<string>();

  readonly mode = signal<'rules' | 'text'>('rules');
  readonly rows = signal<RuleRow[]>([]);
  readonly join = signal<'all' | 'any'>('all');
  readonly text = signal('');
  /** The values each row holds as typed, so an unfinished number stays in its box. */
  private readonly raw = signal<Record<string, string>>({});
  private lastWritten: string | null = null;

  constructor() {
    // Each time the block's own expression changes (another block picked, undo) the builder starts from it again --
    // but not when the change is the one it just wrote.
    effect(() => {
      const when = this.when();
      const cond = this.condition();
      untracked(() => this.load(when, cond));
    });
  }

  private load(when: string | undefined, cond: { left?: string; operator?: string; right?: unknown } | undefined): void {
    if (when !== undefined && when === this.lastWritten) return;
    this.lastWritten = null;
    this.raw.set({});
    const set = when !== undefined ? rulesOf(when) : cond ? rulesOfCondition(cond) : null;
    this.text.set(when ?? '');
    if (set) {
      this.mode.set('rules');
      this.rows.set(set.rows);
      this.join.set(set.join);
    } else if (when === undefined && !cond) {
      this.mode.set('rules');
      this.rows.set([{ field: '', test: 'eq', values: [] }]);
      this.join.set('all');
    } else {
      this.mode.set('text');
      this.rows.set([]);
    }
  }

  readonly fieldOptions = computed<AdvancedOption[]>(() => this.fields().map(f => ({ value: f.path, label: f.path, mono: true, sample: f.type })));

  /** The expression the current rows write, or null while a row is not complete. */
  readonly rowsExpression = computed(() => {
    try {
      return toExpression({ join: this.join(), rows: this.rows() });
    } catch {
      return null;
    }
  });
  readonly problems = computed(() => this.rows().map((r, i) => {
    const typed = this.raw()[`${i}:0`] ?? this.raw()[`${i}:1`];
    if (typed !== undefined) return typed.trim() ? `${typed.trim()} is not a number.` : 'Give the value.';
    return r.field ? rowProblem(r) : null;
  }));
  readonly textError = computed(() => {
    const t = this.text();
    if (!t.trim()) return 'Write an expression, or use the builder.';
    try {
      parseExpression(t);
      return null;
    } catch (e) {
      return e instanceof ExprError ? e.message : 'The expression does not read.';
    }
  });
  readonly textRules = computed<RuleSet | null>(() => rulesOf(this.text()));
  readonly keptCondition = computed(() => {
    const c = this.condition();
    if (this.when() !== undefined || !c || rulesOfCondition(c)) return null;
    return `${c.left ?? ''} ${c.operator ?? ''} ${JSON.stringify(c.right ?? null)}`;
  });

  /** "Shows for 4 of 14 test records", from the rows or the text, over the test sample. */
  readonly count = computed<{ kind: 'some' | 'none' | 'info'; text: string } | null>(() => {
    const expr = this.mode() === 'rules' ? this.rowsExpression() : this.textError() ? null : this.text();
    if (!expr) return null;
    const contexts = this.contexts();
    if (!contexts.length) return { kind: 'info', text: 'Pick test data to see which records it shows for.' };
    let shown = 0;
    try {
      const ast = parseExpression(expr);
      for (const c of contexts) if (holds(ast, readerFor(c.record, this.names(), c.scopes))) shown++;
    } catch (e) {
      if (e instanceof NotEvaluated) return { kind: 'info', text: 'The designer does not count this expression; the canvas shows it for the test data.' };
      return null;
    }
    const n = contexts.length;
    const noun = `${this.noun()}${n === 1 ? '' : 's'}`;
    const total = this.total();
    const more = `${this.note()}${total !== null && total > n ? ` (the data has ${total.toLocaleString('en-US')})` : ''}`;
    return shown ? { kind: 'some', text: `Shows for ${shown} of ${n} ${noun}${more}` } : { kind: 'none', text: `Shows for none of the ${n} ${noun}${more}` };
  });

  /** The distinct values of each offered field in the test records (at most 12), for the value boxes. */
  readonly suggestions = computed<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const r of this.rows()) {
      if (!r.field || out[r.field]) continue;
      out[r.field] = this.valuesOf(r.field).filter(v => v !== null && v !== undefined && typeof v !== 'object').map(String)
        .filter((v, i, all) => all.indexOf(v) === i).slice(0, 12);
    }
    return out;
  });

  private valuesOf(field: string): unknown[] {
    try {
      const ast = parseExpression(field);
      if (ast.k !== 'path') return [];
      return this.contexts().map(c => readerFor(c.record, this.names(), c.scopes)(ast.steps));
    } catch {
      return [];
    }
  }

  /** Number, text, yes/no or date: the data's type for the field, else what its test values are. */
  kindOf(field: string): Kind {
    const t = (this.fields().find(f => f.path === field)?.type ?? '').toLowerCase();
    if (/int|number|decimal|double|float|long/.test(t)) return 'number';
    if (/bool/.test(t)) return 'boolean';
    if (/date|time/.test(t)) return 'date';
    if (t) return 'text';
    const seen = this.valuesOf(field).filter(v => v !== null && v !== undefined);
    if (seen.length && seen.every(v => typeof v === 'number')) return 'number';
    if (seen.length && seen.every(v => typeof v === 'boolean')) return 'boolean';
    if (seen.length && seen.every(v => typeof v === 'string' && ISO_DATE.test(v))) return 'date';
    return 'text';
  }

  testsFor(r: RuleRow): typeof RULE_TESTS {
    const kind = r.field ? this.kindOf(r.field) : 'text';
    return RULE_TESTS.filter(t => t.kinds.includes(kind) || t.id === r.test);
  }

  valueCount(r: RuleRow): number {
    return RULE_TESTS.find(t => t.id === r.test)?.values ?? 1;
  }

  /** An "is one of" row's values, one a line. */
  listText(r: RuleRow): string {
    return r.values.map(v => String(v)).join('\n');
  }

  shown(r: RuleRow, k: number): string {
    const i = this.rows().indexOf(r);
    const typed = this.raw()[`${i}:${k}`];
    if (typed !== undefined) return typed;
    const v = r.values[k];
    return v === undefined ? '' : String(v);
  }

  // ---------------------------------------------------------------- edits

  private typed(field: string, text: string): RuleValue | null {
    const kind = this.kindOf(field);
    if (kind === 'boolean' && (text === 'true' || text === 'false')) return text === 'true';
    if (kind === 'number') return NUMERIC.test(text.trim()) ? Number(text.trim()) : null;
    return text;
  }

  private update(fn: (rows: RuleRow[]) => void): void {
    const rows = this.rows().map(r => ({ ...r, values: [...r.values] }));
    fn(rows);
    this.rows.set(rows);
    this.write();
  }

  private write(): void {
    const expr = this.rowsExpression();
    if (expr === null || Object.keys(this.raw()).length) return;
    this.lastWritten = expr;
    this.text.set(expr);
    this.changed.emit(expr);
  }

  setJoin(join: 'all' | 'any'): void {
    this.join.set(join === 'any' ? 'any' : 'all');
    this.write();
  }

  setField(i: number, field: string | null): void {
    this.update(rows => {
      if (!rows[i]) return;
      rows[i].field = (field ?? '').trim();
      // A test the new field's kind has no use for (contains on a number) becomes "is".
      if (!this.testsFor(rows[i]).some(t => t.id === rows[i].test)) rows[i].test = 'eq';
      rows[i].values = rows[i].values.map(v => this.typed(rows[i].field, String(v)) ?? v);
    });
  }

  setTest(i: number, test: RuleTest): void {
    this.dropRaw(i);
    this.update(rows => {
      const r = rows[i];
      if (!r) return;
      r.test = test;
      const want = this.valueCount(r);
      if (want === 0) r.values = [];
      else if (want > 0) r.values = r.values.slice(0, want);
      if (this.kindOf(r.field) === 'boolean' && (test === 'eq' || test === 'ne') && typeof r.values[0] !== 'boolean') r.values = [true];
    });
  }

  setValue(i: number, k: number, text: string): void {
    const r = this.rows()[i];
    if (!r) return;
    const v = text.trim() ? this.typed(r.field, text) : null;
    const raw = { ...this.raw() };
    // A box left empty, or a number box holding something else, keeps what was typed and writes nothing until it is fixed.
    if (v === null) {
      raw[`${i}:${k}`] = text;
      this.raw.set(raw);
      return;
    }
    delete raw[`${i}:${k}`];
    this.raw.set(raw);
    this.update(rows => { rows[i].values[k] = v; });
  }

  setValues(i: number, text: string): void {
    const r = this.rows()[i];
    if (!r) return;
    const parts = text.split('\n').map(s => s.trim()).filter(Boolean);
    const vals = parts.map(p => this.typed(r.field, p));
    const raw = { ...this.raw() };
    const bad = parts.find((_p, n) => vals[n] === null);
    if (bad !== undefined) {
      raw[`${i}:0`] = bad;
      this.raw.set(raw);
      return;
    }
    delete raw[`${i}:0`];
    this.raw.set(raw);
    this.update(rows => { rows[i].values = vals as RuleValue[]; });
  }

  addRow(): void {
    this.update(rows => rows.push({ field: '', test: 'eq', values: [] }));
  }

  removeRow(i: number): void {
    this.dropRaw(i);
    this.raw.set(Object.fromEntries(Object.entries(this.raw()).map(([key, v]) => {
      const [n, k] = key.split(':').map(Number);
      return [`${n > i ? n - 1 : n}:${k}`, v];
    })));
    this.update(rows => rows.splice(i, 1));
  }

  private dropRaw(i: number): void {
    const raw = { ...this.raw() };
    delete raw[`${i}:0`];
    delete raw[`${i}:1`];
    this.raw.set(raw);
  }

  toText(): void {
    const expr = this.rowsExpression();
    if (expr !== null) this.text.set(expr);
    this.mode.set('text');
  }

  toRules(): void {
    const set = this.textRules();
    if (!set) return;
    this.raw.set({});
    this.rows.set(set.rows);
    this.join.set(set.join);
    this.mode.set('rules');
  }

  setText(text: string): void {
    this.text.set(text);
    if (this.textError()) return;
    this.lastWritten = text;
    this.changed.emit(text);
  }
}
