import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { Field } from '../../shared/ui/field';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Icon } from '../../shared/ui/icon';
import { DynamicForm, DynamicFormSubmission, SECTION_TYPE } from './dynamic-form.model';

interface TagInfo { tagKey: string; tagParent: string; tagValue: string; }

interface SourceTaskSummary {
  taskDetailId: number;
  taskName: string;
  taskStatus?: string;
  pipelineId?: string;
  bucket?: string;
}

/**
 * Turns a filled-in dynamic form into a source task's configuration.
 *
 * A submission is a flat map of answers keyed by field name; a task's payload is nested XML
 * plus the tag rows that mirror it. The gap between the two is a parent tag, so this asks for
 * one root and nests every answer under it -- the shape the existing tasks already use.
 *
 * The XML itself is built by setting.json/xmlCreateChecker rather than assembled here, so a
 * payload written from a form is byte-identical to one written by the XML builder.
 */
@Component({
  selector: 'app-submission-to-task-dialog',
  imports: [FormsModule, Field, FormDialog, Icon],
  template: `
    <app-form-dialog heading="Use as task configuration"
        subtitle="Writes these answers into a source task as its payload."
        [confirmLabel]="mode() === 'new' ? 'Create task' : 'Update task'"
        [saving]="saving()" size="wide"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <div class="form-stack">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn btn-sm"
                  [class.btn-primary]="mode() === 'new'" [class.btn-default]="mode() !== 'new'"
                  (click)="mode.set('new')">New task</button>
          <button type="button" class="btn btn-sm"
                  [class.btn-primary]="mode() === 'existing'" [class.btn-default]="mode() !== 'existing'"
                  (click)="mode.set('existing')">Update an existing task</button>
        </div>

        @if (mode() === 'new') {
          <div class="form-grid">
            <app-field label="Task name" for="taskName" [required]="true">
              <input id="taskName" class="input" [(ngModel)]="taskName" name="taskName"
                     [ngModelOptions]="{standalone: true}" />
            </app-field>
            <app-field label="Task type" for="taskType" [required]="true"
                       hint="Which consumer runs it.">
              <select id="taskType" class="input" [(ngModel)]="taskTypeId" name="taskTypeId"
                      [ngModelOptions]="{standalone: true}">
                <option [ngValue]="null">Choose…</option>
                @for (type of taskTypes(); track type.sourceTaskTypeId) {
                  <option [ngValue]="type.sourceTaskTypeId">{{ type.serviceName }}</option>
                }
              </select>
            </app-field>
          </div>
          <div class="form-grid">
            <app-field label="Pipeline" for="pipelineId"
                       hint="The pipelineId the worker routes on.">
              <input id="pipelineId" class="input mono" [(ngModel)]="pipelineId" name="pipelineId"
                     [ngModelOptions]="{standalone: true}" />
            </app-field>
            <app-field label="Bucket" for="bucket">
              <input id="bucket" class="input mono" [(ngModel)]="bucket" name="bucket"
                     [ngModelOptions]="{standalone: true}" />
            </app-field>
          </div>
        } @else {
          <app-field label="Task to update" for="existingTask" [required]="true"
                     hint="Its payload and tag rows are replaced by these answers.">
            <select id="existingTask" class="input" [(ngModel)]="existingTaskId" name="existingTaskId"
                    [ngModelOptions]="{standalone: true}">
              <option [ngValue]="null">Choose…</option>
              @for (task of tasks(); track task.taskDetailId) {
                <option [ngValue]="task.taskDetailId">
                  #{{ task.taskDetailId }} — {{ task.taskName }}
                </option>
              }
            </select>
          </app-field>
          <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
            <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
            <span>
              This replaces that task's whole configuration. Jobs already pointing at it will run
              with these answers from their next run onward.
            </span>
          </p>
        }

        <app-field label="Root tag" for="rootTag" [required]="true"
                   hint="Every answer is nested under this, as the existing task payloads are.">
          <input id="rootTag" class="input mono" [(ngModel)]="rootTag" name="rootTag"
                 [ngModelOptions]="{standalone: true}" (ngModelChange)="rebuild()" />
        </app-field>

        <!-- Mapping ------------------------------------------------------------- -->
        <div>
          <h3 class="text-sm font-semibold">Answers being written</h3>
          <p class="field-note text-[color:var(--text-muted)]">
            The field name becomes the tag. Sections are left out, since they collect nothing.
          </p>
        </div>
        <div class="overflow-x-auto scroll-table">
          <table class="table-modern">
            <thead><tr><th>Field</th><th>Tag</th><th>Value</th></tr></thead>
            <tbody>
              @for (tag of tags(); track tag.tagKey) {
                <tr>
                  <td class="text-xs">{{ labelFor(tag.tagKey) }}</td>
                  <td class="mono text-xs text-accent">&lt;{{ tag.tagKey }}&gt;</td>
                  <td class="mono text-xs max-w-72 truncate" [title]="tag.tagValue">
                    {{ tag.tagValue || '—' }}
                  </td>
                </tr>
              }
              @if (!tags().length) {
                <tr><td colspan="3" class="text-sm text-[color:var(--text-muted)]">
                  This submission has no answers to write.
                </td></tr>
              }
            </tbody>
          </table>
        </div>

        @if (xml()) {
          <div class="flex flex-col gap-1.5">
            <h3 class="text-sm font-semibold">Payload</h3>
            <pre class="mono text-xs leading-relaxed rounded p-2.5 overflow-auto max-h-64
                        whitespace-pre-wrap break-words bg-code border border-subtle"
                >{{ xml() }}</pre>
          </div>
        } @else if (building()) {
          <p class="text-sm text-[color:var(--text-muted)]">Building the payload…</p>
        }
      </div>
    </app-form-dialog>
  `,
})
export class SubmissionToTaskDialog implements OnInit {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ form: DynamicForm; submission: DynamicFormSubmission }>(DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly mode = signal<'new' | 'existing'>('new');
  readonly saving = signal(false);
  readonly building = signal(false);
  readonly xml = signal('');

  taskName = `${this.data.form.formName} configuration`;
  taskTypeId: number | null = null;
  pipelineId = '';
  bucket = '';
  existingTaskId: number | null = null;
  rootTag = 'pipeline';

  readonly tasks = signal<SourceTaskSummary[]>([]);
  readonly taskTypes = signal<any[]>([]);

  /** Every answered, non-section field, as the tag rows a task stores. */
  readonly tags = computed<TagInfo[]>(() => {
    const fields = (this.data.form.fields ?? [])
      .filter(f => f.fieldType !== SECTION_TYPE)
      .sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0));
    const payload = this.data.submission.payload ?? {};
    const root = this.rootTag.trim() || 'pipeline';
    const rows: TagInfo[] = [{ tagKey: root, tagParent: root, tagValue: '' }];
    for (const field of fields) {
      const answer = payload[field.fieldName];
      if (answer === undefined || answer === null) continue;
      rows.push({
        tagKey: field.fieldName,
        tagParent: root,
        tagValue: Array.isArray(answer) ? answer.join(',') : String(answer),
      });
    }
    return rows;
  });

  labelFor(tagKey: string): string {
    if (tagKey === this.rootTag.trim()) return '(root)';
    return (this.data.form.fields ?? []).find(f => f.fieldName === tagKey)?.fieldLabel ?? tagKey;
  }

  ngOnInit(): void {
    this.http.post<ApiResponse<SourceTaskSummary[]>>(
      `${API_BASE}/sourceTask.json/listSourceTask`, {}).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.tasks.set(r.data ?? []); },
      error: () => this.tasks.set([]),
    });
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/appSetting`).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) return;
        this.taskTypes.set((r.data?.sourceTaskTypes ?? [])
          .filter((t: any) => t.status !== 'Delete'));
      },
      error: () => this.taskTypes.set([]),
    });
    this.rebuild();
  }

  /** The document is generated server-side, so it matches what the XML builder would produce. */
  rebuild(): void {
    const rows = this.tags();
    if (rows.length <= 1) { this.xml.set(''); return; }
    this.building.set(true);
    this.http.post<ApiResponse>(`${API_BASE}/setting.json/xmlCreateChecker`,
      { xmlTagsInfo: rows }).subscribe({
      next: r => {
        this.building.set(false);
        // This endpoint returns the document in `message` rather than `data`.
        this.xml.set(r.status === API_SUCCESS ? (r.message ?? '') : '');
        if (r.status !== API_SUCCESS) this.toast.error(r.message);
      },
      error: () => { this.building.set(false); this.xml.set(''); },
    });
  }

  async save(): Promise<void> {
    const rows = this.tags();
    if (rows.length <= 1) { this.toast.error('There are no answers to write.'); return; }
    if (!this.xml()) { this.toast.error('The payload is still being built — try again in a moment.'); return; }

    if (this.mode() === 'new') {
      if (!this.taskName.trim()) { this.toast.error('Give the task a name.'); return; }
      if (!this.taskTypeId) { this.toast.error('Choose a task type.'); return; }
    } else if (!this.existingTaskId) {
      this.toast.error('Choose the task to update.');
      return;
    }

    this.saving.set(true);
    try {
      let response: ApiResponse;
      if (this.mode() === 'new') {
        response = await firstValueFrom(this.http.post<ApiResponse>(
          `${API_BASE}/sourceTask.json/addSourceTask`, {
            taskName: this.taskName.trim(),
            sourceTaskType: { sourceTaskTypeId: this.taskTypeId },
            pipelineId: this.pipelineId.trim() || null,
            bucket: this.bucket.trim() || null,
            taskPayload: this.xml(),
            xmlTagsInfo: rows,
          }));
      } else {
        const existing = this.tasks().find(t => t.taskDetailId === this.existingTaskId);
        response = await firstValueFrom(this.http.put<ApiResponse>(
          `${API_BASE}/sourceTask.json/updateSourceTask`, {
            taskDetailId: this.existingTaskId,
            taskName: existing?.taskName,
            taskPayload: this.xml(),
            xmlTagsInfo: rows,
          }));
      }
      this.saving.set(false);
      if (response.status === API_SUCCESS) {
        this.toast.success(response.message);
        this.ref.close(true);
      } else {
        this.toast.error(response.message);
      }
    } catch (err: any) {
      this.saving.set(false);
      this.toast.error(err?.error?.message || 'The task could not be saved.');
    }
  }
}
