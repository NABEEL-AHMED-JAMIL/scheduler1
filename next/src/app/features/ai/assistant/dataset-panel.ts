import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { DataText } from '../../../shared/ui/data-text';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { AssistantApi } from './assistant.api';
import { AppLoading, createLoadState } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';

export interface DatasetPanelData { datasetRef: string; tool: string; }

const PAGE = 50;

/**
 * A dataset the assistant kept (a tool that returns a dataset reference, not rows): the rows the
 * model only saw a sample of, a page at a time (GET tools/dataset). Values are a customer's data,
 * so each cell is drawn through app-data-text and a long one never widens the table.
 */
@Component({
  selector: 'app-dataset-panel',
  imports: [SidePanel, DataText, Icon, AppLoading, LoadError, BlurLoader, SortHeader],
  template: `
    <app-side-panel [heading]="'Dataset ' + data.datasetRef" [subtitle]="data.tool ? 'Kept by ' + data.tool : ''">
      <!-- Owner 2026-10-27: rows-shaped loading on the first read; Previous / Next keep the page under a blur. -->
      @if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (state.pending()) {
        <app-loading shape="rows" label="Loading rows…" [count]="6" />
      } @else if (!rows().length) {
        <p class="text-sm text-[color:var(--text-muted)]">No row in this dataset.</p>
      } @else {
        <app-blur-loader [active]="loading()" label="Loading rows…">
        <div class="overflow-x-auto">
          <table class="table-modern text-xs">
            <thead><tr>@for (column of columns(); track column) { <th [appSort]="column" [sortBy]="sort">{{ column }}</th> }</tr></thead>
            <tbody>
              @for (row of rows(); track $index) {
                <tr>@for (column of columns(); track column) { <td class="max-w-56"><app-data-text [value]="text(row[column])" [label]="column" /></td> }</tr>
              }
            </tbody>
          </table>
        </div>
        </app-blur-loader>
      }
      <div foot class="flex items-center gap-2 w-full">
        <span class="text-xs text-[color:var(--text-muted)] mr-auto">@if (state.loaded() && rows().length) { Rows {{ offset() + 1 }}–{{ offset() + rows().length }} of {{ kept() }} }</span>
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
  readonly state = createLoadState();
  readonly loading = this.state.loading;
  readonly error = this.state.error;
  readonly columns = computed(() => {
    const seen = new Set<string>();
    for (const row of this.rows()) for (const key of Object.keys(row ?? {})) seen.add(key);
    return [...seen];
  });

  /**
   * Owner 2026-10-27 ("add a sort on each table"): the panel pages through the whole kept dataset, so a column sorts on the
   * server (tools/dataset sort/dir, any column the dataset has) and a new order goes back to its first rows; Previous and
   * Next then walk that order. No order picked: the kept order, as before, and no sort is sent. Not remembered: each
   * dataset has columns of its own.
   */
  readonly sort = createTableSort<Record<string, unknown>>({
    id: 'ai-dataset-panel',
    server: true,
    remember: false,
    columns: {},
    dynamic: key => ({ value: row => row[key], kind: 'auto' }),
    onChange: () => this.load(0),
  });

  ngOnInit(): void { this.load(0); }

  page(direction: 1 | -1): void { this.load(Math.max(0, this.offset() + direction * PAGE)); }

  text(value: unknown): string {
    if (value == null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  /** Reads a page; a reply for a page asked before the latest one is dropped (a quick Next, Next). */
  load(offset = this.offset()): void {
    const asked = ++this.seq;
    this.state.start();
    this.api.dataset(this.data.datasetRef, offset, PAGE, this.sort.param()).subscribe({
      next: r => {
        if (asked !== this.seq) return;
        if (r.status !== API_SUCCESS || !r.data) { this.state.fail(r, 'The dataset could not be read.'); return; }
        this.rows.set(r.data.rows ?? []);
        this.kept.set(r.data.rowsKept ?? 0);
        this.offset.set(r.data.offset ?? offset);
        this.state.done();
      },
      error: err => { if (asked === this.seq) this.state.fail(err, 'The dataset could not be read.'); },
    });
  }
  private seq = 0;
}
