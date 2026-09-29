import { Component, computed, input } from '@angular/core';
import { DataText } from '../../../shared/ui/data-text';
import { formatSize } from '../../../shared/ui/format-size';
import { PreviewResult } from './sources.model';

/**
 * A source's first rows, as the service returned them: masked there (a value a policy hides arrives as "***"),
 * and shown here exactly so. Every value is a customer's, of any length, so each cell goes through app-data-text.
 */
@Component({
  selector: 'app-preview-table',
  imports: [DataText],
  template: `
    @let p = result();
    <div class="flex flex-col gap-2 min-w-0">
      <p class="text-xs text-[color:var(--text-muted)]" data-test="preview-summary">
        {{ p.rowCount ?? rows().length }} row{{ (p.rowCount ?? rows().length) === 1 ? '' : 's' }} · {{ columns().length }} column{{ columns().length === 1 ? '' : 's' }}@if (p.bytes) { · {{ size() }} }@if (p.truncated) { · more rows were left out }
      </p>
      @if (columns().length) {
        <div class="overflow-auto max-h-96 rounded border border-subtle">
          <table class="table-modern" data-test="preview-rows">
            <thead><tr>@for (column of columns(); track column) { <th class="mono text-xs whitespace-nowrap">{{ column }}</th> }</tr></thead>
            <tbody>
              @for (row of cells(); track $index) {
                <tr>
                  @for (value of row; track $index; let i = $index) {
                    <td class="max-w-64 min-w-24"><app-data-text class="mono text-xs" [value]="value" [label]="columns()[i]" /></td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="text-sm text-[color:var(--text-muted)]">No rows.</p>
      }
    </div>
  `,
})
export class PreviewTable {
  readonly result = input.required<PreviewResult>();

  readonly rows = computed(() => this.result().rows ?? []);
  /** The service's column order, or the keys of the rows when it sent none. */
  readonly columns = computed(() => {
    const named = this.result().columns ?? [];
    if (named.length) return named;
    const seen = new Set<string>();
    for (const row of this.rows()) for (const key of Object.keys(row ?? {})) seen.add(key);
    return [...seen];
  });
  readonly cells = computed(() => this.rows().map(row => this.columns().map(c => shown(row?.[c]))));
  readonly size = computed(() => formatSize(this.result().bytes ?? 0));
}

/** A value as the service sent it: text as is, null as "null", anything nested as its JSON. */
function shown(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
