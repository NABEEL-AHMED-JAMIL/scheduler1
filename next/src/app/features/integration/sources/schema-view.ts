import { Component, computed, input, signal } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { clipText } from '../../../shared/ui/long-text';
import { SchemaField, schemaRows } from './sources.model';

/** The most of a raw schema drawn inline; a wide table's schema is long, and the list above says the same. */
const RAW_MAX = 100_000;

/**
 * An inferred or saved JSON Schema, read as a list of fields -- path, type, whether it is required, whether it
 * may be null -- with the raw JSON a toggle away. The fields are the service's when it sent them, otherwise read
 * from the schema itself.
 */
@Component({
  selector: 'app-schema-view',
  imports: [Icon],
  template: `
    <div class="flex flex-col gap-2 min-w-0">
      <div class="flex items-center gap-2">
        <p class="text-xs text-[color:var(--text-muted)] flex-1 min-w-0">
          {{ rows().length }} field{{ rows().length === 1 ? '' : 's' }} · {{ requiredCount() }} required
        </p>
        <button type="button" class="btn btn-ghost btn-xs" [attr.aria-pressed]="raw()" (click)="raw.set(!raw())">
          <app-icon name="code" size="0.85em" />{{ raw() ? 'Fields' : 'Raw JSON' }}
        </button>
      </div>
      @if (raw()) {
        <pre class="mono text-xs leading-relaxed rounded border border-subtle bg-sunken px-3 py-2 max-h-96 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]" data-test="schema-raw">{{ rawText() }}</pre>
      } @else {
        <div class="overflow-x-auto">
          <table class="table-modern" data-test="schema-fields">
            <thead><tr><th>Field</th><th>Type</th><th>Required</th></tr></thead>
            <tbody>
              @for (f of rows(); track f.path) {
                <tr>
                  <td class="mono text-xs max-w-80 [overflow-wrap:anywhere]">{{ f.path }}</td>
                  <td class="mono text-xs whitespace-nowrap">{{ f.type }}@if (f.nullable) { <span class="text-[color:var(--text-muted)]"> | null</span> }</td>
                  <td class="text-xs">@if (f.required) { <span class="pill pill-brand">Required</span> } @else { <span class="text-[color:var(--text-muted)]">optional</span> }</td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="text-sm text-[color:var(--text-muted)]">No fields.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class SchemaView {
  readonly schema = input<unknown>(null);
  readonly fields = input<SchemaField[] | null | undefined>(null);
  readonly raw = signal(false);

  readonly rows = computed(() => schemaRows(this.schema(), this.fields()));
  readonly requiredCount = computed(() => this.rows().filter(f => f.required).length);
  readonly rawText = computed(() => clipText(JSON.stringify(this.schema() ?? {}, null, 2), RAW_MAX));
}
