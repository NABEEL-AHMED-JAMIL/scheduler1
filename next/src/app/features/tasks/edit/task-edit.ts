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
import { TaskForm, TaskFormField } from '../../settings/forms/task-form-dialog';

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

  /**
   * The form this task's pipeline expects, when somebody has defined one.
   *
   * Forms have been buildable under Settings for a while but nothing ever asked for one, so a
   * task was always filled in as raw tag rows -- you had to know that F768926 wants a
   * `search_term` nested under `params` before you could write it down. When a form exists its
   * fields are what you fill in; the tag rows below are still there, and still what gets saved.
   */
  readonly taskFormDef = signal<TaskForm | null>(null);
  readonly formLoading = signal(false);
  /** Whether the raw tag table is on show. Opened by default only when no form is driving it. */
  readonly showTags = signal(true);

  /** The fields in the order their author put them in; `position` is not guaranteed sorted. */
  readonly formFields = computed(() =>
    [...(this.taskFormDef()?.fields ?? [])].sort((a, b) => a.position - b.position));

  /** Which pipeline the currently loaded form belongs to, so the same fetch is not repeated. */
  private loadedFormPipeline: string | null = null;

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
    // Filled in from the pipeline's form when there is one. Its controls write through to
    // `tags`, so everything downstream -- the XML preview, the save payload -- is unchanged.
    formData: this.fb.group({}),
  });

  get tags(): FormArray { return this.form.get('tags') as FormArray; }

  get formData(): FormGroup { return this.form.get('formData') as FormGroup; }

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

    // A pipeline chosen by hand loads its form straight away. Editing an existing task goes
    // through loadTask instead, which has to wait for the tags before it can prefill.
    this.form.get('pipelineId')!.valueChanges.subscribe(pipelineId => {
      this.loadFormForPipeline((pipelineId ?? '').trim());
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
        // emitEvent:false: the pipeline watcher would otherwise fetch the form and prefill it
        // from tags that are still two lines from being loaded, so every field came up blank.
        this.form.patchValue({
          taskDetailId: task.taskDetailId,
          taskName: task.taskName,
          sourceTaskTypeId: task.sourceTaskType?.sourceTaskTypeId ?? null,
          taskStatus: task.taskStatus,
          homePageId: task.homePageId,
          pipelineId: task.pipelineId,
          groupId: task.groupId,
          taskPayload: task.taskPayload,
        }, { emitEvent: false });
        const existing = task.xmlTagsInfo ?? task.tagsInfo ?? [];
        this.tags.clear();
        for (const tag of existing) this.addTag(tag);
        if (!this.tags.length) this.addTag();
        this.loadFormForPipeline((task.pipelineId ?? '').trim());
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

  /**
   * Fetches the form the chosen pipeline expects, if it has one.
   *
   * A pipeline with no form is the normal case and comes back as a success with null data, so
   * the absence is not treated as a failure -- the tag table simply stays as it was.
   */
  private loadFormForPipeline(pipelineId: string): void {
    if (pipelineId === this.loadedFormPipeline) return;
    this.loadedFormPipeline = pipelineId;

    if (!pipelineId) {
      this.clearForm();
      return;
    }
    this.formLoading.set(true);
    this.http.get<ApiResponse<TaskForm>>(`${API_BASE}/taskForm.json/formForPipeline`,
      { params: { pipelineId } }).subscribe({
      next: response => {
        this.formLoading.set(false);
        // Guard against a slow response for a pipeline the user has since moved off.
        if (this.loadedFormPipeline !== pipelineId) return;
        if (response.status !== API_SUCCESS || !response.data) {
          this.clearForm();
          return;
        }
        this.taskFormDef.set(response.data);
        this.buildFormControls();
        // Tucked away once a form is answering for them, but one click from view: a form
        // describes the tags its author thought of, and a task can legitimately need others.
        this.showTags.set(false);
      },
      error: () => {
        this.formLoading.set(false);
        if (this.loadedFormPipeline === pipelineId) this.clearForm();
      },
    });
  }

  private clearForm(): void {
    this.taskFormDef.set(null);
    for (const name of Object.keys(this.formData.controls)) {
      this.formData.removeControl(name, { emitEvent: false });
    }
    this.showTags.set(true);
  }

  /** Stable control name for a field. Two fields can share a tagKey under different parents. */
  controlName(field: TaskFormField): string {
    return `${field.tagParent ?? ''}|${field.tagKey}`;
  }

  /**
   * Builds one control per field and seeds it from whatever the task already has.
   *
   * An existing task's tags win over the field's default: the default describes a new task, and
   * overwriting a saved value with it would quietly undo somebody's edit on first open.
   */
  private buildFormControls(): void {
    for (const name of Object.keys(this.formData.controls)) {
      this.formData.removeControl(name, { emitEvent: false });
    }
    for (const field of this.formFields()) {
      const existing = this.findTag(field);
      const seed = existing ?? field.defaultValue ?? '';
      const control = this.fb.control(
        field.fieldType === 'checkbox' ? seed === 'true' : seed,
        field.required ? [Validators.required] : []);
      this.formData.addControl(this.controlName(field), control, { emitEvent: false });
    }
    this.syncFormToTags();
  }

  private findTag(field: TaskFormField): string | null {
    const parent = (field.tagParent ?? '').trim();
    for (const group of this.tags.controls) {
      const value = group.getRawValue();
      if ((value.tagKey ?? '').trim() === field.tagKey
          && (value.tagParent ?? '').trim() === parent) {
        return value.tagValue ?? '';
      }
    }
    return null;
  }

  /**
   * Writes the form's answers into the tag rows.
   *
   * The form does not replace the tags, it authors them -- which is what keeps the XML preview,
   * the payload button and the save request working with no knowledge of forms at all. Rows the
   * form does not own are left alone, so a hand-added tag survives.
   */
  syncFormToTags(): void {
    for (const field of this.formFields()) {
      const control = this.formData.get(this.controlName(field));
      if (!control) continue;
      const raw = control.value;
      const value = field.fieldType === 'checkbox' ? String(!!raw) : String(raw ?? '');
      const parent = (field.tagParent ?? '').trim();

      const match = this.tags.controls.find(group => {
        const current = group.getRawValue();
        return (current.tagKey ?? '').trim() === field.tagKey
            && (current.tagParent ?? '').trim() === parent;
      });

      if (!value) {
        // A blank answer means no tag at all rather than an empty one: an empty
        // <search_term/> is not the same thing to a consumer as its absence.
        if (match) this.tags.removeAt(this.tags.controls.indexOf(match), { emitEvent: false });
        continue;
      }
      if (match) {
        match.get('tagValue')!.setValue(value, { emitEvent: false });
      } else {
        this.tags.push(this.fb.group({
          tagKey: [field.tagKey],
          tagParent: [parent],
          tagValue: [value],
        }), { emitEvent: false });
      }
    }
    // A blank starter row is added on a new task; once a form has filled things in it is just
    // an empty element in the generated XML.
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const value = this.tags.at(i).getRawValue();
      if (!(value.tagKey ?? '').trim() && !(value.tagValue ?? '').trim()) {
        this.tags.removeAt(i, { emitEvent: false });
      }
    }
    if (!this.tags.length) this.addTag();
  }

  /** Choices for a select field. The author writes them one per line. */
  fieldChoices(field: TaskFormField): string[] {
    return (field.fieldOptions ?? '').split('\n').map(o => o.trim()).filter(Boolean);
  }

  save(): void {
    this.submitted.set(true);
    // Belt and braces: the fields sync as they are typed, but a value restored by the browser
    // or set programmatically would not have fired an input event.
    if (this.taskFormDef()) this.syncFormToTags();
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
