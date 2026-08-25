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
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { TaskForm, TaskFormDialog } from './task-form-dialog';

@Component({
  selector: 'app-task-forms',
  imports: [MineFilter, ViewToggle, StatTile, TableShell, StatusPill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger],
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

  private readonly auth = inject(AuthService);

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  readonly onlyMine = signal(false);


  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const rows = this.mine(this.forms());
    if (!term) return rows;
    return rows.filter(form =>
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
    // listSourceTask is a POST taking an optional search body; an empty body means "everything".
    this.http.post<ApiResponse<any[]>>(`${API_BASE}/sourceTask.json/listSourceTask`, {}).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const rows = response.data ?? [];
        this.pipelines.set([...new Set(
          (Array.isArray(rows) ? rows : [])
            .map((task: any) => String(task.pipelineId ?? '').trim())
            .filter(Boolean))].sort());
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
