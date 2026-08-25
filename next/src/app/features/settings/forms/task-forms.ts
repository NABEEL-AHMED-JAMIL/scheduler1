import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { TaskForm, TaskFormDialog } from './task-form-dialog';

@Component({
  selector: 'app-task-forms',
  imports: [ViewToggle, StatTile, TableShell, StatusPill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './task-forms.html',
})
export class TaskForms implements OnInit {
  readonly view = signal<'table' | 'cards'>('table');
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly forms = signal<TaskForm[]>([]);
  readonly pipelines = signal<string[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');

  readonly hasFilters = computed(() => !!this.search().trim());

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.forms();
    return this.forms().filter(form =>
      `${form.formName ?? ''} ${form.pipelineId ?? ''} ${form.description ?? ''}`
        .toLowerCase().includes(term));
  });

  readonly summary = computed(() => {
    const list = this.forms();
    return {
      total: list.length,
      fields: list.reduce((sum, form) => sum + (form.fields?.length ?? 0), 0),
      shared: list.filter(form => form.tenantId == null).length,
      pipelines: new Set(list.map(form => form.pipelineId)).size,
    };
  });

  ngOnInit(): void {
    this.load();
    this.loadPipelines();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<TaskForm[]>>(`${API_BASE}/taskForm.json/listForms`).subscribe({
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

  /**
   * pipelineId is free text on a task rather than a foreign key, so the only way to offer
   * real choices is to read the ones already in use.
   */
  private loadPipelines(): void {
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceTask.json/fetchSourceTask`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const rows = response.data?.sourceTasks ?? response.data ?? [];
        this.pipelines.set([...new Set(
          (Array.isArray(rows) ? rows : [])
            .map((task: any) => String(task.pipelineId ?? '').trim())
            .filter(Boolean))]);
      },
      // Suggestions are a convenience; the field takes free text either way.
      error: () => this.pipelines.set([]),
    });
  }

  fieldCount(form: TaskForm): number { return form.fields?.length ?? 0; }

  requiredCount(form: TaskForm): number {
    return (form.fields ?? []).filter(field => field.required).length;
  }

  scopeLabel(form: TaskForm): string {
    return form.tenantId == null ? 'All tenants' : `Tenant ${form.tenantId}`;
  }

  create(): void {
    this.dialog.open<boolean>(TaskFormDialog, { data: { pipelines: this.pipelines() } })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  edit(form: TaskForm): void {
    this.dialog.open<boolean>(TaskFormDialog, { data: { form, pipelines: this.pipelines() } })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  duplicate(form: TaskForm): void {
    // A copy has to claim a different pipeline: one live form per pipeline is a unique index.
    const copy: TaskForm = {
      ...form,
      taskFormId: undefined,
      pipelineId: '',
      formName: `${form.formName} (copy)`,
      fields: (form.fields ?? []).map(field => ({ ...field, taskFormFieldId: undefined })),
    };
    this.dialog.open<boolean>(TaskFormDialog, { data: { form: copy, pipelines: this.pipelines() } })
      .closed.subscribe(saved => { if (saved) this.load(); });
  }

  async remove(form: TaskForm): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${form.formName}?`,
      body: 'Tasks on this pipeline keep working — a form only describes their payload, it does '
        + 'not store it. They go back to being edited as raw tags.',
      confirmLabel: 'Delete form',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/taskForm.json/deleteForm`,
      { params: new HttpParams().set('taskFormId', String(form.taskFormId)) }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The form could not be deleted.'),
    });
  }

  clearFilters(): void { this.search.set(''); }
}
