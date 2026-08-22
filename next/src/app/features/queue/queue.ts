import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';

interface QueueRow {
  jobQueueId: number;
  jobId: number;
  jobStatus: string;
  jobStatusMessage?: string;
  startTime?: string;
  endTime?: string;
  dateCreated?: string;
}

const STATUSES = ['Queue', 'Start', 'Running', 'Completed', 'Failed', 'Skip', 'Interrupt', 'Missed'];

@Component({
  selector: 'app-queue',
  imports: [DatePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, TableShell, StatusPill],
  templateUrl: './queue.html',
})
export class Queue implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly statuses = STATUSES;
  readonly rows = signal<QueueRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly selectedStatuses = signal<string[]>([]);
  // fetchLogs requires a date range, so the page opens on the last seven days rather than
  // erroring with "FromDate missing" before the user has touched anything.
  readonly fromDate = signal(Queue.isoDaysAgo(6));
  readonly toDate = signal(Queue.isoDaysAgo(0));

  private static isoDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  }

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter(row =>
      String(row.jobId).includes(term)
      || String(row.jobQueueId).includes(term)
      || (row.jobStatusMessage ?? '').toLowerCase().includes(term));
  });

  readonly counts = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.rows()) map.set(row.jobStatus, (map.get(row.jobStatus) ?? 0) + 1);
    return [...map.entries()].map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const body: any = {
      fromDate: this.fromDate() || Queue.isoDaysAgo(6),
      toDate: this.toDate() || Queue.isoDaysAgo(0),
    };
    if (this.selectedStatuses().length) body.jobStatuses = this.selectedStatuses();

    this.http.post<ApiResponse<QueueRow[] | { jobQueues?: QueueRow[] }>>(
      `${API_BASE}/message.json/fetchLogs`, body).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        const data = response.data as any;
        this.rows.set(Array.isArray(data) ? data : (data?.jobQueues ?? []));
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the queue.');
      },
    });
  }

  toggleStatus(status: string): void {
    this.selectedStatuses.update(list =>
      list.includes(status) ? list.filter(s => s !== status) : [...list, status]);
    this.load();
  }

  clearFilters(): void {
    this.search.set('');
    this.selectedStatuses.set([]);
    this.fromDate.set(Queue.isoDaysAgo(6));
    this.toDate.set(Queue.isoDaysAgo(0));
    this.load();
  }

  /** Force a stuck run to a terminal state so it stops occupying the queue. */
  async forceStatus(row: QueueRow, status: 'Failed' | 'Interrupt'): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Mark run as ${status}`,
      body: `Run #${row.jobQueueId} of job ${row.jobId} will be recorded as ${status}. Use this when a run is stuck and the worker will not report back.`,
      confirmLabel: `Mark ${status}`,
      danger: true,
    });
    if (!ok) return;

    const url = status === 'Failed'
      ? `${API_BASE}/message.json/failJobLogs`
      : `${API_BASE}/message.json/interruptJobLogs`;

    this.http.delete<ApiResponse>(url, { params: { jobQueueId: String(row.jobQueueId) } }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`Run #${row.jobQueueId} marked ${status}.`);
          this.load();
        } else { this.toast.error(response.message); }
      },
      error: err => this.toast.error(err?.error?.message || 'That could not be changed.'),
    });
  }

  duration(row: QueueRow): string | null {
    if (!row.startTime || !row.endTime) return null;
    const ms = new Date(row.endTime).getTime() - new Date(row.startTime).getTime();
    if (!isFinite(ms) || ms < 0) return null;
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  }

  /** A run with no end time is still occupying the queue. */
  inFlight(row: QueueRow): boolean {
    return !row.endTime && ['Queue', 'Start', 'Running'].includes(row.jobStatus);
  }
}
