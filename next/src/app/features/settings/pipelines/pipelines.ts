import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { AuthService } from '../../../core/auth/auth.service';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { Combobox } from '../../../shared/ui/combobox';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { Pipeline, PipelineDialog } from './pipeline-dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { parseTopicPartition } from '../../../shared/ui/topic';

@Component({
  selector: 'app-pipelines',
  imports: [MineFilter, ViewToggle, StatTile, TableShell, StatusPill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger, RouterLink, Combobox],
  templateUrl: './pipelines.html',
})
export class Pipelines implements OnInit {
  readonly view = signal<'table' | 'cards'>('table');
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly forms = signal<Pipeline[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');

  /** The topics the caller can see, for the filter and for the dialog's picker. */
  readonly topics = signal<{ sourceTaskTypeId: number; serviceName: string; queueTopicPartition?: string; status?: string; kafkaConnectionProfileName?: string }[]>([]);
  readonly topicFilter = signal('');
  readonly statusFilter = signal('');
  /** Topics for the filter box, plus a "No topic" row while any pipeline still lacks one. */
  readonly topicFilterOptions = computed(() => {
    const rows = this.topics().map(t => ({ value: String(t.sourceTaskTypeId), label: t.serviceName, hint: this.kafkaTopicOf(t) }));
    return this.summary().untopped ? [...rows, { value: 'none', label: 'No topic', hint: 'pipelines still to be assigned' }] : rows;
  });
  /** Cards whose full field list is open; keyed by pipeline so one click opens one card. */
  private readonly openFields = signal<Set<number>>(new Set());
  isOpen(form: Pipeline): boolean { return this.openFields().has(form.pipelineKey ?? -1); }
  toggleFields(form: Pipeline): void {
    const key = form.pipelineKey ?? -1;
    this.openFields.update(set => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  readonly hasFilters = computed(() => !!this.search().trim() || !!this.topicFilter() || !!this.statusFilter());
  private readonly route = inject(ActivatedRoute);

  private readonly auth = inject(AuthService);

  /**
   * A new form always belongs to one tenant. A platform admin has none, so
   * PipelineServiceImpl.saveForm files their new form under the seeded "default" tenant instead
   * of refusing it -- only that tenant's users can use it. Surfaced here so a platform admin
   * knows where to find (or sign in as, to fully manage) what they are about to create.
   */
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  readonly onlyMine = signal(false);


  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const topic = this.topicFilter();
    let rows = this.mine(this.forms());
    if (this.statusFilter()) rows = rows.filter(f => f.status === this.statusFilter());
    if (topic === 'none') rows = rows.filter(f => f.sourceTaskTypeId == null);
    else if (topic) rows = rows.filter(f => String(f.sourceTaskTypeId) === topic);
    if (!term) return rows;
    return rows.filter(form =>
      `${form.pipelineName ?? ''} ${form.pipelineId ?? ''} ${form.description ?? ''} ${form.topicName ?? ''} ${form.kafkaTopic ?? ''}`
        .toLowerCase().includes(term));
  });

  readonly summary = computed(() => {
    const list = this.forms();
    return {
      total: list.length,
      active: list.filter(f => f.status === 'Active').length,
      fields: list.reduce((sum, form) => sum + (form.fields?.length ?? 0), 0),
      topics: new Set(list.map(f => f.sourceTaskTypeId).filter(id => id != null)).size,
      untopped: list.filter(f => f.sourceTaskTypeId == null).length,
    };
  });

  ngOnInit(): void {
    const topic = this.route.snapshot.queryParamMap.get('topic');
    if (topic) this.topicFilter.set(topic);
    this.load();
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/appSetting`).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) return;
        this.topics.set((r.data?.sourceTaskTypes ?? []).filter((t: any) => t.status !== 'Delete'));
      },
      error: () => {},
    });
  }

  kafkaTopicOf(t: { queueTopicPartition?: string }): string { return parseTopicPartition(t.queueTopicPartition).topic; }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<Pipeline[]>>(`${API_BASE}/pipeline.json/list`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.forms.set(response.data ?? []);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load forms.');
      },
    });
  }

  fieldCount(form: Pipeline): number { return form.fields?.length ?? 0; }

  requiredCount(form: Pipeline): number {
    return (form.fields ?? []).filter(field => field.required).length;
  }

  create(): void {
    this.dialog.open<boolean>(PipelineDialog, { data: { topics: this.topics() } })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  edit(form: Pipeline): void {
    this.dialog.open<boolean>(PipelineDialog, { data: { form, topics: this.topics() } })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  duplicate(form: Pipeline): void {
    // A copy has to claim a different pipeline: one live form per pipeline is a unique index.
    const copy: Pipeline = {
      ...form,
      pipelineKey: undefined,
      pipelineId: '',
      pipelineName: `${form.pipelineName} (copy)`,
      fields: (form.fields ?? []).map(field => ({ ...field, pipelineFieldId: undefined })),
    };
    this.dialog.open<boolean>(PipelineDialog, { data: { form: copy, topics: this.topics() } })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  async remove(form: Pipeline): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${form.pipelineName}?`,
      body: 'Tasks on this pipeline keep working — a form only describes their payload, it does '
        + 'not store it. They go back to being edited as raw tags.',
      confirmLabel: 'Delete form',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/pipeline.json/delete`,
      { params: new HttpParams().set('pipelineKey', String(form.pipelineKey)) }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The form could not be deleted.'),
    });
  }

  clearFilters(): void { this.search.set(''); }

  /**
   * Applies the "Only mine" toggle.
   *
   * Pure -- it runs inside a computed, where writing a signal is not allowed. The surviving
   * count is already on the table header, so nothing needs recording.
   */
  private mine<T extends { createdBy?: number | null }>(rows: T[]): T[] {
    if (!this.onlyMine()) {
      return rows;
    }
    const myId = this.auth.user()?.appUserId ?? null;
    return rows.filter(row => isMine(row, myId));
  }
}
