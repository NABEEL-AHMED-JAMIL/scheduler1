import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';

interface SourceTaskType {
  sourceTaskTypeId: number;
  serviceName: string;
  description?: string;
  queueTopicPartition?: string;
  taskTypeStatus?: string;
}

@Component({
  selector: 'app-task-types',
  imports: [TableShell, StatusPill],
  templateUrl: './task-types.html',
})
export class TaskTypes implements OnInit {
  private readonly http = inject(HttpClient);

  readonly types = signal<SourceTaskType[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.types();
    return this.types().filter(t =>
      (t.serviceName ?? '').toLowerCase().includes(term)
      || (t.description ?? '').toLowerCase().includes(term));
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    // Task types arrive as part of the app-settings payload rather than their own endpoint.
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/appSetting`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.types.set(response.data?.sourceTaskTypes ?? []);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load task types.');
      },
    });
  }

  topicOf(raw?: string): string {
    if (!raw) return '';
    const match = /topic=([^&]+)/.exec(raw);
    return match ? match[1] : raw;
  }

  partitionsOf(raw?: string): string {
    if (!raw) return '';
    const match = /partitions=(\[[^\]]*\])/.exec(raw);
    return match ? match[1] : '';
  }
}
