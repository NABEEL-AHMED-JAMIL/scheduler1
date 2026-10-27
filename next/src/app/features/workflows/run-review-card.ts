import { Component, DestroyRef, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { StorageService } from '../objects/storage.service';
import { DRAFT_TITLE } from './request-data';

/** One output a run recorded (sourceJob.json/runOutputs), as far as this card reads it. */
interface RunOutputRow {
  stepKey?: string; task?: string; kind?: string; format?: string | null; name?: string; rowCount?: number | null;
  runDatasetId?: number | null; bucket?: string | null; key?: string | null; expired?: boolean;
}

/** The fields a reviewer looks at first, in this order, when the run's result has them (any pipeline, any domain). */
const FIRST = ['finding', 'prediction', 'predicted_label', 'label', 'result', 'true_label', 'expected_finding', 'match', 'correct',
  'urgency', 'triage', 'confidence', 'score', 'image_quality', 'size_band', 'status'];
/** A value that names an image file in a bucket. */
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
/** How many rows a "result" may have and still be shown here (a review is of one item, or a handful). */
const MAX_ROWS = 20;

/** "predicted_label" -> "Predicted label". */
export function fieldLabel(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The run's image to show: the row's image key (not the inbox arrival copy), else any field naming an image file. */
export function imageKeyOf(row: Record<string, unknown>): string | null {
  const named = row['image_key'];
  if (typeof named === 'string' && IMAGE.test(named)) return named;
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && IMAGE.test(v) && !/mask/i.test(k) && k !== 'key') return v;
  }
  const arrival = row['key'];
  return typeof arrival === 'string' && IMAGE.test(arrival) ? arrival : null;
}

/** The fields to show first, then the rest; long text (a description) is said apart. */
export function reviewFields(row: Record<string, unknown>): { first: { label: string; value: string }[]; rest: { label: string; value: string }[]; text: { label: string; value: string } | null } {
  const shown = (v: unknown) => v === null || v === undefined || v === '' ? '' : String(v);
  const first = FIRST.filter(k => shown(row[k]) !== '').map(k => ({ label: fieldLabel(k), value: shown(row[k]) }));
  const longKey = ['description', 'summary', 'note', 'notes', 'explanation'].find(k => shown(row[k]).length > 0) ?? null;
  const rest = Object.keys(row).filter(k => !FIRST.includes(k) && k !== longKey && shown(row[k]) !== '')
    .map(k => ({ label: fieldLabel(k), value: shown(row[k]) }));
  return { first, rest, text: longKey ? { label: fieldLabel(longKey), value: shown(row[longKey]) } : null };
}

/**
 * Owner 2026-10-20: a run's review task shows what is being reviewed -- the run's kept result (its image, the model's DRAFT
 * answer, the truth where the data has it, the measurements) and its PDF -- beside Approve and Reject, so the reviewer does
 * not have to open the run first. Generic: it reads the run's own outputs (the small dataset a pipeline saves for its
 * review, and a bucket image a field names), never anything pipeline-specific.
 */
