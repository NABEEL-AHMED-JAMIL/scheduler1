import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { RouterLink } from '@angular/router';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { DatePipe } from '@angular/common';
import { Icon } from '../../shared/ui/icon';
import { ViewToggle } from '../../shared/ui/view-toggle';
import { copyText } from '../../shared/ui/clipboard.util';
import { Dialog } from '@angular/cdk/dialog';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { createPager } from '../../shared/ui/pager';
import { Pagination } from '../../shared/ui/pagination';

export interface LinkedJob {
  jobId: number;
  jobName: string;
  jobStatus: string;
  jobRunningStatus?: string;
  execution?: string;
  priority?: number;
  lastJobRun?: string;
}

interface SourceTask {
  taskDetailId: number;
  taskName: string;
  taskStatus: string;
  pipelineId?: string;
  groupId?: string;
  bucket?: string;
  inputFolder?: string;
  outputFolder?: string;
  sourceTaskType?: { sourceTaskTypeId?: number; serviceName?: string; queueTopicPartition?: string };
  taskPayload?: string;
  totalLinksJobs?: number;
}

@Component({
  selector: 'app-tasks',
  imports: [ViewToggle, Icon, RouterLink, TableShell, StatusPill, CdkMenu, CdkMenuItem, CdkMenuTrigger, Pagination, DatePipe],
  templateUrl: './tasks.html',
})
export class Tasks implements OnInit {
  readonly view = signal<'table' | 'cards'>('table');
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  readonly tasks = signal<SourceTask[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.tasks();
    return this.tasks().filter(task =>
      String(task.taskDetailId).includes(term)
      || (task.taskName ?? '').toLowerCase().includes(term)
      || (task.sourceTaskType?.serviceName ?? '').toLowerCase().includes(term)
      || (task.pipelineId ?? '').toLowerCase().includes(term));
  });

  readonly pager = createPager<any>();
  readonly paged = computed(() => this.pager.slice(this.filtered()));

  goToPage(next: number): void { this.pager.goTo(next, this.filtered().length); }
  setPageSize(size: number): void { this.pager.setSize(size); }

  readonly expanded = signal<Set<number>>(new Set());
  readonly copiedId = signal<number | null>(null);

  toggleRow(task: SourceTask): void {
    const opening = !this.expanded().has(task.taskDetailId);
    this.expanded.update(set => {
      const next = new Set(set);
      next.has(task.taskDetailId) ? next.delete(task.taskDetailId) : next.add(task.taskDetailId);
      return next;
    });
    if (opening && !this.linkedJobs()[task.taskDetailId]) this.loadLinkedJobs(task);
  }

  /** The parameter is sourceTaskId, not taskDetailId -- the same id under a different name. */
  private loadLinkedJobs(task: SourceTask): void {
    if (!task.totalLinksJobs) {
      this.linkedJobs.update(map => ({ ...map, [task.taskDetailId]: [] }));
      return;
    }
    this.linkedLoading.set(task.taskDetailId);
    this.http.post<ApiResponse<LinkedJob[]>>(
      `${API_BASE}/sourceTask.json/fetchAllLinkJobsWithSourceTaskId`, {},
      { params: { sourceTaskId: String(task.taskDetailId) } }).subscribe({
      next: response => {
        this.linkedLoading.set(null);
        if (response.status === API_SUCCESS) {
          this.linkedJobs.update(map => ({ ...map, [task.taskDetailId]: response.data ?? [] }));
        }
      },
      error: () => {
        this.linkedLoading.set(null);
        this.linkedJobs.update(map => ({ ...map, [task.taskDetailId]: [] }));
      },
    });
  }


  readonly busyTask = signal<number | null>(null);

  /**
   * The jobs bound to a task, fetched when its panel opens. The count was already on the
   * row; "23 linked jobs" tells you the task matters but not which jobs would stop if you
   * changed it, which is the question anyone opening that panel is actually asking.
   * Cached per task so re-opening a panel does not re-fetch.
   */
  readonly linkedJobs = signal<Record<number, LinkedJob[]>>({});
  readonly linkedLoading = signal<number | null>(null);

  /** Same approach as jobs: read the task back in full and post it as a new one. */
  clone(task: SourceTask): void {
    this.busyTask.set(task.taskDetailId);
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceTask.json/fetchSourceTaskWithSourceTaskId`,
      { params: { sourceTaskId: task.taskDetailId } }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.busyTask.set(null);
          this.toast.error(response.message || 'That task could not be read.');
          return;
        }
        const source = response.data;
        const payload = {
          taskName: `${source.taskName} (copy)`,
          sourceTaskType: { sourceTaskTypeId: source.sourceTaskType?.sourceTaskTypeId },
          taskPayload: source.taskPayload,
          taskStatus: 'Inactive',
          homePageId: source.homePageId,
          pipelineId: source.pipelineId,
          groupId: source.groupId,
          xmlTagsInfo: source.xmlTagsInfo ?? [],
        };
        this.http.post<ApiResponse>(`${API_BASE}/sourceTask.json/addSourceTask`, payload).subscribe({
          next: created => {
            this.busyTask.set(null);
            if (created.status === API_SUCCESS) {
              this.toast.success(`Copied as "${payload.taskName}" — it starts inactive.`);
              this.load();
            } else { this.toast.error(created.message); }
          },
          error: err => {
            this.busyTask.set(null);
            this.toast.error(err?.error?.message || 'The copy could not be created.');
          },
        });
      },
      error: err => {
        this.busyTask.set(null);
        this.toast.error(err?.error?.message || 'That task could not be read.');
      },
    });
  }

  copyPayload(task: SourceTask): void {
    copyText(task.taskPayload ?? '').then(() => {
      this.copiedId.set(task.taskDetailId);
      setTimeout(() => this.copiedId.set(null), 1500);
    });
  }

  /**
   * Deleting a task also deletes every job bound to it -- the endpoint cascades through
   * statusChangeSourceJobWithSourceTaskId -- so the count goes in the prompt rather than
   * being discovered afterwards. taskStatus has to be in the payload: the endpoint cascades
   * to the jobs unconditionally but only marks the task itself when that field is present.
   */
  async remove(task: SourceTask): Promise<void> {
    if (task.taskStatus === 'Delete') return;
    const linked = task.totalLinksJobs ?? 0;
    const ok = await confirmWith(this.dialog, {
      title: 'Delete task',
      body: linked
        ? `"${task.taskName}" and the ${linked} job${linked > 1 ? 's' : ''} bound to it will be deleted and stop running.`
        : `"${task.taskName}" will be deleted. No jobs are bound to it.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;

    this.busyTask.set(task.taskDetailId);
    this.http.put<ApiResponse>(`${API_BASE}/sourceTask.json/deleteSourceTask`,
      { taskDetailId: task.taskDetailId, taskStatus: 'Delete' }).subscribe({
      next: response => {
        this.busyTask.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(linked
            ? `${task.taskName} and ${linked} job${linked > 1 ? 's' : ''} deleted.`
            : `${task.taskName} deleted.`);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.busyTask.set(null);
        this.toast.error(err?.error?.message || 'Delete failed.');
      },
    });
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    // listSourceTask is a POST taking an optional search body; an empty body means "everything".
    this.http.post<ApiResponse<SourceTask[]>>(`${API_BASE}/sourceTask.json/listSourceTask`, {}).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS) this.tasks.set(response.data ?? []);
        else this.error.set(response.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load tasks.');
      },
    });
  }

  /** "topic=scrapping-topic&partitions=[*]" -> "scrapping-topic" */
  topicOf(raw?: string): string {
    if (!raw) return '';
    const match = /topic=([^&]+)/.exec(raw);
    return match ? match[1] : raw;
  }
}
