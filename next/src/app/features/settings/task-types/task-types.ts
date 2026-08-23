import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { TaskType, TaskTypeDialog } from './task-type-dialog';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-task-types',
  imports: [TableShell, StatusPill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './task-types.html',
})
export class TaskTypes implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly types = signal<TaskType[]>([]);
  readonly profiles = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');

  readonly hasFilters = computed(() => !!(this.search().trim() || this.statusFilter()));

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    return this.types().filter(t => {
      if (status && t.status !== status) return false;
      if (!term) return true;
      return `${t.serviceName ?? ''} ${t.description ?? ''} ${this.topicOf(t.queueTopicPartition)}`
        .toLowerCase().includes(term);
    });
  });

  readonly summary = computed(() => {
    const list = this.types();
    return {
      total: list.length,
      active: list.filter(t => t.status === 'Active').length,
      linked: list.reduce((sum, t) => sum + (t.totalTaskLink ?? 0), 0),
      unused: list.filter(t => !t.totalTaskLink).length,
    };
  });

  readonly routes = signal<Record<number, number>>({});
  readonly canRoute = computed(() => !this.auth.isPlatformAdmin());
  readonly testing = signal<number | null>(null);

  /** Which Kafka profile a type is routed to, or the tenant default when unrouted. */
  routeName(type: TaskType): string {
    const profileId = this.routes()[type.sourceTaskTypeId!];
    if (!profileId) return '';
    const profile = this.profiles().find(p => p.kafkaConnectionProfileId === profileId);
    return profile ? profile.profileName : `#${profileId}`;
  }

  private loadRoutes(): void {
    // The route endpoint rejects a platform admin, so there is nothing to ask for.
    if (this.auth.isPlatformAdmin()) return;
    for (const type of this.types()) {
      const id = type.sourceTaskTypeId;
      if (!id) continue;
      this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/fetchKafkaRoute`,
        { params: { sourceTaskTypeId: id } }).subscribe({
        next: response => {
          if (response.status !== API_SUCCESS) return;
          const profileId = response.data?.kafkaConnectionProfileId ?? response.data?.profileId;
          if (profileId) this.routes.update(map => ({ ...map, [id]: profileId }));
        },
        // An unrouted type simply has no route; a failure here should not colour the row.
        error: () => {},
      });
    }
  }

  /** Tests the profile this type publishes through, which is what the old row action did. */
  testRoute(type: TaskType): void {
    const profileId = this.routes()[type.sourceTaskTypeId!];
    if (!profileId) {
      this.toast.error(`${type.serviceName} uses the tenant default — test that profile directly.`);
      return;
    }
    this.testing.set(type.sourceTaskTypeId!);
    this.http.post<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/testConnection`,
      { kafkaConnectionProfileId: profileId }).subscribe({
      next: response => {
        this.testing.set(null);
        response.status === API_SUCCESS
          ? this.toast.success(response.message)
          : this.toast.error(response.message);
      },
      error: err => {
        this.testing.set(null);
        this.toast.error(err?.error?.message || 'The broker could not be reached.');
      },
    });
  }

  ngOnInit(): void {
    this.load();
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/kafkaConnectionProfile.json/fetchAllProfiles`)
      .subscribe({
        next: response => {
          if (response.status === API_SUCCESS) this.profiles.set(response.data ?? []);
        },
        // Routing is optional; the form still works with just the tenant default.
        error: () => this.profiles.set([]),
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    // Task types arrive as part of the app-settings payload rather than their own endpoint.
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/appSetting`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        // The payload includes soft-deleted rows, which were being listed as live types.
        this.types.set((response.data?.sourceTaskTypes ?? [])
          .filter((t: TaskType) => t.status !== 'Delete'));
        this.loadRoutes();
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load task types.');
      },
    });
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
  }

  create(): void {
    this.dialog.open<boolean>(TaskTypeDialog, { data: { profiles: this.profiles() } }).closed
      .subscribe(saved => { if (saved) this.load(); });
  }

  edit(type: TaskType): void {
    this.dialog.open<boolean>(TaskTypeDialog, { data: { type, profiles: this.profiles() } }).closed
      .subscribe(saved => { if (saved) this.load(); });
  }

  async remove(type: TaskType): Promise<void> {
    const linked = type.totalTaskLink ?? 0;
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${type.serviceName}?`,
      body: linked
        ? `${linked} task${linked === 1 ? '' : 's'} use this type. Deleting it also marks their jobs deleted — they will stop running.`
        : 'No tasks use this type.',
      confirmLabel: 'Delete task type',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/setting.json/deleteSourceTaskType`,
      { params: new HttpParams().set('sourceTaskTypeId', type.sourceTaskTypeId!) }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The task type could not be deleted.'),
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
