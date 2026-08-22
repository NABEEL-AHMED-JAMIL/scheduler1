import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DashboardService, HourCell, JobBreakdown, NameValue } from './dashboard.service';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Status keys shown in the breakdown table, in lifecycle order. */
const BREAKDOWN_COLUMNS = [
  'queue', 'start', 'running', 'failed', 'completed', 'skip', 'interrupt', 'missed',
] as const;

type BreakdownKey = typeof BREAKDOWN_COLUMNS[number];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly startDate = signal(this.isoDaysAgo(6));
  readonly endDate = signal(this.isoDaysAgo(0));

  readonly jobStatus = signal<NameValue[]>([]);
  readonly jobRunning = signal<NameValue[]>([]);
  readonly weekly = signal<NameValue[]>([]);
  readonly hourly = signal<HourCell[]>([]);
  readonly breakdown = signal<JobBreakdown[]>([]);
  readonly unread = signal(0);

  readonly loading = signal(true);
  readonly breakdownLoading = signal(false);
  readonly selectedCell = signal<{ date: string; hr: number } | null>(null);
  readonly breakdownSearch = signal('');

  readonly columns = BREAKDOWN_COLUMNS;

  // ---- KPI tiles ----------------------------------------------------------
  // jobStatusStatistics carries an "All" bucket alongside the real statuses, so it is the
  // total rather than another category -- summing the array would count every job twice.
  readonly totalJobs = computed(() => {
    const all = this.jobStatus().find(d => (d.name ?? '').toLowerCase() === 'all');
    return all ? all.value : this.sum(this.statusCategories());
  });
  readonly activeJobs  = computed(() => this.valueOf(this.jobStatus(), 'active'));

  /** The real statuses, with the "All" total removed so it can't appear as a slice. */
  readonly statusCategories = computed(() =>
    this.jobStatus().filter(d => (d.name ?? '').toLowerCase() !== 'all'));
  readonly runningNow  = computed(() => this.valueOf(this.jobRunning(), 'running'));
  readonly completed   = computed(() => this.valueOf(this.jobRunning(), 'completed'));
  readonly failed      = computed(() => this.valueOf(this.jobRunning(), 'failed'));

  // ---- charts -------------------------------------------------------------
  /** Donut segments with a running offset, so the ring can be drawn with stroke-dasharray. */
  readonly statusRing = computed(() => this.toRing(this.statusCategories()));
  readonly runningRing = computed(() => this.toRing(this.jobRunning()));

  readonly weeklyBars = computed(() => {
    const max = Math.max(1, ...this.weekly().map(d => d.value));
    return this.weekly().map(d => ({ ...d, pct: (d.value / max) * 100 }));
  });

  /** Hour-by-weekday grid: 7 rows x 24 columns, only days that have data. */
  readonly heatmap = computed(() => {
    const cells = this.hourly();
    if (!cells.length) return { days: [] as string[], rows: [] as any[], max: 0 };
    const byDay = new Map<string, Map<number, HourCell>>();
    for (const cell of cells) {
      if (!byDay.has(cell.dayCode)) byDay.set(cell.dayCode, new Map());
      byDay.get(cell.dayCode)!.set(cell.hr, cell);
    }
    const days = DAY_ORDER.filter(d => byDay.has(d));
    const max = Math.max(1, ...cells.map(c => c.count));
    const rows = days.map(day => ({
      day,
      hours: Array.from({ length: 24 }, (_, hr) => {
        const cell = byDay.get(day)!.get(hr);
        return { hr, count: cell?.count ?? 0, date: cell?.date ?? '', intensity: cell ? cell.count / max : 0 };
      }),
    }));
    return { days, rows, max };
  });

  /**
   * The endpoint appends a TOTAL summary row to the same array as the jobs. It has no jobId,
   * so it is separated out and rendered as a footer rather than listed as if it were a job.
   */
  private readonly isSummaryRow = (row: JobBreakdown) =>
    !row.jobId || (row.jobName ?? '').trim().toUpperCase() === 'TOTAL';

  readonly breakdownTotal = computed(() => this.breakdown().find(this.isSummaryRow) ?? null);

  readonly filteredBreakdown = computed(() => {
    const rows = this.breakdown().filter(row => !this.isSummaryRow(row));
    const term = this.breakdownSearch().trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row =>
      String(row.jobId).includes(term) || (row.jobName ?? '').toLowerCase().includes(term));
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    const from = this.startDate();
    const to = this.endDate();

    this.dashboard.jobStatus(from, to).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.jobStatus.set(r.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.dashboard.jobRunning(from, to).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.jobRunning.set(r.data ?? []); },
    });
    this.dashboard.weekly(from, to).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.weekly.set(r.data ?? []); },
    });
    this.dashboard.hourly(from, to).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.hourly.set(r.data ?? []); },
    });
    this.http.get<ApiResponse<number>>(`${API_BASE}/notification.json/unreadCount`).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.unread.set(Number(r.data ?? 0)); },
      error: () => { /* the tile simply shows zero */ },
    });
  }

  /** Clicking an hour cell drills into which jobs ran in that exact hour. */
  selectCell(date: string, hr: number, count: number): void {
    if (!count || !date) return;
    this.selectedCell.set({ date, hr });
    this.breakdownLoading.set(true);
    this.breakdown.set([]);
    this.dashboard.breakdown(date, hr).subscribe({
      next: r => {
        this.breakdownLoading.set(false);
        if (r.status === API_SUCCESS) this.breakdown.set(r.data ?? []);
        else this.toast.error(r.message);
      },
      error: err => {
        this.breakdownLoading.set(false);
        this.toast.error(err?.error?.message || 'Could not load that hour.');
      },
    });
  }

  clearCell(): void {
    this.selectedCell.set(null);
    this.breakdown.set([]);
    this.breakdownSearch.set('');
  }

  countFor(row: JobBreakdown, key: BreakdownKey): number {
    return (row[key] as number) ?? 0;
  }

  /** Proportional bar of a job's outcomes, so a row reads at a glance. */
  segmentsFor(row: JobBreakdown): { key: string; pct: number; count: number }[] {
    const total = row.total || 0;
    if (!total) return [];
    return BREAKDOWN_COLUMNS
      .map(key => ({ key, count: this.countFor(row, key) }))
      .filter(s => s.count > 0)
      .map(s => ({ ...s, pct: (s.count / total) * 100 }));
  }

  applyRange(): void { this.load(); this.clearCell(); }

  resetRange(): void {
    this.startDate.set(this.isoDaysAgo(6));
    this.endDate.set(this.isoDaysAgo(0));
    this.applyRange();
  }

  hourLabel(hr: number): string {
    if (hr === 0) return '12a';
    if (hr === 12) return '12p';
    return hr < 12 ? `${hr}a` : `${hr - 12}p`;
  }

  private toRing(data: NameValue[]): { name: string; value: number; pct: number; offset: number }[] {
    const total = this.sum(data);
    if (!total) return [];
    let offset = 0;
    return data.map(d => {
      const pct = (d.value / total) * 100;
      const segment = { ...d, pct, offset };
      offset += pct;
      return segment;
    });
  }

  private sum(data: NameValue[]): number {
    return data.reduce((total, d) => total + (d.value ?? 0), 0);
  }

  private valueOf(data: NameValue[], name: string): number {
    return data.find(d => (d.name ?? '').toLowerCase() === name)?.value ?? 0;
  }

  private isoDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  }
}
