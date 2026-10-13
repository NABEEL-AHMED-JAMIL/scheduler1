import { Component, computed, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Icon } from '../../../shared/ui/icon';
import { ExplorerFilter, FacetCount, RUN_WINDOWS, RunFacets, RunWindow, toggled } from './run-explorer';

/** The pipelines shown before "Show all": a workspace's busiest few. */
const PIPELINES_SHOWN = 8;

/**
 * UX review 2026-10-12 (B3): the Runs explorer's facets, on the left -- When, Status, Pipeline, Started by -- each a
 * list of choices with the server's count beside it (references: the log and trace explorers' facet rail). A choice
 * already picked keeps its row when its count drops to 0, so it can be taken back. Says what it was asked; the page
 * reads the runs again.
 */
@Component({
  selector: 'app-run-facets-rail',
  imports: [Icon, DecimalPipe],
  host: { class: 'run-facets', role: 'group', 'aria-label': 'Narrow the runs' },
  styles: `
    :host { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
    .facet-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
    .facet-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
    .facet-clear { margin-left: auto; font-size: 11px; color: var(--accent-text); background: none; border: 0; padding: 0; cursor: pointer; }
    .facet-row { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.25rem 0.375rem; border-radius: var(--radius-sm);
      font-size: 13px; line-height: 1.25rem; color: var(--text-secondary); cursor: pointer; min-width: 0; }
    .facet-row:hover { background: var(--surface-inset); }
    .facet-row.is-on { color: var(--text-primary); font-weight: 500; }
    .facet-row.is-empty { color: var(--text-muted); }
    .facet-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .facet-count { flex: none; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--text-muted); }
    .facet-more { font-size: 12px; color: var(--accent-text); background: none; border: 0; padding: 0.25rem 0.375rem; cursor: pointer; }
  `,
  template: `
    <section aria-labelledby="facet-when">
      <div class="facet-head"><span class="facet-title" id="facet-when">When</span></div>
      @for (w of windows; track w.id) {
        <label class="facet-row" [class.is-on]="filter().window === w.id">
          <input type="radio" class="checkbox" name="run-window" [checked]="filter().window === w.id" (change)="setWindow(w.id)" />
          <span class="facet-label">{{ w.label }}</span>
          @if (filter().window === w.id && facets(); as f) { <span class="facet-count">{{ f.total | number }}</span> }
        </label>
      }
    </section>

    <section aria-labelledby="facet-status">
      <div class="facet-head">
        <span class="facet-title" id="facet-status">Status</span>
        @if (filter().statuses.length) { <button type="button" class="facet-clear" (click)="clear('statuses')">Clear</button> }
      </div>
      @for (s of statusRows(); track s.key) {
        <label class="facet-row" [class.is-on]="filter().statuses.includes(s.key)" [class.is-empty]="!s.count" [attr.data-facet-status]="s.key">
          <input type="checkbox" class="checkbox" [checked]="filter().statuses.includes(s.key)" (change)="toggle('statuses', s.key)" />
          <span class="facet-label">{{ statusWord(s.key) }}</span>
          <span class="facet-count">{{ s.count | number }}</span>
        </label>
      } @empty { <p class="text-xs text-[color:var(--text-muted)] px-1.5">{{ emptyWord() }}</p> }
    </section>

    <section aria-labelledby="facet-pipeline">
      <div class="facet-head">
        <span class="facet-title" id="facet-pipeline">Pipeline</span>
        @if (filter().pipelines.length) { <button type="button" class="facet-clear" (click)="clear('pipelines')">Clear</button> }
      </div>
      @for (p of pipelineRows(); track p.taskDetailId) {
        <label class="facet-row" [class.is-on]="filter().pipelines.includes(p.taskDetailId)" [class.is-empty]="!p.count" [title]="p.taskName"
               [attr.data-facet-pipeline]="p.taskDetailId">
          <input type="checkbox" class="checkbox" [checked]="filter().pipelines.includes(p.taskDetailId)" (change)="toggle('pipelines', p.taskDetailId)" />
          <span class="facet-label">{{ p.taskName }}</span>
          <span class="facet-count">{{ p.count | number }}</span>
        </label>
      } @empty { <p class="text-xs text-[color:var(--text-muted)] px-1.5">{{ emptyWord() }}</p> }
      @if (hiddenPipelines() > 0) {
        <button type="button" class="facet-more" (click)="allPipelines.set(true)">Show all {{ (facets()?.pipelines?.length ?? 0) }}</button>
      }
    </section>

    <section aria-labelledby="facet-trigger">
      <div class="facet-head">
        <span class="facet-title" id="facet-trigger">Started by</span>
        @if (filter().triggers.length) { <button type="button" class="facet-clear" (click)="clear('triggers')">Clear</button> }
      </div>
      @for (t of triggerRows(); track t.key) {
        <label class="facet-row" [class.is-on]="filter().triggers.includes(t.key)" [class.is-empty]="!t.count" [attr.data-facet-trigger]="t.key">
          <input type="checkbox" class="checkbox" [checked]="filter().triggers.includes(t.key)" (change)="toggle('triggers', t.key)" />
          <span class="facet-label">{{ t.label || t.key }}</span>
          <span class="facet-count">{{ t.count | number }}</span>
        </label>
      } @empty { <p class="text-xs text-[color:var(--text-muted)] px-1.5">{{ emptyWord() }}</p> }
    </section>

    @if (unavailable()) {
      <p class="text-xs text-[color:var(--text-muted)] flex gap-1.5"><app-icon name="info" size="0.9em" class="shrink-0 mt-0.5" />
        The counts could not be read; the list below still narrows.</p>
    }
  `,
})
export class RunFacetsRail {
  readonly facets = input<RunFacets | null>(null);
  readonly filter = input.required<ExplorerFilter>();
  /** The counts could not be read (an older Core, a refusal). */
  readonly unavailable = input(false);
  readonly loading = input(false);
  readonly filterChange = output<ExplorerFilter>();

