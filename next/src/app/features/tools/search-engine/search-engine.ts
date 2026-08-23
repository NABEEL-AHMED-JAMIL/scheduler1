import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { copyText } from '../../../shared/ui/clipboard.util';
import { createPager } from '../../../shared/ui/pager';
import { Pagination } from '../../../shared/ui/pagination';

interface QueryResult {
  query?: string;
  column?: string[];
  data?: Record<string, unknown>[];
}

/** Anything that is not a plain read; the server refuses these too, this just says so sooner. */
const WRITE_KEYWORDS =
  /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|commit|rollback)\b/i;

@Component({
  selector: 'app-search-engine',
  imports: [Icon, Pagination],
  templateUrl: './search-engine.html',
})
export class SearchEngine {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly query = signal('');
  readonly running = signal(false);
  readonly result = signal<QueryResult | null>(null);
  readonly filter = signal('');
  readonly pager = createPager<Record<string, unknown>>();

  readonly columns = computed(() => this.result()?.column ?? []);

  readonly rows = computed(() => {
    const term = this.filter().trim().toLowerCase();
    const rows = this.result()?.data ?? [];
    if (!term) return rows;
    return rows.filter(row =>
      Object.values(row).some(value => String(value ?? '').toLowerCase().includes(term)));
  });

  readonly paged = computed(() => this.pager.slice(this.rows()));

  /**
   * Caught before the request rather than after: a rejected write still costs a round trip,
   * and the message coming back from the driver is far less clear than saying it here.
   */
  readonly warning = computed(() => {
    const text = this.query().trim();
    if (!text) return '';
    if (WRITE_KEYWORDS.test(text)) return 'Only SELECT statements run here — this one would change data.';
    if (!/^\s*(select|with)\b/i.test(text)) return 'A query has to start with SELECT (or WITH).';
    return '';
  });

  readonly canRun = computed(() => !!this.query().trim() && !this.warning() && !this.running());

  run(): void {
    if (!this.canRun()) return;
    this.running.set(true);
    this.http.post<ApiResponse<QueryResult>>(
      `${API_BASE}/setting.json/dynamicQueryResponse`, { query: this.query().trim() }).subscribe({
      next: response => {
        this.running.set(false);
        if (response.status === API_SUCCESS) {
          this.result.set(response.data ?? null);
          this.filter.set('');
          this.pager.reset();
          const count = response.data?.data?.length ?? 0;
          this.toast.success(`${count} row${count === 1 ? '' : 's'} returned.`);
        } else {
          this.result.set(null);
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.running.set(false);
        this.result.set(null);
        this.toast.error(err?.error?.message || 'The query could not be run.');
      },
    });
  }

  clear(): void {
    this.query.set('');
    this.result.set(null);
    this.filter.set('');
    this.pager.reset();
  }

  cell(row: Record<string, unknown>, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  /** Long values get their own scroll box so one wide column cannot stretch the whole table. */
  isLong(row: Record<string, unknown>, key: string): boolean {
    return this.cell(row, key).length > 60;
  }

  async copyResult(): Promise<void> {
    const cols = this.columns();
    const lines = [cols.join('\t'), ...this.rows().map(row => cols.map(c => this.cell(row, c)).join('\t'))];
    if (await copyText(lines.join('\n'))) this.toast.success('Result copied as TSV.');
    else this.toast.error('Could not copy the result.');
  }

  goToPage(next: number): void { this.pager.goTo(next, this.rows().length); }
  setPageSize(size: number): void { this.pager.setSize(size); }
}
