import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { API_SUCCESS } from '../../../core/api/api.config';
import { StepsApi } from './steps.service';
import { StepPreviewResult } from './steps.model';
import { keysOf } from './build-json.model';

type Row = Record<string, unknown>;
/** Core's preview takes at most 50 rows (StepPreview.MAX_ROWS). */
export const PREVIEW_ROWS = 50;
/** The documents shown; the rest are counted. */
export const PREVIEW_DOCUMENTS = 3;

/** The documents a preview's rows hold: the column's (output column or file) or the rows themselves (output rows). */
export function previewDocuments(result: StepPreviewResult | null, config: Record<string, unknown>): unknown[] {
  if (!result) return [];
  const output = String(config['output'] ?? 'column');
  if (output === 'rows') return result.rows;
  const column = typeof config['column'] === 'string' && config['column'] ? config['column'] as string : 'json';
  return result.rows.map(r => r[column]);
}

/** Sample rows as typed: a JSON list of objects, at most 50; a message when they are not. */
export function parseSampleRows(text: string): { rows: Row[] } | { error: string } {
  if (!text.trim()) return { rows: [] };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.some(r => typeof r !== 'object' || r === null || Array.isArray(r))) {
      return { error: 'The sample rows are a JSON list of objects: [{ "patient_id": "P-101", … }, …].' };
    }
    if (parsed.length > PREVIEW_ROWS) return { error: `A preview takes at most ${PREVIEW_ROWS} rows; there are ${parsed.length}.` };
    return { rows: parsed as Row[] };
  } catch (e) {
    return { error: `Not JSON: ${(e as Error).message}` };
  }
}

/**
 * MIG-451: Build JSON's live preview -- the step run by Core on sample rows as the shape is edited (Core's sandboxed step
 * preview: nothing kept, a person's details masked), its first documents formatted, how many it made, and what Core says
 * (a key with no value, a value not of its type, a document too big). The sample rows start as the pipeline's and can be
 * edited here for the preview alone.
 */
@Component({
  selector: 'app-build-json-preview',
  template: `
    <section class="flex flex-col gap-2 min-w-0" aria-labelledby="bjPreviewHeading" data-test="build-json-preview">
      <div class="flex items-center gap-2">
        <h3 id="bjPreviewHeading" class="section-title">Preview</h3>
        <span class="field-note text-[color:var(--text-muted)]" aria-live="polite" data-test="bj-preview-status">{{ status() }}</span>
        <button type="button" class="btn btn-default btn-sm ml-auto" data-test="bj-sample-toggle" (click)="sampleOpen.set(!sampleOpen())">
          {{ sampleOpen() ? 'Hide the sample rows' : 'Sample rows (' + rowCount() + ')' }}
        </button>
      </div>
      @if (sampleOpen()) {
        <textarea class="input mono text-xs resize-y min-h-32" spellcheck="false" aria-label="Sample rows for the preview"
                  data-test="bj-sample" [value]="sampleText()" (input)="sampleText.set($any($event.target).value)"></textarea>
        <p class="field-note">For the preview only: the pipeline's sample rows are not changed. At most {{ maxRows }} rows.</p>
      }
      @if (sampleError(); as e) {
        <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">{{ e }}</p>
      } @else if (!rowCount()) {
        <p class="field-note">No sample rows yet: put some under Sample rows (or Test with sample) to see the documents.</p>
      } @else if (error(); as e) {
        <p class="text-sm text-[color:var(--color-crit-500)]" role="alert" data-test="bj-preview-error">{{ e }}</p>
      } @else if (result(); as r) {
        @for (w of r.warnings; track $index) { <p class="step-notice step-notice-warn text-sm" data-test="bj-preview-warning">{{ w }}</p> }
        @if (r.masked.length) {
          <p class="field-note">A person's details are masked here: {{ r.masked.join(', ') }}.</p>
        }
        @if (r.note) { <p class="field-note">{{ r.note }}</p> }
        @for (d of shown(); track $index) {
          <pre class="mono text-xs whitespace-pre-wrap break-words max-h-80 overflow-auto card p-2" data-test="bj-document">{{ d }}</pre>
        }
        @if (r.rowCount > shown().length) {
          <p class="field-note">And {{ r.rowCount - shown().length }} more document{{ r.rowCount - shown().length === 1 ? '' : 's' }}.</p>
        }
      }
    </section>
  `,
})
export class BuildJsonPreview {
  private readonly api = inject(StepsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly config = input<Record<string, unknown>>({});
  /** The pipeline's sample rows: where the preview's rows start. */
  readonly rows = input<Row[] | null>(null);

  readonly maxRows = PREVIEW_ROWS;
  readonly sampleOpen = signal(false);
  readonly sampleText = signal('');
  readonly result = signal<StepPreviewResult | null>(null);
  readonly error = signal('');
  readonly running = signal(false);

  private readonly parsed = computed(() => parseSampleRows(this.sampleText()));
  readonly sampleError = computed(() => { const p = this.parsed(); return 'error' in p ? p.error : ''; });
  readonly sample = computed(() => { const p = this.parsed(); return 'rows' in p ? p.rows : []; });
  readonly rowCount = computed(() => this.sample().length);
  readonly shown = computed(() => previewDocuments(this.result(), this.config()).slice(0, PREVIEW_DOCUMENTS)
    .map(d => JSON.stringify(d, null, 2)));
  readonly status = computed(() => {
    if (this.running()) return 'Running on the sample rows…';
    const r = this.result();
    if (!r || this.error()) return '';
    return `${r.rowCount} document${r.rowCount === 1 ? '' : 's'} from ${r.rowsIn} sample row${r.rowsIn === 1 ? '' : 's'}`;
  });

  private request?: Subscription;
  private seeded = false;

  constructor() {
    // The pipeline's sample rows, once: after that the preview's own rows are the person's to edit.
    effect(() => {
      const rows = this.rows();
      if (this.seeded || !rows?.length) return;
      this.seeded = true;
      untracked(() => this.sampleText.set(JSON.stringify(rows.slice(0, PREVIEW_ROWS), null, 2)));
    });
    // Run again half a second after the shape or the rows last changed.
    effect(() => {
      const config = this.config();
      const rows = this.sample();
      const usable = !this.sampleError() && rows.length && keysOf(config).some(k => k.key);
      untracked(() => this.schedule(usable ? config : null, rows));
    });
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
  }

  private schedule(config: Record<string, unknown> | null, rows: Row[]): void {
    this.request?.unsubscribe();
    if (!config) { this.running.set(false); this.result.set(null); this.error.set(''); return; }
    this.running.set(true);
    this.request = timer(500).pipe(switchMap(() => this.api.preview('build_json', config, rows))).subscribe({
      next: answer => {
        this.running.set(false);
        if (answer.status === API_SUCCESS && answer.data) {
          this.error.set('');
          this.result.set(answer.data);
        } else {
          this.result.set(null);
          this.error.set(answer.message || 'The preview could not run.');
        }
      },
      error: () => {
        this.running.set(false);
        this.result.set(null);
        this.error.set('The preview could not be reached; the shape is kept as it is.');
      },
    });
  }
}
