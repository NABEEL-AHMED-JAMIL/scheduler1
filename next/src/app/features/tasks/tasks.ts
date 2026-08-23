import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { RouterLink } from '@angular/router';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { Icon } from '../../shared/ui/icon';
import { copyText } from '../../shared/ui/clipboard.util';

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
  imports: [Icon, RouterLink, TableShell, StatusPill],
  templateUrl: './tasks.html',
})
export class Tasks implements OnInit {
  private readonly http = inject(HttpClient);

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

  readonly expanded = signal<Set<number>>(new Set());
  readonly copiedId = signal<number | null>(null);

  toggleRow(task: SourceTask): void {
    this.expanded.update(set => {
      const next = new Set(set);
      next.has(task.taskDetailId) ? next.delete(task.taskDetailId) : next.add(task.taskDetailId);
      return next;
    });
  }

  copyPayload(task: SourceTask): void {
    copyText(task.taskPayload ?? '').then(() => {
      this.copiedId.set(task.taskDetailId);
      setTimeout(() => this.copiedId.set(null), 1500);
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
