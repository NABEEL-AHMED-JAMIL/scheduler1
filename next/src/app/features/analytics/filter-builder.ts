import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import {
  DatasetColumn, FilterClause, FilterGroup, FilterNode, FilterOperator, OPERAND_COUNT,
  isFilterGroup,
} from './analytics.service';

/**
 * The fourteen operators, with the words a reader uses for them.
 *
 * The ids are the server's vocabulary and the labels are English, and the two are kept apart on
 * purpose: NEQ is what the engine is told and "is not" is what a person picking from a list
 * recognises. A picker showing NOT_IN would be a picker that only helps somebody who already
 * knows the API.
 *
 * The order is document 07's own, not alphabetical and not grouped by operand count. The
 * document lists them as pairs -- equals/not equals, contains/starts with, in/not in, is
 * null/not null -- and a reader scanning for "not equals" finds it under "equals".
 */
export const FILTER_OPERATORS: { id: FilterOperator; label: string }[] = [
  { id: 'EQ', label: 'is' },
  { id: 'NEQ', label: 'is not' },
  { id: 'CONTAINS', label: 'contains' },
  { id: 'STARTS_WITH', label: 'starts with' },
  { id: 'GT', label: 'is greater than' },
  { id: 'LT', label: 'is less than' },
  { id: 'BETWEEN', label: 'is between' },
  { id: 'IN', label: 'is one of' },
  { id: 'NOT_IN', label: 'is none of' },
  { id: 'IS_NULL', label: 'is empty' },
  { id: 'IS_NOT_NULL', label: 'is not empty' },
  { id: 'DATE_RANGE', label: 'is in the date range' },
  { id: 'RELATIVE_DATE', label: 'is in the last' },
  { id: 'NUMERIC_RANGE', label: 'is in the numeric range' },
];

/**
 * The windows RELATIVE_DATE can name.
 *
 * A TOKEN travels, never a pair of computed dates, and that is the answer to the question the
 * audit says nothing in this module had settled: which clock a relative date is relative to.
 * Computing "last 7 days" here would resolve it against the BROWSER's clock and timezone, then
 * send two absolute timestamps that look like the reader's own choice -- so a saved analysis
 * would quietly mean a different week depending on where it was saved. Sending the token leaves
 * the resolution in one place, server-side, where the same analysis means the same thing to
 * everybody who opens it. The screen says so rather than implying it.
 */
export const RELATIVE_WINDOWS: { id: string; label: string }[] = [
  { id: 'TODAY', label: 'today' },
  { id: 'YESTERDAY', label: 'yesterday' },
  { id: 'LAST_7_DAYS', label: '7 days' },
  { id: 'LAST_30_DAYS', label: '30 days' },
  { id: 'LAST_90_DAYS', label: '90 days' },
  { id: 'THIS_MONTH', label: 'this month' },
  { id: 'LAST_MONTH', label: 'last month' },
  { id: 'THIS_YEAR', label: 'this year' },
];

/**
 * How deep the groups may nest.
 *
 * Not a limit of the model -- FilterGroup nests as far as anybody wants, and the server compiles
 * whatever it is sent. It is a limit of what stays READABLE in a 260px-narrower column: each
 * level costs an indent and a border, and by the fourth the conditions inside it are a column of
 * two-character inputs. `a AND (b OR (c AND d))` is already past what most filter bars express;
 * anything past that is better written in the SQL console next door.
 */
export const MAX_GROUP_DEPTH = 3;

const NUMERIC_TYPE = /^(BIGINT|INT|INTEGER|SMALLINT|TINYINT|HUGEINT|UBIGINT|UINTEGER|USMALLINT|UTINYINT|DOUBLE|FLOAT|REAL|DECIMAL|NUMERIC)\b/i;
const DATE_TYPE = /^(DATE|TIMESTAMP|DATETIME)\b/i;

export function isNumericType(type: string | undefined): boolean {
  return !!type && NUMERIC_TYPE.test(type.trim());
}

export function isDateType(type: string | undefined): boolean {
  return !!type && DATE_TYPE.test(type.trim());
}

/** A fresh empty AND group -- what "no filter" is, and what an added group starts as. */
export function emptyFilterGroup(): FilterGroup {
  return { op: 'AND', clauses: [] };
}

/** A fresh clause on a column, starting at the operator that needs the least explaining. */
export function newFilterClause(field: string): FilterClause {
  return { field, operator: 'EQ', value: '' };
}

