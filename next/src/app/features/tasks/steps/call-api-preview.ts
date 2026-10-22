import { Component, computed, input } from '@angular/core';

/**
 * MIG-419: what a Call API step's first call sends, built in the browser from the pipeline's sample rows -- the same
 * shapes Core builds (process-main CallApiStepTask): {{row}} a row as one JSON object (the chosen columns, renamed, a dot
 * in a name nesting), {{rows_json}} a batch of rows as one JSON array, {{batch}}, {{batches}} and {{batch_rows}}. The run's
 * own values ({{run}}, {{call_key}}, {{file_key}}...) are only known when it runs, so they show as written.
 */
export interface CallPreview {
  /** How many calls the sample rows would make. */
  calls: number;
  /** Each request variable as the first call fills it; json when it is a row or rows, shown formatted. */
  variables: { name: string; text: string; json: boolean }[];
}

type Row = Record<string, unknown>;
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.\- ]+?)\s*}}/g;
const JSON_VALUE = /\{\{\s*(row|rows_json)\s*}}/;

/** A row as one object, as Core sends it: the chosen columns (every one when none), named by As, a dot nesting. */
export function rowObject(row: Row, chosen: { column?: unknown; as?: unknown }[]): Record<string, unknown> {
  const pairs: [string, string][] = chosen.length
    ? chosen.map(c => [String(c.column ?? ''), String(c.as ?? '') || String(c.column ?? '')])
    : Object.keys(row).map(k => [k, k]);
  const out: Record<string, unknown> = {};
  for (const [name, as] of pairs) {
    const path = as.split('.');
    let at: Record<string, unknown> = out;
    for (const part of path.slice(0, -1)) {
      if (typeof at[part] !== 'object' || at[part] === null || Array.isArray(at[part])) at[part] = {};
      at = at[part] as Record<string, unknown>;
    }
    at[path[path.length - 1]] = row[name] ?? null;
  }
  return out;
}

export function callApiPreview(config: Record<string, unknown> | null | undefined, rows: Row[] | null | undefined): CallPreview | null {
  const sample = rows ?? [];
  if (!sample.length) return null;
  const cfg = config ?? {};
  const mode = String(cfg['mode'] ?? 'each');
  const chosen = Array.isArray(cfg['columns']) ? cfg['columns'] as { column?: unknown; as?: unknown }[] : [];
  const size = Math.max(1, Math.min(1000, Number(cfg['batchSize'] ?? 50) || 50));
  const values: Record<string, unknown> = {};
  let calls: number;
  if (mode === 'batch') {
    const part = sample.slice(0, size);
    calls = Math.ceil(sample.length / size);
    values['rows_json'] = JSON.stringify(part.map(r => rowObject(r, chosen)));
    values['batch'] = 1;
    values['batches'] = calls;
    values['batch_rows'] = part.length;
  } else {
    const first = sample[0];
    calls = mode === 'once' ? 1 : sample.length;
    Object.assign(values, first);
    if (!('row' in first)) values['row'] = JSON.stringify(rowObject(first, chosen));
    values['rows'] = mode === 'once' ? 1 : sample.length;
  }
  const templates = cfg['variables'] && typeof cfg['variables'] === 'object' ? cfg['variables'] as Record<string, unknown> : {};
  const variables = Object.entries(templates).map(([name, template]) => {
    const written = String(template ?? '');
    const text = written.replace(PLACEHOLDER, (whole, key: string) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : whole);
    // As Core: only when the row or rows it names are this step's own JSON (a column named row stays its text).
    const named = JSON_VALUE.exec(written)?.[1];
    const value = named ? values[named] : undefined;
    const sendsJson = typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'));
    if (sendsJson) {
      try {
        return { name, text: JSON.stringify(JSON.parse(text), null, 2), json: true };
      } catch {
        // Not JSON once filled: it is sent as text, as Core sends it.
      }
    }
    return { name, text, json: false };
  });
  return { calls, variables };
}

@Component({
  selector: 'app-call-api-preview',
  template: `
    <section class="flex flex-col gap-2 min-w-0" aria-labelledby="callPreviewHeading" data-test="call-api-preview">
      <h3 id="callPreviewHeading" class="section-title">What the first call sends</h3>
      @if (preview(); as p) {
        <p class="field-note text-[color:var(--text-muted)]">
          From the {{ rows()?.length }} sample row{{ rows()?.length === 1 ? '' : 's' }}: {{ p.calls }} call{{ p.calls === 1 ? '' : 's' }}.
          The run's own values ({{ '{{' }}run{{ '}}' }}, {{ '{{' }}call_key{{ '}}' }}, {{ '{{' }}file_key{{ '}}' }}) are filled when it runs.
        </p>
        @for (v of p.variables; track v.name) {
          <div class="min-w-0">
            <p class="label">{{ v.name }}@if (v.json) { <span class="pill pill-neutral ml-1">JSON</span> }</p>
            <pre class="mono text-xs whitespace-pre-wrap break-words max-h-64 overflow-auto card p-2" [attr.data-variable]="v.name">{{ v.text }}</pre>
          </div>
        } @empty {
          <p class="field-note">No request variables yet: add one holding {{ '{{' }}row{{ '}}' }} or {{ '{{' }}rows_json{{ '}}' }}.</p>
        }
      } @else {
        <p class="field-note text-[color:var(--text-muted)]">Put sample rows first (Test with sample) to see what a call sends.</p>
      }
    </section>
  `,
})
export class CallApiPreview {
  readonly config = input<Record<string, unknown> | null | undefined>(null);
  readonly rows = input<Row[] | null | undefined>(null);
  readonly preview = computed(() => callApiPreview(this.config(), this.rows()));
}
