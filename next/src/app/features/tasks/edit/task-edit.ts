import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';

/** Tag keys the pipeline reads to locate storage; a typo in one fails silently at run time. */
const STORAGE_TAG_KEYS = ['bucket', 'bucket_name', 'input_folder', 'output_folder'];

@Component({
  selector: 'app-task-edit',
  imports: [Icon, ReactiveFormsModule, RouterLink, Field],
  templateUrl: './task-edit.html',
})
export class TaskEdit implements OnInit {
  readonly taskDetailId = input<string>('');

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly taskTypes = signal<any[]>([]);
  readonly lookups = signal<Record<string, any[]>>({});
  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly showTagHelp = signal(false);

  readonly isEdit = computed(() => !!this.taskDetailId());

  readonly form: FormGroup = this.fb.group({
    taskDetailId: [null],
    taskName: ['', Validators.required],
    sourceTaskTypeId: [null, Validators.required],
    taskStatus: ['Active', Validators.required],
    homePageId: [''],
    pipelineId: [''],
    groupId: [''],
    taskPayload: [''],
    tags: this.fb.array([]),
  });

  get tags(): FormArray { return this.form.get('tags') as FormArray; }

  ngOnInit(): void {
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/appSetting`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        this.taskTypes.set(response.data?.sourceTaskTypes ?? []);
        const byType: Record<string, any[]> = {};
        for (const lookup of response.data?.lookupDatas ?? []) {
          byType[lookup.lookupType] = lookup.children ?? [];
        }
        this.lookups.set(byType);
      },
      error: () => this.toast.error('Could not load the task settings.'),
    });

    if (this.isEdit()) this.loadTask();
    else this.addTag();
  }

  private loadTask(): void {
    this.loading.set(true);
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceTask.json/fetchSourceTaskWithSourceTaskId`,
      { params: { taskDetailId: this.taskDetailId() } }).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.toast.error(response.message || 'That task could not be loaded.');
          return;
        }
        const task = response.data;
        this.form.patchValue({
          taskDetailId: task.taskDetailId,
          taskName: task.taskName,
          sourceTaskTypeId: task.sourceTaskType?.sourceTaskTypeId ?? null,
          taskStatus: task.taskStatus,
          homePageId: task.homePageId,
          pipelineId: task.pipelineId,
          groupId: task.groupId,
          taskPayload: task.taskPayload,
        });
        const existing = task.xmlTagsInfo ?? task.tagsInfo ?? [];
        this.tags.clear();
        for (const tag of existing) this.addTag(tag);
        if (!this.tags.length) this.addTag();
      },
      error: err => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'That task could not be loaded.');
      },
    });
  }

  addTag(tag?: any): void {
    this.tags.push(this.fb.group({
      tagKey: [tag?.tagKey ?? ''],
      tagParent: [tag?.tagParent ?? ''],
      tagValue: [tag?.tagValue ?? ''],
    }));
  }

  removeTag(index: number): void {
    this.tags.removeAt(index);
    if (!this.tags.length) this.addTag();
  }

  isStorageTag(key: string): boolean {
    return STORAGE_TAG_KEYS.includes((key ?? '').trim().toLowerCase());
  }

  /** Trailing space is invisible in the field but travels into the payload and breaks matching. */
  trimTag(index: number, control: 'tagKey' | 'tagParent' | 'tagValue'): void {
    const field = this.tags.at(index).get(control)!;
    const value = field.value;
    if (typeof value === 'string' && value !== value.trim()) field.setValue(value.trim());
  }

  lookupOptions(type: string): any[] { return this.lookups()[type] ?? []; }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      taskDetailId: value.taskDetailId,
      taskName: value.taskName,
      sourceTaskType: { sourceTaskTypeId: value.sourceTaskTypeId },
      taskPayload: value.taskPayload,
      taskStatus: value.taskStatus,
      homePageId: value.homePageId,
      pipelineId: value.pipelineId,
      groupId: value.groupId,
      xmlTagsInfo: value.tags.filter((t: any) => (t.tagKey ?? '').trim()),
    };

    this.saving.set(true);
    const request = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/sourceTask.json/updateSourceTask`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/sourceTask.json/addSourceTask`, payload);

    request.subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(this.isEdit() ? 'Task updated.' : 'Task created.');
          this.router.navigate(['/tasks']);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The task could not be saved.');
      },
    });
  }
}
