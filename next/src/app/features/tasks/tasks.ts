import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { RouterLink } from '@angular/router';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { Icon } from '../../shared/ui/icon';

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