  readonly windows = RUN_WINDOWS;
  readonly allPipelines = signal(false);

  readonly emptyWord = computed(() => (this.loading() ? 'Counting…' : 'None in this window'));

  /** The server's rows, plus any picked value it no longer counts (shown with 0, so it can be taken back). */
  private keep<T>(rows: T[], picked: (string | number)[], id: (row: T) => string | number, make: (value: string | number) => T): T[] {
    const have = new Set(rows.map(id));
    return [...rows, ...picked.filter(v => !have.has(v)).map(make)];
  }

  readonly statusRows = computed<FacetCount[]>(() =>
    this.keep(this.facets()?.statuses ?? [], this.filter().statuses, r => r.key, v => ({ key: String(v), count: 0 })));

  readonly pipelineRows = computed(() => {
    const rows = this.keep(this.facets()?.pipelines ?? [], this.filter().pipelines, r => r.taskDetailId,
      v => ({ taskDetailId: Number(v), taskName: `Pipeline #${v}`, count: 0 }));
    if (this.allPipelines()) return rows;
    const picked = new Set(this.filter().pipelines);
    return rows.filter((r, i) => i < PIPELINES_SHOWN || picked.has(r.taskDetailId));
  });

  readonly hiddenPipelines = computed(() => (this.allPipelines() ? 0 : Math.max(0, (this.facets()?.pipelines?.length ?? 0) - PIPELINES_SHOWN)));

  readonly triggerRows = computed<FacetCount[]>(() =>
    this.keep(this.facets()?.triggers ?? [], this.filter().triggers, r => r.key, v => ({ key: String(v), label: String(v), count: 0 })));

  /** The run statuses as people say them. */
  statusWord(status: string): string {
    return ({ Queue: 'Queued', Start: 'Starting', Skip: 'Skipped', Interrupt: 'Interrupted' } as Record<string, string>)[status] ?? status;
  }

  setWindow(window: RunWindow): void {
    this.filterChange.emit({ ...this.filter(), window });
  }

  toggle(facet: 'statuses' | 'pipelines' | 'triggers', value: string | number): void {
    const f = this.filter();
    this.filterChange.emit({ ...f, [facet]: toggled<string | number>(f[facet] as (string | number)[], value) } as ExplorerFilter);
  }

  clear(facet: 'statuses' | 'pipelines' | 'triggers'): void {
    this.filterChange.emit({ ...this.filter(), [facet]: [] });
  }
}