/**
 * Whether a clause says anything yet.
 *
 * The test is on the OPERANDS the operator actually takes, which is why this is a table lookup
 * rather than "is value set": IS_NULL is complete with nothing typed at all, and a BETWEEN with
 * one bound is not a half-filter to be generously interpreted -- it is a range with no top,
 * which the server would have to invent.
 */
export function clauseComplete(clause: FilterClause): boolean {
  if (!clause.field) return false;
  const operands = OPERAND_COUNT[clause.operator];
  if (operands === 0) return true;
  if (operands === 1) return !!(clause.value && clause.value.trim());
  const values = (clause.values ?? []).filter(v => !!v && !!v.trim());
  if (operands === 2) return values.length === 2;
  return values.length > 0;
}

/**
 * The group with every incomplete clause and every empty group removed.
 *
 * Run before sending, and this is a correctness step rather than tidiness. A half-typed clause
 * sent to the server is a predicate somebody did not write being applied to rows they will then
 * read as the whole answer. Dropping it silently would be the same mistake in the other
 * direction, so the Canvas shows the count of what it is actually sending beside the count of
 * what is on screen, and they differ visibly while a clause is unfinished.
 */
export function pruneFilters(group: FilterGroup): FilterGroup {
  const clauses: FilterNode[] = [];
  for (const node of group.clauses) {
    if (isFilterGroup(node)) {
      const pruned = pruneFilters(node);
      if (pruned.clauses.length) clauses.push(pruned);
    } else if (clauseComplete(node)) {
      clauses.push(node);
    }
  }
  return { op: group.op, clauses };
}

/** Every clause in the tree, groups included. Counts what a reader sees, not what is sent. */
export function countFilterClauses(group: FilterGroup): number {
  return group.clauses.reduce(
    (total, node) => total + (isFilterGroup(node) ? countFilterClauses(node) : 1), 0);
}

/**
 * One clause in words, for a chip and for a title attribute.
 *
 * The operand is quoted rather than run together with the operator, because a value with a space
 * in it -- "North West" -- otherwise reads as two words of the sentence.
 */
export function describeClause(clause: FilterClause): string {
  const label = FILTER_OPERATORS.find(o => o.id === clause.operator)?.label ?? clause.operator;
  const operands = OPERAND_COUNT[clause.operator];
  if (operands === 0) return `${clause.field} ${label}`;
  if (operands === 1) {
    if (clause.operator === 'RELATIVE_DATE') {
      const window = RELATIVE_WINDOWS.find(w => w.id === clause.value)?.label ?? clause.value;
      return `${clause.field} ${label} ${window}`;
    }
    return `${clause.field} ${label} "${clause.value ?? ''}"`;
  }
  const values = clause.values ?? [];
  if (operands === 2) return `${clause.field} ${label} ${values[0] ?? ''} and ${values[1] ?? ''}`;
  return `${clause.field} ${label} ${values.map(v => `"${v}"`).join(', ')}`;
}

/** One row of the builder: a nested group, or a clause. Never both, never neither. */
interface BuilderRow {
  index: number;
  group: FilterGroup | null;
  clause: FilterClause | null;
  /** Empty when the operator suits the column; a sentence when it probably does not. */
  hint: string;
  operands: 0 | 1 | 2 | 'many';
  /** IN and NOT_IN edit as one comma-separated line; this is that line. */
  joined: string;
}

