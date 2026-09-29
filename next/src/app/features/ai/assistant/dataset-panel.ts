import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { DataText } from '../../../shared/ui/data-text';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { AssistantApi } from './assistant.api';

export interface DatasetPanelData { datasetRef: string; tool: string; }

const PAGE = 50;

/**
 * A dataset the assistant kept (a tool that returns a dataset reference, not rows): the rows the
 * model only saw a sample of, a page at a time (GET tools/dataset). Values are a customer's data,
 * so each cell is drawn through app-data-text and a long one never widens the table.
 */
@Component({
  selector: 'app-dataset-panel',
  imports: [SidePanel, DataText, Icon],
  template: `
    <app-side-panel [heading]="'Dataset ' + data.datasetRef" [subtitle]="data.tool ? 'Kept by ' + data.tool : ''">
      @if (loading()) {
        <p class="text-sm text-[color:var(--text-muted)]">Loading rows…</p>
      } @else if (error()) {
        <p class="text-sm text-crit-500">{{ error() }}</p>
      } @else if (!rows().length) {
        <p class="text-sm text-[color:var(--text-muted)]">No rows.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="table-modern text-xs">
            <thead><tr>@for (column of columns(); track column) { <th>{{ column }}</th> }</tr></thead>
            <tbody>
              @for (row of rows(); track $index) {
                <tr>@for (column of columns(); track column) { <td class="max-w-56"><app-data-text [value]="text(row[column])" [label]="column" /></td> }</tr>
              }
            </tbody>
          </table>
        </div>
      }
      <div foot class="flex items-center gap-2 w-full">
        <span class="text-xs text-[color:var(--text-muted)] mr-auto">Rows {{ offset() + 1 }}–{{ offset() + rows().length }} of {{ kept() }}</span>
        <button type="button" class="btn btn-default btn-sm" [disabled]="loading() || offset() === 0" (click)="page(-1)">
          <app-icon name="minus" />Previous
        </button>
        <button type="button" class="btn btn-default btn-sm" [disabled]="loading() || offset() + rows().length >= kept()" (click)="page(1)">
          <app-icon name="plus" />Next
        </button>
      </div>
    </app-side-panel>
  `,
})
export class DatasetPanel implements OnInit {
  readonly data = inject<DatasetPanelData>(DIALOG_DATA);
  private readonly api = inject(AssistantApi);

  readonly rows = signal<Record<string, unknown>[]>([]);
  readonly kept = signal(0);
  readonly offset = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly columns = computed(() => {
    const seen = new Set<string>();
    for (const row of this.rows()) for (const key of Object.keys(row ?? {})) seen.add(key);
    return [...seen];
  });

  ngOnInit(): void { this.load(0); }

  page(direction: 1 | -1): void { this.load(Math.max(0, this.offset() + direction * PAGE)); }

  text(value: unknown): string {
    if (value == null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  private load(offset: number): void {
    this.loading.set(true);
    this.error.set('');
    this.api.dataset(this.data.datasetRef, offset, PAGE).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The dataset could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.kept.set(r.data.rowsKept ?? 0);
        this.offset.set(r.data.offset ?? offset);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The dataset could not be read.'); },
    });
  }
}
