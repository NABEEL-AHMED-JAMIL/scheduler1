import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Donut } from '../../shared/charts/donut';
import { BarChart } from '../../shared/charts/bar-chart';
import { HeatCell, HeatSelection, Heatmap } from '../../shared/charts/heatmap';
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
  imports: [RouterLink, Donut, BarChart, Heatmap],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

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
  readonly weeklyBars = computed(() =>
    this.weekly().map(d => ({ name: d.name, value: d.value })));

  /** Run outcomes keep their status colours so a chart matches the pills in the tables. */
  readonly outcomeColor = (name: string, index: number): string => {
    switch ((name ?? '').toLowerCase()) {
      case 'completed': return 'var(--color-ok-500)';
      case 'failed':    return 'var(--color-crit-500)';
      case 'missed':
      case 'skip':      return 'var(--color-warn-500)';
      case 'running':
      case 'start':
      case 'queue':     return 'var(--color-brand-500)';
      default:          return `var(--chart-${index % 6})`;
    }
  };

  /** Hour-by-weekday cells for the heatmap; the date rides along so a click can drill in. */
  readonly heatCells = computed<HeatCell[]>(() =>
    this.hourly().map(cell => ({
      day: cell.dayCode,
      hour: cell.hr,
      value: cell.count,
      key: cell.date,
    })));

  readonly selectedHeat = computed(() => {
    const cell = this.selectedCell();
    if (!cell) return null;
    const match = this.hourly().find(h => h.date === cell.date && h.hr === cell.hr);
    return match ? { day: match.dayCode, hour: match.hr } : null;
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
  onHeatCell(selection: HeatSelection): void {
    this.selectCell(selection.key ?? '', selection.hour, selection.value);
  }

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

  /**
   * Clicking a count opens that job's runs for exactly this hour and status. Zero is not a
   * link -- following it would land on an empty page -- so it says so instead.
   */
  openCount(row: JobBreakdown, status: string, count: number): void {
    if (!count) {
      this.toast.info(`No ${status.toLowerCase()} runs for ${row.jobName} in this hour.`);
      return;
    }
    const cell = this.selectedCell();
    this.router.navigate(['/jobs', row.jobId, 'history'], {
      queryParams: {
        // Column keys are lowercase; the API and the UI both expect the capitalised status.
        jobStatus: status.charAt(0).toUpperCase() + status.slice(1),
        targetDate: cell?.date ?? null,
        targetHr: cell?.hr ?? null,
      },
    });
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