@Component({
  selector: 'app-run-review-card',
  imports: [Icon, RouterLink],
  styles: `
    .rrc { display: grid; grid-template-columns: minmax(0, 13rem) minmax(0, 1fr); gap: 1rem; align-items: start; }
    @media (max-width: 60rem) { .rrc { grid-template-columns: minmax(0, 1fr); } }
    .rrc-img { border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-inset); min-height: 9rem;
               display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .rrc-img img { display: block; width: 100%; height: auto; max-height: 16rem; object-fit: contain; }
    .rrc-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: 0.5rem 1rem; margin: 0; }
    .rrc-facts dt { font-size: 0.6875rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
    .rrc-facts dd { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
    .rrc-text { font-size: 0.875rem; color: var(--text-secondary); margin: 0; }
    .rrc-more { font-size: 0.8125rem; }
    .rrc-more summary { cursor: pointer; color: var(--text-secondary); }
  `,
  template: `
    @if (loading()) {
      <p class="text-sm text-[color:var(--text-muted)]" data-test="run-review-loading">Reading what the run made…</p>
    } @else if (row(); as r) {
      <section aria-labelledby="run-review-title" data-test="run-review-card">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <h3 class="section-title m-0" id="run-review-title">What to review</h3>
          @if (isDraft()) { <span class="pill pill-warn" [title]="draftTitle">DRAFT</span> }
          @if (rows().length > 1) { <span class="text-xs text-[color:var(--text-muted)]">row 1 of {{ rows().length }}</span> }
          <span class="flex-1"></span>
          @if (pdf(); as p) {
            <button type="button" class="btn btn-default btn-sm" (click)="openPdf(p)" [disabled]="opening()" data-test="run-review-pdf"><app-icon name="file" />{{ p.name || 'Report PDF' }}</button>
          }
          @if (link()) { <a class="btn btn-default btn-sm" [routerLink]="link()!"><app-icon name="external" />Open the run</a> }
        </div>
        <div class="rrc" [class.rrc-noimg]="!imageKey()">
          @if (imageKey()) {
            <div class="rrc-img" data-test="run-review-image">
              @if (imageUrl(); as src) { <img [src]="src" [alt]="'The image this run reviewed: ' + imageKey()" /> }
              @else if (imageError()) { <span class="text-xs text-[color:var(--text-muted)] p-3 text-center">{{ imageError() }}</span> }
              @else { <span class="text-xs text-[color:var(--text-muted)]">Loading the image…</span> }
            </div>
          }
          <div class="flex flex-col gap-3 min-w-0">
            @if (fields().first.length) {
              <dl class="rrc-facts" data-test="run-review-facts">
                @for (f of fields().first; track f.label) { <div><dt>{{ f.label }}</dt><dd>{{ f.value }}</dd></div> }
              </dl>
            }
            @if (fields().text; as t) { <p class="rrc-text"><b class="font-medium">{{ t.label }}:</b> {{ t.value }}</p> }
            @if (fields().rest.length) {
              <details class="rrc-more" data-test="run-review-more">
                <summary>All {{ fields().rest.length + fields().first.length }} fields</summary>
                <dl class="rrc-facts mt-2">
                  @for (f of fields().rest; track f.label) { <div><dt>{{ f.label }}</dt><dd class="text-xs mono">{{ f.value }}</dd></div> }
                </dl>
              </details>
            }
          </div>
        </div>
      </section>
    } @else if (pdf(); as p) {
      <section aria-label="What to review" data-test="run-review-card">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="section-title m-0">What to review</h3><span class="flex-1"></span>
          <button type="button" class="btn btn-default btn-sm" (click)="openPdf(p)" [disabled]="opening()"><app-icon name="file" />{{ p.name || 'Report PDF' }}</button>
        </div>
      </section>
    }
  `,
})
export class RunReviewCard implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);
  private readonly destroyRef = inject(DestroyRef);
  readonly jobQueueId = input.required<number>();
  readonly attempt = input<number>(1);
  /** The run page, for "Open the run". */
  readonly link = input<string | null>(null);
  readonly draftTitle = DRAFT_TITLE;

  readonly loading = signal(true);
  readonly outputs = signal<RunOutputRow[]>([]);
  readonly rows = signal<Record<string, unknown>[]>([]);
  readonly row = computed(() => this.rows()[0] ?? null);
  readonly fields = computed(() => reviewFields(this.row() ?? {}));
  readonly isDraft = computed(() => {
    const r = this.row();
    return !!r && Object.values(r).some(v => typeof v === 'string' && v.trim().toUpperCase() === 'DRAFT');
  });
  readonly imageKey = computed(() => (this.row() ? imageKeyOf(this.row()!) : null));
  /** The run's bucket: the one its bucket outputs went to (the image a field names lives beside them). */
  readonly bucket = computed(() => this.outputs().find(o => o.kind === 'bucket' && o.bucket)?.bucket ?? null);
  readonly pdf = computed(() => this.outputs().find(o => (o.format ?? '').toLowerCase() === 'pdf' && o.runDatasetId && !o.expired) ?? null);
  readonly imageUrl = signal<string | null>(null);
  readonly imageError = signal('');
  readonly opening = signal(false);
  private released = false;

  constructor() {
    this.destroyRef.onDestroy(() => { this.released = true; this.drop(); });
    effect(() => {
      const id = this.jobQueueId();
      const attempt = this.attempt();
      untracked(() => this.load(id, attempt));
    });
    effect(() => {
      const key = this.imageKey();
      const bucket = this.bucket();
      untracked(() => this.loadImage(bucket, key));
    });
  }

  ngOnDestroy(): void { this.drop(); }

  private drop(): void { const u = this.imageUrl(); if (u) URL.revokeObjectURL(u); this.imageUrl.set(null); }

  private load(jobQueueId: number, attempt: number): void {
    this.loading.set(true);
    this.rows.set([]);
    this.http.get<ApiResponse<{ outputs?: RunOutputRow[] }>>(`${API_BASE}/sourceJob.json/runOutputs`,
      { params: { jobQueueId: String(jobQueueId), attempt: String(attempt) } }).subscribe({
      next: r => {
        const outs = r.status === API_SUCCESS ? r.data?.outputs ?? [] : [];
        this.outputs.set(outs);
        const result = outs.find(o => o.runDatasetId && !o.expired && ['csv', 'json', 'jsonl'].includes((o.format ?? '').toLowerCase())
          && (o.rowCount ?? 0) > 0 && (o.rowCount ?? 0) <= MAX_ROWS);
        if (!result) { this.loading.set(false); return; }
        this.http.get<Record<string, unknown>[]>(`${API_BASE}/sourceJob.json/runDataset`,
          { params: { runDatasetId: String(result.runDatasetId), format: 'json' } }).subscribe({
          next: rows => { this.rows.set(Array.isArray(rows) ? rows.slice(0, MAX_ROWS) : []); this.loading.set(false); },
          error: () => this.loading.set(false),
        });
      },
      error: () => { this.outputs.set([]); this.loading.set(false); },
    });
  }

  private loadImage(bucket: string | null, key: string | null): void {
    this.drop();
    this.imageError.set('');
    if (!bucket || !key) return;
    this.storage.download(bucket, key).subscribe({
      next: blob => {
        if (this.released) return;
        if (!blob.type.startsWith('image/') && !IMAGE.test(key)) { this.imageError.set('Not an image.'); return; }
        this.imageUrl.set(URL.createObjectURL(blob));
      },
      error: () => this.imageError.set('The image could not be read (it may have been removed, or you may not see that bucket).'),
    });
  }

  /** The run's PDF in a new tab, through the same authorised read as Runs › its outputs. */
  openPdf(p: RunOutputRow): void {
    if (!p.runDatasetId) return;
    this.opening.set(true);
    this.http.get(`${API_BASE}/sourceJob.json/runDataset`, { params: { runDatasetId: String(p.runDatasetId), format: 'pdf' }, responseType: 'blob' })
      .subscribe({
        next: blob => {
          this.opening.set(false);
          const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: () => this.opening.set(false),
      });
  }
}
