import { Component, computed, input, signal } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { DataText } from '../../../shared/ui/data-text';
import { formatSize } from '../../../shared/ui/format-size';
import { clipText } from '../../../shared/ui/long-text';
import { RunResult } from './api-collections.model';

type Tab = 'body' | 'headers' | 'extracted' | 'assertions';

/** The most of a body drawn inline; a paged API can answer megabytes, and the rest is not worth a frozen tab. */
const BODY_MAX = 200_000;

/**
 * A test's answer (MIG-226's RunResult), masked by the service before it left: nothing here holds a secret the
 * run used. The outcome and timing first, then the first page's body, its headers, what the extract rules pulled
 * out and how the assertions went.
 */
@Component({
  selector: 'app-response-viewer',
  imports: [Icon, DataText],
  template: `
    @let r = result();
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-test="run-summary">
        <span class="pill" [class.pill-ok]="r.outcome === 'OK'" [class.pill-crit]="r.outcome === 'FAILED'" [class.pill-warn]="r.outcome === 'BLOCKED'">
          <app-icon [name]="r.outcome === 'OK' ? 'checkCircle' : r.outcome === 'BLOCKED' ? 'shield' : 'xCircle'" size="0.9em" />{{ outcomeLabel() }}
        </span>
        @if (r.statusCode) { <span class="mono">HTTP {{ r.statusCode }}</span> }
        <span class="text-[color:var(--text-secondary)]">{{ r.durationMs }} ms</span>
        @if (r.responseBytes) { <span class="text-[color:var(--text-secondary)]">{{ size() }}</span> }
        @if (r.attempts > 1) { <span class="text-[color:var(--text-secondary)]">{{ r.attempts }} attempts</span> }
        @if (r.assertions?.length) { <span [class.text-crit-500]="failedAssertions()">{{ passedAssertions() }} of {{ r.assertions!.length }} assertions passed</span> }
      </div>
      @if (r.message) { <p class="text-sm" [class.text-crit-500]="r.outcome !== 'OK'" role="status">{{ r.message }}</p> }
      @if (r.items?.length || r.pages > 1) {
        <p class="text-xs text-[color:var(--text-muted)]">
          {{ r.items?.length ?? 0 }} items over {{ r.pages }} page{{ r.pages === 1 ? '' : 's' }}@if (r.truncated) {; stopped at the page cap with more to fetch}
        </p>
      }

      @if (r.outcome !== 'BLOCKED' && (r.statusCode || r.body !== undefined)) {
        <div class="tabs" role="tablist" aria-label="Response">
          @for (t of tabs(); track t.id) {
            <button type="button" role="tab" class="tab" [class.tab-active]="tab() === t.id" [attr.aria-selected]="tab() === t.id"
                    (click)="tab.set(t.id)">{{ t.label }}</button>
          }
        </div>
        @switch (tab()) {
          @case ('body') {
            @if (bodyText()) {
              <pre class="mono text-xs leading-relaxed rounded border border-subtle bg-sunken px-3 py-2 max-h-96 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{{ bodyText() }}</pre>
            } @else {
              <p class="text-sm text-[color:var(--text-muted)]">No body{{ r.responseBytes ? ' (binary)' : '' }}.</p>
            }
          }
          @case ('headers') {
            <table class="table-modern">
              <thead><tr><th>Header</th><th>Value</th></tr></thead>
              <tbody>
                @for (h of headerRows(); track h[0]) {
                  <tr><td class="mono text-xs whitespace-nowrap">{{ h[0] }}</td><td class="max-w-96"><app-data-text class="mono text-xs" [value]="h[1]" [label]="h[0]" /></td></tr>
                }
              </tbody>
            </table>
          }
          @case ('extracted') {
            <table class="table-modern">
              <thead><tr><th>Name</th><th>Value</th></tr></thead>
              <tbody>
                @for (x of extractedRows(); track x[0]) {
                  <tr><td class="mono text-xs whitespace-nowrap">{{ x[0] }}</td><td class="max-w-96"><app-data-text class="mono text-xs" [value]="x[1]" [label]="x[0]" /></td></tr>
                } @empty { <tr><td colspan="2" class="text-sm text-[color:var(--text-muted)]">No extract rules.</td></tr> }
              </tbody>
            </table>
          }
          @case ('assertions') {
            <table class="table-modern">
              <thead><tr><th>Rule</th><th>Result</th><th>Actual</th></tr></thead>
              <tbody>
                @for (a of r.assertions ?? []; track $index) {
                  <tr>
                    <td class="mono text-xs max-w-72"><app-data-text [value]="a.rule" label="Rule" /></td>
                    <td><span class="pill" [class.pill-ok]="a.passed" [class.pill-crit]="!a.passed">{{ a.passed ? 'Passed' : 'Failed' }}</span></td>
                    <td class="mono text-xs max-w-72"><app-data-text [value]="a.actual ?? ''" label="Actual" /></td>
                  </tr>
                } @empty { <tr><td colspan="3" class="text-sm text-[color:var(--text-muted)]">No assert rules.</td></tr> }
              </tbody>
            </table>
          }
        }
      }
    </div>
  `,
})
export class ResponseViewer {
  readonly result = input.required<RunResult>();
  readonly tab = signal<Tab>('body');

  readonly outcomeLabel = computed(() => ({ OK: 'OK', FAILED: 'Failed', BLOCKED: 'Blocked' })[this.result().outcome] ?? this.result().outcome);
  readonly size = computed(() => formatSize(this.result().responseBytes));
  readonly passedAssertions = computed(() => (this.result().assertions ?? []).filter(a => a.passed).length);
  readonly failedAssertions = computed(() => (this.result().assertions ?? []).some(a => !a.passed));
  readonly headerRows = computed(() => Object.entries(this.result().headers ?? {}));
  readonly extractedRows = computed(() => Object.entries(this.result().extracted ?? {})
    .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string]));
  readonly tabs = computed(() => [
    { id: 'body' as Tab, label: 'Body' },
    { id: 'headers' as Tab, label: `Headers (${this.headerRows().length})` },
    { id: 'extracted' as Tab, label: `Extracted (${this.extractedRows().length})` },
    { id: 'assertions' as Tab, label: `Assertions (${this.result().assertions?.length ?? 0})` },
  ]);
  readonly bodyText = computed(() => {
    const body = this.result().body;
    if (body === null || body === undefined) return '';
    const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    return clipText(text, BODY_MAX);
  });
}
