import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';

/** Tag keys the pipeline reads to locate storage; a typo in one fails silently at run time. */
const STORAGE_TAG_KEYS = ['bucket', 'bucket_name', 'input_folder', 'output_folder'];

/** The lookup parents whose sub-lookups fill the three dropdowns on this form. */
const LOOKUP_TYPES = ['PIPELINE_IDS', 'TASK_GROUPS', 'PIPELINE_HOME_PAGES'];

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

        // appSetting returns only the parent lookup rows -- there is no "children" on them,
        // so every dropdown rendered with nothing but "None". The options are the sub-lookups,
        // which have to be fetched per parent.
        const parents: any[] = response.data?.lookupDatas ?? [];
        const wanted = parents.filter(p => LOOKUP_TYPES.includes(p.lookupType));
        if (!wanted.length) return;

        forkJoin(
          wanted.map(parent =>
            this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/fetchSubLookupByParentId`,
              { params: { parentLookUpId: parent.lookupId } }).pipe(
              map(sub => ({
                type: parent.lookupType as string,
                options: (sub?.data?.lookupDatas ?? []) as any[],
              })),
              catchError(() => of({ type: parent.lookupType as string, options: [] as any[] })),
            )),
        ).subscribe(results => {
          const byType: Record<string, any[]> = {};
          for (const result of results) byType[result.type] = result.options;
          this.lookups.set(byType);
        });
      },
      error: () => this.toast.error('Could not load the task settings.'),
    });

    if (this.isEdit()) this.loadTask();
    else this.addTag();
  }

  private loadTask(): void {
    this.loading.set(true);
    // The endpoint's parameter is sourceTaskId; sending taskDetailId returned 400 and the
    // form loaded with an empty payload and no tags.
    this.http.get<ApiResponse<any>>(`${API_BASE}/sourceTask.json/fetchSourceTaskWithSourceTaskId`,
      { params: { sourceTaskId: this.taskDetailId() } }).subscribe({
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

  /** Inserts directly below the row clicked, as the old form did, so order can be built up. */
  insertTagAfter(index: number): void {
    this.tags.insert(index + 1, this.fb.group({
      tagKey: [''],
      tagParent: [this.tags.at(index).get('tagParent')?.value ?? ''],
      tagValue: [''],
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

  /**
   * The XML the current tags produce, built by the same code that would build it on save.
   *
   * Tags and the payload textarea are stored separately, so nothing on this screen showed what
   * a tag actually became -- you added rows and hoped. The backend has always been able to
   * render them; xmlCreateChecker existed for exactly this and was never called from here.
   *
   * Asking the server rather than assembling it in the browser is deliberate: a second
   * implementation would drift from the one that matters, and the nesting rules for tagParent
   * are more intricate than they look.
   */
  readonly tagXml = signal('');
  readonly previewing = signal(false);
  readonly previewError = signal('');

  previewTagXml(): void {
    const tags = (this.form.getRawValue().tags as any[])
      .filter(t => (t.tagKey ?? '').trim())
      .map(t => ({ tagKey: (t.tagKey ?? '').trim(),
                   tagParent: (t.tagParent ?? '').trim(),
                   tagValue: (t.tagValue ?? '').trim() }));
    if (!tags.length) {
      this.tagXml.set('');
      this.previewError.set('Add a tag first — the first one becomes the root element.');
      return;
    }
    this.previewing.set(true);
    this.previewError.set('');
    this.http.post<ApiResponse<string>>(`${API_BASE}/setting.json/xmlCreateChecker`,
      { xmlTagsInfo: tags }).subscribe({
      next: response => {
        this.previewing.set(false);
        // This endpoint returns the document in `message` rather than `data`.
        const xml = (response as any).message ?? response.data ?? '';
        if (response.status !== API_SUCCESS || !xml) {
          this.previewError.set(response.message || 'Those tags could not be turned into XML.');
          this.tagXml.set('');
          return;
        }
        this.tagXml.set(String(xml));
      },
      error: err => {
        this.previewing.set(false);
        this.previewError.set(err?.error?.message || 'Those tags could not be turned into XML.');
      },
    });
  }

  /** Copy the generated document into the payload the consumer actually receives. */
  useTagXmlAsPayload(): void {
    const xml = this.tagXml();
    if (!xml) return;
    this.form.get('taskPayload')?.setValue(xml);
    this.toast.success('Payload replaced with the tags above.');
  }

  copyTagXml(): void {
    copyText(this.tagXml()).then(
      () => this.toast.success('XML copied.'),
      () => this.toast.error('Could not copy the XML.'));
  }

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