/**
 * The advanced filter builder: fourteen operators over nested AND/OR groups.
 *
 * ITS OWN COMPONENT, and recursive: a group renders its clauses and then renders itself again
 * for each nested group. That is the only structure that makes `a AND (b OR c)` expressible, and
 * expressing it is the whole difference between this and the filter bars elsewhere in the app,
 * which are flat implicit ANDs over a fixed vocabulary of five fields.
 *
 * <b>The model goes in and a new model comes out.</b> Nothing is mutated in place. Every edit
 * emits a whole replacement group, which is what lets the Canvas above it hold one signal, keep
 * an undo-able history if it ever wants one, and -- the part that matters today -- compare what
 * is on screen against what it is about to send. An in-place mutation would make those the same
 * object and the comparison impossible.
 *
 * <b>What it will not do is guess.</b> An operator that does not suit a column's type is listed
 * and selectable with a note beside it, not disabled: a VARCHAR column holding "1200", "980" is
 * a real thing in a CSV, and refusing to compare it because DuckDB called the column VARCHAR
 * would be this screen overruling a reader who can see the data. The connection picker and the
 * chart-kind picker disable an option when the reason is a FACT; this one only hints, because
 * the reason here is an inference from a type name.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-filter-builder',
  // Self-referencing on purpose -- see the class note. Angular resolves the forward reference
  // for a standalone component that imports itself, which is what makes the recursion possible
  // without a second near-identical component for "a group inside a group".
  imports: [Icon, FilterBuilder],
  template: `
    <div class="flex flex-col gap-2 rounded-md p-2 min-w-0"
         [class.border]="depth() > 0"
         [class.border-subtle]="depth() > 0"
         [class.bg-sunken]="depth() > 0">

      <div class="flex flex-wrap items-center gap-2 min-w-0">
        <!-- AND and OR as two buttons rather than a select. The choice governs every row under
             it, and a closed select saying "AND" reads as a label rather than as a control. -->
        <div class="flex rounded overflow-hidden border border-subtle shrink-0">
          @for (choice of ['AND', 'OR']; track choice) {
            <button type="button" class="px-2 py-0.5 text-[11px] font-semibold transition-colors"
                    [class.bg-sunken]="model().op !== choice"
                    [class.text-[color:var(--text-muted)]]="model().op !== choice"
                    [class.pill-solid-brand]="model().op === choice"
                    [attr.aria-pressed]="model().op === choice"
                    (click)="setOp($any(choice))">{{ choice }}</button>
          }
        </div>
        <span class="text-[11px] text-[color:var(--text-muted)]">
          {{ model().op === 'AND' ? 'every condition below must hold' : 'any one condition below is enough' }}
        </span>

        <div class="ml-auto flex items-center gap-1 shrink-0">
          <button type="button" class="btn btn-ghost btn-xs" [disabled]="!columns().length"
                  (click)="addClause()">
            <app-icon name="plus" />Condition
          </button>
          @if (depth() < maxDepth) {
            <button type="button" class="btn btn-ghost btn-xs" (click)="addGroup()"
                    title="A group nests: the conditions inside it are joined by their own AND or OR.">
              <app-icon name="plus" />Group
            </button>
          }
          @if (depth() > 0) {
            <button type="button" class="btn btn-ghost btn-xs" (click)="removed.emit()"
                    title="Remove this group and everything in it">
              <app-icon name="close" />
            </button>
          }
        </div>
      </div>

      @for (row of rows(); track row.index) {
        @if (row.group) {
          <app-filter-builder [model]="row.group" [columns]="columns()" [depth]="depth() + 1"
                              (changed)="replaceChild(row.index, $event)"
                              (removed)="removeAt(row.index)" />
        } @else if (row.clause) {
          <div class="flex flex-wrap items-start gap-1.5 min-w-0">

            <select class="input input-sm w-auto min-w-0 max-w-44"
                    [attr.aria-label]="'Column for condition ' + (row.index + 1)"
                    [value]="row.clause.field"
                    (change)="setField(row.index, $any($event.target).value)">
              @for (column of columns(); track column.name) {
                <option [value]="column.name" [selected]="column.name === row.clause.field">
                  {{ column.name }}
                </option>
              }
            </select>

            <select class="input input-sm w-auto min-w-0 max-w-44"
                    [attr.aria-label]="'Operator for condition ' + (row.index + 1)"
                    [value]="row.clause.operator"
                    (change)="setOperator(row.index, $any($event.target).value)">
              @for (operator of operators; track operator.id) {
                <option [value]="operator.id" [selected]="operator.id === row.clause!.operator">
                  {{ operator.label }}
                </option>
              }
            </select>

            @switch (row.operands) {
              @case (0) {
                <!-- Nothing to type. Said rather than left blank: an empty space beside an
                     operator reads as a control that has not loaded. -->
                <span class="text-[11px] text-[color:var(--text-muted)] self-center py-1">
                  no value needed
                </span>
              }
              @case (1) {
                @if (row.clause.operator === 'RELATIVE_DATE') {
                  <select class="input input-sm w-auto min-w-0"
                          [attr.aria-label]="'Window for condition ' + (row.index + 1)"
                          [value]="row.clause.value ?? ''"
                          (change)="setValue(row.index, $any($event.target).value)">
                    <option value="">choose a window…</option>
                    @for (window of relativeWindows; track window.id) {
                      <option [value]="window.id" [selected]="window.id === row.clause!.value">
                        {{ window.label }}
                      </option>
                    }
                  </select>
                } @else {
                  <input class="input input-sm w-auto min-w-0 max-w-44"
                         [type]="inputType(row.clause)"
                         [attr.aria-label]="'Value for condition ' + (row.index + 1)"
                         [value]="row.clause.value ?? ''"
                         (change)="setValue(row.index, $any($event.target).value)" />
                }
              }
              @case (2) {
                <input class="input input-sm w-auto min-w-0 max-w-36"
                       [type]="boundType(row.clause)"
                       [attr.aria-label]="'Lower bound for condition ' + (row.index + 1)"
                       [value]="row.clause.values?.[0] ?? ''"
                       (change)="setBound(row.index, 0, $any($event.target).value)" />
                <span class="text-[11px] text-[color:var(--text-muted)] self-center py-1">and</span>
                <input class="input input-sm w-auto min-w-0 max-w-36"
                       [type]="boundType(row.clause)"
                       [attr.aria-label]="'Upper bound for condition ' + (row.index + 1)"
                       [value]="row.clause.values?.[1] ?? ''"
                       (change)="setBound(row.index, 1, $any($event.target).value)" />
              }
              @default {
                <input class="input input-sm flex-1 min-w-0"
                       [attr.aria-label]="'Values for condition ' + (row.index + 1)"
                       placeholder="one, two, three"
                       [value]="row.joined"
                       (change)="setList(row.index, $any($event.target).value)" />
              }
            }

            <button type="button" class="btn btn-ghost btn-xs self-center"
                    [attr.aria-label]="'Remove condition ' + (row.index + 1)"
                    (click)="removeAt(row.index)">
              <app-icon name="close" />
            </button>

            @if (row.hint) {
              <!-- A hint, not a refusal. A CSV column of digits is typed VARCHAR and comparing
                   it is a legitimate thing to want; this only says the type does not agree. -->
              <p class="basis-full field-note text-[color:var(--text-muted)]">{{ row.hint }}</p>
            }
            @if (row.operands === 'many') {
              <p class="basis-full field-note text-[color:var(--text-muted)]">
                Separated by commas, so a value that itself contains a comma cannot be written
                here — use several <span class="font-medium">is</span> conditions in an
                <span class="font-medium">OR</span> group for those.
              </p>
            }
            @if (row.clause.operator === 'RELATIVE_DATE') {
              <p class="basis-full field-note text-[color:var(--text-muted)]">
                The window is resolved by the server when the analysis runs, not by this browser,
                so a saved analysis means the same period wherever it is opened from.
              </p>
            }
          </div>
        }
      } @empty {
        <p class="text-xs text-[color:var(--text-muted)] px-1 py-1">
          @if (columns().length) {
            No conditions. Every row is included.
          } @else {
            Open a dataset first — the columns it has are what a condition can be written against.
          }
        </p>
      }
    </div>
  `,
})
export class FilterBuilder {
  /** The group this instance edits. Replaced wholesale on every change; never mutated. */
  readonly model = input.required<FilterGroup>();
  /** The dataset's columns. A condition can only name one of these. */
  readonly columns = input.required<DatasetColumn[]>();
  /** 0 at the top. Drives the indent, and whether this group can be removed or nested into. */
  readonly depth = input(0);

  readonly changed = output<FilterGroup>();
  /** Emitted by a nested group asking its parent to drop it. Never fired at depth 0. */
  readonly removed = output<void>();

  readonly operators = FILTER_OPERATORS;
  readonly relativeWindows = RELATIVE_WINDOWS;
  readonly maxDepth = MAX_GROUP_DEPTH;

  /**
   * One view row per node, with the per-row facts precomputed.
   *
   * Precomputed rather than called from the template because each of these is derived from two
   * things -- the clause and the column it names -- and working that out inside a binding would
   * re-scan the column list on every change detection pass, once per row.
   */
  readonly rows = computed<BuilderRow[]>(() => {
    const columns = new Map(this.columns().map(column => [column.name, column.type]));
    return this.model().clauses.map((node, index) => {
      if (isFilterGroup(node)) {
        return { index, group: node, clause: null, hint: '', operands: 0 as const, joined: '' };
      }
      const operands = OPERAND_COUNT[node.operator];
      return {
        index, group: null, clause: node, operands,
        hint: this.hintFor(node, columns.get(node.field)),
        joined: (node.values ?? []).join(', '),
      };
    });
  });

  /**
   * Why an operator may not suit the column it was picked for.
   *
   * Inference, and worded as inference. A type name is what the engine guessed while reading the
   * file, and a CSV of numbers with one "n/a" in it is typed VARCHAR -- so this says what the
   * type is rather than what the reader should do about it.
   */
  private hintFor(clause: FilterClause, type: string | undefined): string {
    if (!type) return '';
    const numeric = isNumericType(type);
    const date = isDateType(type);
    if ((clause.operator === 'DATE_RANGE' || clause.operator === 'RELATIVE_DATE') && !date) {
      return `${clause.field} is ${type}, not a date column — the server will have to read its values as dates.`;
    }
    if (clause.operator === 'NUMERIC_RANGE' && !numeric) {
      return `${clause.field} is ${type}, not a number column — the server will have to read its values as numbers.`;
    }
    if ((clause.operator === 'CONTAINS' || clause.operator === 'STARTS_WITH') && (numeric || date)) {
      return `${clause.field} is ${type}; matching text inside it compares the value as it is written, not as it is ordered.`;
    }
    return '';
  }

  /** A number column gets a number input, a date column a date one. Text everywhere else. */
  inputType(clause: FilterClause): string {
    const type = this.columns().find(column => column.name === clause.field)?.type;
    if (isNumericType(type)) return 'number';
    if (isDateType(type)) return 'date';
    return 'text';
  }

  /**
   * The input type for a two-bound operator, decided by the OPERATOR and not by the column.
   *
   * NUMERIC_RANGE is a number range whatever the column is typed as -- that is what picking it
   * asserted -- and DATE_RANGE is a date range. Only BETWEEN, which is deliberately untyped,
   * falls back to what the column looks like.
   */
  boundType(clause: FilterClause): string {
    if (clause.operator === 'NUMERIC_RANGE') return 'number';
    if (clause.operator === 'DATE_RANGE') return 'date';
    return this.inputType(clause);
  }

  setOp(op: 'AND' | 'OR'): void {
    this.changed.emit({ op, clauses: this.model().clauses });
  }

  addClause(): void {
    const first = this.columns()[0];
    if (!first) return;
    this.emitClauses([...this.model().clauses, newFilterClause(first.name)]);
  }

  addGroup(): void {
    this.emitClauses([...this.model().clauses, emptyFilterGroup()]);
  }

  removeAt(index: number): void {
    this.emitClauses(this.model().clauses.filter((_, at) => at !== index));
  }

  replaceChild(index: number, group: FilterGroup): void {
    this.emitClauses(this.model().clauses.map((node, at) => at === index ? group : node));
  }

  setField(index: number, field: string): void {
    this.patch(index, clause => ({ ...clause, field }));
  }

  /**
   * Changes the operator, and drops the operands the new one cannot use.
   *
   * The drop is the point. Going from EQ "north" to BETWEEN leaves `value` set, and carrying it
   * across as the lower bound would be this component deciding what somebody meant. Going the
   * other way is worse: a stale second bound on a clause that now shows one input is an operand
   * the reader cannot see and cannot clear.
   */
  setOperator(index: number, operator: FilterOperator): void {
    this.patch(index, clause => {
      const before = OPERAND_COUNT[clause.operator];
      const after = OPERAND_COUNT[operator];
      const next: FilterClause = { field: clause.field, operator };
      // The one carry that is not a guess: both take exactly one free-text operand, and the
      // relative-date token is not free text, so it is not carried into or out of one.
      if (before === 1 && after === 1
          && clause.operator !== 'RELATIVE_DATE' && operator !== 'RELATIVE_DATE') {
        next.value = clause.value;
      }
      // A list survives a move between the list operators, and between the range operators,
      // because the operands mean the same thing on both sides of that move.
      if ((before === 'many' && after === 'many') || (before === 2 && after === 2)) {
        next.values = clause.values;
      }
      return next;
    });
  }

  setValue(index: number, value: string): void {
    this.patch(index, clause => ({ ...clause, value }));
  }

  setBound(index: number, at: 0 | 1, value: string): void {
    this.patch(index, clause => {
      const values = [clause.values?.[0] ?? '', clause.values?.[1] ?? ''];
      values[at] = value;
      return { ...clause, values };
    });
  }

  /**
   * The comma-separated line back into a list.
   *
   * Empty entries are dropped so "north, , south" is two values rather than three, one of which
   * is a filter for the empty string. A reader who wants to match an empty value has IS_NULL.
   */
  setList(index: number, text: string): void {
    const values = text.split(',').map(part => part.trim()).filter(part => !!part);
    this.patch(index, clause => ({ ...clause, values }));
  }

  private patch(index: number, change: (clause: FilterClause) => FilterClause): void {
    this.emitClauses(this.model().clauses.map((node, at) =>
      at === index && !isFilterGroup(node) ? change(node) : node));
  }

  private emitClauses(clauses: FilterNode[]): void {
    this.changed.emit({ op: this.model().op, clauses });
  }
}
