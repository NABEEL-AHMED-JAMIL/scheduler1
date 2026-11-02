import { Component, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Icon } from '../../../shared/ui/icon';
import { Problem } from '../report-studio.model';
import { problemTitle } from '../problem-list';
import { Block, blockLabel, find, typeWord } from './designer-model';

/** One problem with the data, as the canvas lists it: what, which field, which block, and what to do. */
export interface DataProblemRow {
  severity: 'ERROR' | 'WARNING';
  title: string;
  field: string | null;
  message: string;
  /** The block it is about, when it is on the page: clicking the row selects it. */
  componentId: string | null;
  component: string | null;
  todo: string;
}

/** What to do about each kind of data problem, in the person's words. */
const TODO: Record<string, string> = {
  BINDING_NOT_RESOLVED: 'Pick a field the test data has (under Data in the block\'s settings), or check this is the right test data.',
  REQUIRED_FIELD_MISSING: 'Add the field to the source data, or mark it optional in the template\'s data contract.',
  DATA_SCHEMA_MISMATCH: 'Point the block at a list where it needs one, or choose test data of the shape the template expects.',
  EMPTY_TABLE: 'If no rows is expected, check that the table\'s "When empty" text reads well.',
  VALUE_FORMAT_MISMATCH: 'Choose the format that matches the value, or correct the value in the source data.',
  METRIC_NOT_A_NUMBER: 'Bind the metric to a number field.',
  CHART_FIELD_TYPE_INVALID: 'Choose a number field for the chart\'s values.',
  QR_CONTENT_INVALID: 'Change what the QR code opens, or the value it reads.',
  FILTER_PARTIAL: 'Check the block\'s "Show only rows where" filter against the data.',
  REPEAT_CAPPED: 'Filter the list, or split the report: a block repeats at most 1,000 times.',
};

/** Problems about the data: its bindings and its contract, or any that names a field. */
export function isDataProblem(p: Problem): boolean {
  return p.stage === 'BINDINGS' || p.stage === 'DATA_CONTRACT' || !!p.path;
}

/** The data problems as rows, blocking ones first, each with the block it is about (when it is on the page). */
export function dataProblems(problems: Problem[], blocks: Block[]): DataProblemRow[] {
  const rows = problems.filter(isDataProblem).map<DataProblemRow>(p => {
    const at = p.componentId ? find(blocks, p.componentId) : null;
    return {
      severity: p.severity,
      title: problemTitle({ ...p, path: undefined }),
      field: p.path && !p.path.startsWith('$.') ? p.path : null,
      message: p.message,
      componentId: at ? at.block.id : null,
      component: at ? `${blockLabel(at.block)} · ${typeWord(at.block.type)}` : null,
      todo: TODO[p.code] ?? (at ? 'Select the block to change its settings.' : 'Check the test data, or the template\'s data contract.'),
    };
  });
  return [...rows.filter(r => r.severity === 'ERROR'), ...rows.filter(r => r.severity !== 'ERROR')];
}

/** How many a closed list shows before "Show all". */
export const SHOWN = 4;

/**
 * The test data's problems over the canvas (Reports redesign): a banner that says how many, then each one -- what is
 * wrong, the field, the block it is about and what to do. A row with a block on the page selects it.
 */
@Component({
  selector: 'app-rs-data-problems',
  imports: [Icon, NgTemplateOutlet],
  template: `
    @if (rows().length) {
      <section class="rs-banner dpr" [class.rs-banner-crit]="blocking()" [class.rs-banner-warn]="!blocking()" aria-label="Problems with the data" data-data-problems>
        <div class="dpr-head">
          <app-icon name="alert" [class]="blocking() ? 'icon-crit shrink-0' : 'icon-warn shrink-0'" />
          <h2 class="text-sm font-semibold flex-1 min-w-0">{{ heading() }}</h2>
          <button type="button" class="btn btn-ghost btn-xs" [attr.aria-expanded]="open()" (click)="open.set(!open())">{{ open() ? 'Hide' : 'Show' }}</button>
        </div>
        @if (open()) {
          <ul class="dpr-list">
            @for (r of visible(); track $index) {
              <li>
                @if (r.componentId) {
                  <button type="button" class="dpr-row" [class.is-on]="selectedId() === r.componentId" (click)="selected.emit(r.componentId)"
                          [title]="'Select ' + r.component">
                    <ng-container *ngTemplateOutlet="row; context: { $implicit: r }" />
                  </button>
                } @else {
                  <div class="dpr-row"><ng-container *ngTemplateOutlet="row; context: { $implicit: r }" /></div>
                }
              </li>
            }
          </ul>
          @if (rows().length > shown) {
            <button type="button" class="link-inline text-xs" (click)="all.set(!all())">{{ all() ? 'Show fewer' : 'Show all ' + rows().length }}</button>
          }
        }
      </section>
    }
    <ng-template #row let-r>
      <span class="dpr-what">
        <b [class]="r.severity === 'ERROR' ? 'dpr-crit' : 'dpr-warn'">{{ r.title }}</b>
        @if (r.field) { <span class="mono dpr-field">{{ r.field }}</span> }
        @if (r.component) { <span class="dpr-muted">in {{ r.component }}</span> }
      </span>
      <span class="block text-xs">{{ r.message }}</span>
      <span class="block text-xs dpr-muted"><b class="font-semibold">What to do:</b> {{ r.todo }}</span>
    </ng-template>
  `,
  styles: `
    :host { display: block; width: min(100%, 52rem); margin-bottom: 0.5rem; }
    .dpr { flex-direction: column; gap: 0.375rem; padding: 0.625rem 0.75rem; }
    .dpr-head { display: flex; align-items: center; gap: 0.5rem; width: 100%; }
    .dpr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; width: 100%; }
    .dpr-row { display: flex; flex-direction: column; gap: 0.125rem; width: 100%; padding: 0.375rem 0.5rem; text-align: left;
      border-radius: var(--radius-md); background: var(--surface-raised); border: 1px solid var(--border-subtle); color: var(--text-primary); }
    button.dpr-row:hover { border-color: var(--border-strong); }
    .dpr-row.is-on { border-color: var(--accent-mark-strong); }
    .dpr-what { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.5rem; font-size: 0.8125rem; }
    .dpr-field { font-size: 0.75rem; padding: 0 0.25rem; border-radius: var(--radius-sm); background: var(--surface-sunken); overflow-wrap: anywhere; }
    .dpr-crit { color: var(--crit-text); }
    .dpr-warn { color: var(--warn-text); }
    .dpr-muted { color: var(--text-muted); }
  `,
})
export class DataProblems {
  readonly problems = input<Problem[]>([]);
  readonly blocks = input<Block[]>([]);
  /** True when the canvas is drawn with test data; else the problems are with the bindings alone. */
  readonly withData = input(true);
  readonly selectedId = input<string | null>(null);
  readonly selected = output<string>();

  readonly shown = SHOWN;
  readonly open = signal(true);
  readonly all = signal(false);
  readonly rows = computed(() => dataProblems(this.problems(), this.blocks()));
  readonly visible = computed(() => (this.all() ? this.rows() : this.rows().slice(0, SHOWN)));
  readonly blocking = computed(() => this.rows().some(r => r.severity === 'ERROR'));
  readonly heading = computed(() => {
    const n = this.rows().length;
    return `${n} problem${n === 1 ? '' : 's'} with ${this.withData() ? 'the test data' : 'the bindings'}${this.blocking() ? ': a report cannot be made with it' : ''}`;
  });
}
