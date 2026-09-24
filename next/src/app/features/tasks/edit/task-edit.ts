import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { parseTopicPartition } from '../../../shared/ui/topic';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { Icon } from '../../../shared/ui/icon';
import { FieldChoice, Pipeline, PipelineField, parseFieldChoices } from '../../settings/pipelines/pipeline-dialog';
import { TaskReference, TaskReferenceKind } from '../../settings/configuration/configuration.models';

@Component({
  selector: 'app-task-edit',
  imports: [Icon, ReactiveFormsModule, RouterLink, Field, Combobox],
  templateUrl: './task-edit.html',
})
export class TaskEdit implements OnInit {
  readonly taskDetailId = input<string>('');

  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly taskTypes = signal<any[]>([]);
  private pendingTopicSeed: { topicId: number; tenantId: number | null } | null = null;
  /**
   * What the Group and Home page boxes offer: the workspace's task groups and home pages
   * (setting.json/taskReferences, MIG-167). They were sub-lookups of the generic Lookups table
   * until that was retired; the ids carried over, so a saved groupId/homePageId still matches.
   */
  readonly groups = signal<TaskReference[]>([]);
  readonly homePages = signal<TaskReference[]>([]);
  /**
   * The pipelines a form exists for -- Pipelines is the catalogue now, not a lookup type.
   * Creating a pipeline's form is what makes it choosable here; there is no other way to add one.
   */
  readonly pipelines = signal<Pipeline[]>([]);
  readonly saving = signal(false);
  readonly loading = signal(false);
  readonly submitted = signal(false);

  /**
   * The form this task's pipeline expects, when somebody has defined one.
   *
   * There is no more hand-written "Configuration tags" table (removed 2026-09-07): a pipeline is
   * now defined by creating its Pipeline Form, so filling in the task IS filling in the form.
   * The tag rows this used to expose for direct editing still exist -- `xmlTagsInfo` is still
   * what the server stores and what `xmlCreateChecker` still turns into the payload -- they are
   * just no longer a screen the operator sees or touches; the form's fields are the only surface.
   */
  readonly pipelineDef = signal<Pipeline | null>(null);
  readonly formLoading = signal(false);

  /** The fields in the order their author put them in; `position` is not guaranteed sorted. */
  readonly formFields = computed(() =>
    [...(this.pipelineDef()?.fields ?? [])].sort((a, b) => a.position - b.position));

  /** Which pipeline the currently loaded form belongs to, so the same fetch is not repeated. */
  private loadedFormPipeline: string | null = null;

  /**
   * The tenant that owns the task being edited, sent with the form lookup.
   *
   * Only a platform administrator can see across tenants, and two tenants may each hold a form for the
   * same pipeline id -- the id is the worker's routing key, not a unique name. Without saying
   * which tenant's task this is, the server had to guess, and picking the wrong one wrote that
   * form's fields into this task's tags on save.
   */
  private taskTenantId: number | null = null;

  readonly isEdit = computed(() => !!this.taskDetailId());

  readonly form: FormGroup = this.fb.group({
    taskDetailId: [null],
    taskName: ['', Validators.required],
    sourceTaskTypeId: [null, Validators.required],
    taskStatus: ['Active', Validators.required],
    homePageId: [''],
    pipelineId: [''],
    groupId: [''],
    // Required only when no pipeline form is driving the task -- see the validator swap in
    // loadFormForPipeline/clearForm. A form-driven task generates its payload on save instead.
    taskPayload: ['', Validators.required],
    tags: this.fb.array([]),
    // Filled in from the pipeline's form when there is one. Its controls write through to
    // `tags`, which `save()` turns into the payload -- the operator never edits either directly.
    formData: this.fb.group({}),
  });

  get tags(): FormArray { return this.form.get('tags') as FormArray; }

  get formData(): FormGroup { return this.form.get('formData') as FormGroup; }

  /**
   * Topics are picked profile-first: the Kafka connection (a hundred or so rows, the same
   * rail the Kafka & Topics screen has), then one of the topics that publish through it
   * (about a hundred more), then the pipeline. Ten thousand topics in one box was the
   * alternative. The profile is a step in the pick, not part of the task -- the task keeps
   * only its topic.
   */
  readonly profiles = signal<{ kafkaConnectionProfileId: number; profileName: string; environmentLabel?: string; isDefault?: boolean; tenantId?: number | null; tenantName?: string }[]>([]);
  readonly selectedProfileId = signal<number | null>(null);
  readonly topicsLoading = signal(false);
  /** The topic the task was opened with, named before its profile's list has arrived. */
  readonly loadedTopicLabel = signal('');
  readonly profileOptions = computed<ComboboxOption[]>(() => this.profiles().map(p => ({
    value: String(p.kafkaConnectionProfileId),
    label: p.profileName,
    hint: [p.environmentLabel, p.tenantName, p.isDefault ? 'default' : ''].filter(Boolean).join(' · '),
  })));

  /** A pick in the profile box: its topics replace the list, and a topic not on it is cleared. */
  pickProfile(id: string): void {
    const next = id ? Number(id) : null;
    if (next === this.selectedProfileId()) return;
    this.selectedProfileId.set(next);
    if (this.form.get('sourceTaskTypeId')!.value != null) this.form.patchValue({ sourceTaskTypeId: null, pipelineId: '' });
    this.loadTopicsFor(next);
  }

  private topicsTicket = 0;
  private loadTopicsFor(profileId: number | null): void {
    const ticket = ++this.topicsTicket;
    if (profileId == null) { this.taskTypes.set([]); this.topicsLoading.set(false); return; }
    this.topicsLoading.set(true);
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/setting.json/topics`,
      { params: { kafkaConnectionProfileId: profileId } }).subscribe({
      next: response => {
        if (ticket !== this.topicsTicket) return;
        this.topicsLoading.set(false);
        if (response.status === API_SUCCESS) this.taskTypes.set(response.data ?? []);
        else this.toast.error(response.message);
      },
      error: () => { if (ticket === this.topicsTicket) { this.topicsLoading.set(false); this.toast.error('Could not load the topics.'); } },
    });
  }

  /**
   * An edited task names a topic; the profile box has to land on that topic's profile so the
   * list it opens with contains it. The topic row says which profile; an unrouted topic (none)
   * rides on the workspace's default profile, the same rule the Kafka pane applies.
   */
  private seedProfileForTopic(topicId: number, tenantId: number | null): void {
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/setting.json/topics`, { params: { ids: topicId } }).subscribe({
      next: response => {
        const row = response.status === API_SUCCESS ? (response.data ?? [])[0] : undefined;
        if (!row) return;
        this.loadedTopicLabel.set(row.serviceName ?? '');
        const profileId: number | null = row.kafkaConnectionProfileId
          ?? this.profiles().find(p => p.isDefault && (tenantId == null || p.tenantId === tenantId))?.kafkaConnectionProfileId
          ?? null;
        if (profileId == null) return;
        this.selectedProfileId.set(profileId);
        this.loadTopicsFor(profileId);
      },
      error: () => {},
    });
  }

  ngOnInit(): void {
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/kafkaConnectionProfile.json/fetchAllProfiles`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const rows = (response.data ?? []).filter((p: any) => p.status !== 'Delete');
        this.profiles.set(rows);
        // A new task starts on the workspace's default connection when there is exactly one
        // to start on; a platform administrator, who sees every workspace's, picks.
        if (!this.isEdit() && this.selectedProfileId() == null) {
          const defaults = rows.filter((p: any) => p.isDefault);
          if (defaults.length === 1) { this.selectedProfileId.set(defaults[0].kafkaConnectionProfileId); this.loadTopicsFor(defaults[0].kafkaConnectionProfileId); }
        }
        // An edited task's topic may have arrived before the profiles did.
        const pending = this.pendingTopicSeed;
        if (pending) { this.pendingTopicSeed = null; this.seedProfileForTopic(pending.topicId, pending.tenantId); }
      },
      error: () => this.toast.error('Could not load the Kafka connections.'),
    });

    // A new task has no workspace yet to ask for; an edited one asks once loadTask knows its tenant.
    if (!this.isEdit()) this.loadReferences(null);


    // A pipeline chosen by hand loads its form straight away. Editing an existing task goes
    // through loadTask instead, which has to wait for the tags before it can prefill.
    this.form.get('pipelineId')!.valueChanges.subscribe(pipelineId => {
      this.loadFormForPipeline((pipelineId ?? '').trim());
    });

    // The topic decides which pipelines may be picked. Changing it to one the current pipeline
    // does not publish on clears the pipeline rather than leaving a pair that cannot dispatch.
    this.form.get('sourceTaskTypeId')!.valueChanges.subscribe(topicId => {
      this.topicVersion.set('changes');
      const current = (this.form.get('pipelineId')!.value ?? '').trim();
      if (!current) return;
      const stillValid = this.pipelines().some(p => p.pipelineId === current && p.sourceTaskTypeId === topicId);
      if (!stillValid) this.form.patchValue({ pipelineId: '' });
    });

    if (this.isEdit()) this.loadTask();
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
        this.topicFromLoad.set(task.sourceTaskType?.sourceTaskTypeId ?? null);
        this.topicVersion.set('load');
        this.taskTenantId = task.tenantId ?? null;
        this.loadReferences(this.taskTenantId);
        const topicId = task.sourceTaskType?.sourceTaskTypeId ?? null;
        if (topicId != null) {
          // The profile list decides where an unrouted topic lands; wait for it if it is not here yet.
          if (this.profiles().length) this.seedProfileForTopic(topicId, this.taskTenantId);
          else this.pendingTopicSeed = { topicId, tenantId: this.taskTenantId };
        }
        const existing = task.xmlTagsInfo ?? task.tagsInfo ?? [];
        this.tags.clear();
        for (const tag of existing) this.pushTagRow(tag);
        this.loadFormForPipeline((task.pipelineId ?? '').trim());
      },
      error: err => {
        this.loading.set(false);
        this.toast.error(err?.error?.message || 'That task could not be loaded.');
      },
    });
  }

  /**
   * Loads the Group and Home page choices. The task's own workspace is named when it is known:
   * a platform administrator sees every workspace's otherwise, and a task may only point at its
   * own. A tenant administrator's request carries it too, and the server ignores it -- theirs
   * is the only workspace it will answer for.
   */
  private loadReferences(tenantId: number | null): void {
    const fetch = (kind: TaskReferenceKind, into: (rows: TaskReference[]) => void) => {
      const params: Record<string, string> = { kind };
      if (tenantId != null) params['tenantId'] = String(tenantId);
      this.http.get<ApiResponse<TaskReference[]>>(`${API_BASE}/setting.json/taskReferences`, { params }).subscribe({
        next: response => { if (response.status === API_SUCCESS) into(response.data ?? []); },
        error: () => this.toast.error(kind === 'HOME_PAGE' ? 'Could not load the home pages.' : 'Could not load the task groups.'),
      });
    };
    fetch('TASK_GROUP', rows => this.groups.set(rows));
    fetch('HOME_PAGE', rows => this.homePages.set(rows));
  }

  /** Internal only -- there is no more UI that adds, removes or edits a tag row by hand. */
  private pushTagRow(tag?: any): void {
    this.tags.push(this.fb.group({
      tagKey: [tag?.tagKey ?? ''],
      tagParent: [tag?.tagParent ?? ''],
      tagValue: [tag?.tagValue ?? ''],
    }));
  }

  /**
   * Pre-shaped rows for the Pipeline/Group/Home page combo-boxes.
   *
   * `Combobox` takes plain `{value, label, hint}` data rather than accessor functions -- binding
   * a component input directly to a function-typed class property crashes this Angular version's
   * template compiler ("Expected i18n meta to be a Message, but got: Function"), confirmed by
   * bisection, not assumed. Shaping the data here instead sidesteps it entirely.
   */
  /** Topics as combobox rows: name first, Kafka topic as the searchable hint. */
  readonly topicOptions = computed<ComboboxOption[]>(() => this.taskTypes().map((t: any) => ({
    value: String(t.sourceTaskTypeId),
    label: t.serviceName,
    hint: parseTopicPartition(t.queueTopicPartition).topic,
  })));

  /**
   * The chosen topic, as a signal, so the pipeline list can follow it.
   *
   * Fed from valueChanges AND set by hand in loadTask: that patch runs with emitEvent:false
   * (see there), so without the explicit set an edited task opened with an empty pipeline list
   * and its pipeline shown as a bare id -- the first thing found when the box became a
   * combobox.
   */
  private readonly topicFromChanges = toSignal(this.form.get('sourceTaskTypeId')!.valueChanges,
    { initialValue: this.form.get('sourceTaskTypeId')!.value as number | null });
  private readonly topicFromLoad = signal<number | null | undefined>(undefined);
  readonly selectedTopicId = computed<number | null>(() => {
    const changed = this.topicFromChanges();
    const loaded = this.topicFromLoad();
    // The most recent source wins: a load seeds it, a later pick overrides it.
    return this.topicVersion() === 'load' ? (loaded ?? null) : (changed ?? null);
  });
  private readonly topicVersion = signal<'load' | 'changes'>('changes');

  /**
   * The chosen topic's pipelines are fetched when it is chosen (pipeline.json/listForTopic)
   * rather than every pipeline up front: listPipelines carried all of them, fields included,
   * to fill a box that only ever shows one topic's. A late answer for a topic the person has
   * since moved off is dropped.
   */
  readonly pipelinesLoading = signal(false);
  private readonly pipelinesFetched = effect(() => {
    const topic = this.selectedTopicId();
    untracked(() => {
      if (topic == null) { this.pipelines.set([]); return; }
      this.pipelinesLoading.set(true);
      this.http.get<ApiResponse<Pipeline[]>>(`${API_BASE}/pipeline.json/listForTopic`,
        { params: { sourceTaskTypeId: topic } }).subscribe({
        next: response => {
          if (this.selectedTopicId() !== topic) return;
          this.pipelinesLoading.set(false);
          if (response.status === API_SUCCESS) this.pipelines.set(response.data ?? []);
        },
        // Not fatal: the Pipeline field just offers nothing to pick until a retry.
        error: () => { if (this.selectedTopicId() === topic) this.pipelinesLoading.set(false); },
      });
    });
  });

  /** Only the pipelines that publish on the chosen topic; nothing until a topic is chosen. */
  readonly pipelinesForTopic = computed<Pipeline[]>(() => {
    const topic = this.selectedTopicId();
    if (topic == null) return [];
    // An Inactive pipeline is not offered for new work, but a task already on it keeps
    // resolving its label rather than showing a bare id.
    const current = (this.form.get('pipelineId')!.value ?? '').trim();
    return this.pipelines().filter(p => p.sourceTaskTypeId === topic
      && (p.status !== 'Inactive' || p.pipelineId === current));
  });

  readonly pipelineOptions = computed<ComboboxOption[]>(() => this.pipelinesForTopic().map(p => ({
    value: p.pipelineId ?? '',
    label: `${p.pipelineName} (${p.pipelineId})`,
    hint: p.description ?? '',
  })));

  /** What the Pipeline field says under itself, given where the person is in the two-step pick. */
  readonly pipelineHint = computed(() => {
    if (this.selectedTopicId() == null) return 'Pick a topic first; its pipelines appear here.';
    if (this.pipelinesLoading()) return 'Loading this topic’s pipelines…';
    if (!this.pipelinesForTopic().length) return 'No pipeline publishes on this topic yet — add one under Configuration › Pipelines.';
    return 'Picking one loads its form below, if it has one.';
  });

  /** Group and Home page rows: the id as the value (the wire keeps it a string), the name, then its value. */
  readonly groupOptions = computed<ComboboxOption[]>(() => this.groups().map(toReferenceOption));
  readonly homePageOptions = computed<ComboboxOption[]>(() => this.homePages().map(toReferenceOption));

  /**
   * Fetches the form the chosen pipeline expects, if it has one.
   *
   * A pipeline with no form is the normal case and comes back as a success with null data, so
   * the absence is not treated as a failure -- the task falls back to a hand-written payload.
   */
  private loadFormForPipeline(pipelineId: string): void {
    if (pipelineId === this.loadedFormPipeline) return;
    this.loadedFormPipeline = pipelineId;

    if (!pipelineId) {
      this.clearForm();
      return;
    }
    this.formLoading.set(true);
    const params: Record<string, string> = { pipelineId };
    if (this.taskTenantId != null) params['tenantId'] = String(this.taskTenantId);
    this.http.get<ApiResponse<Pipeline>>(`${API_BASE}/pipeline.json/definition`,
      { params }).subscribe({
      next: response => {
        this.formLoading.set(false);
        // Guard against a slow response for a pipeline the user has since moved off.
        if (this.loadedFormPipeline !== pipelineId) return;
        if (response.status !== API_SUCCESS || !response.data) {
          this.clearForm();
          return;
        }
        this.pipelineDef.set(response.data);
        this.buildFormControls();
        // The payload is generated from the form's answers on save now, not hand-written --
        // required only falls to the box itself when there is no form driving it.
        this.form.get('taskPayload')!.clearValidators();
        this.form.get('taskPayload')!.updateValueAndValidity({ emitEvent: false });
      },
      error: () => {
        this.formLoading.set(false);
        if (this.loadedFormPipeline === pipelineId) this.clearForm();
      },
    });
  }

  private clearForm(): void {
    this.pipelineDef.set(null);
    for (const name of Object.keys(this.formData.controls)) {
      this.formData.removeControl(name, { emitEvent: false });
    }
    // No form to generate a payload from any more -- back to requiring a hand-written one.
    this.form.get('taskPayload')!.setValidators(Validators.required);
    this.form.get('taskPayload')!.updateValueAndValidity({ emitEvent: false });
  }

  /** Stable control name for a field. Two fields can share a tagKey under different parents. */
  controlName(field: PipelineField): string {
    return `${field.tagParent ?? ''}|${field.tagKey}`;
  }

  /**
   * Builds one control per field and seeds it from whatever the task already has.
   *
   * An existing task's tags win over the field's default: the default describes a new task, and
   * overwriting a saved value with it would quietly undo somebody's edit on first open.
   */
  /** "<claim_id> and <document>" -- what an AI step reads, from its variable map. */
  aiStepReads(field: PipelineField): string {
    try {
      const tags = Object.values(JSON.parse(field.variableMap || '{}') as Record<string, string>).filter(Boolean);
      return tags.length ? tags.map(t => t.startsWith('object:') ? 'each object in the input folder' : t.startsWith('file:') ? `the file <${t.slice(5)}> names` : `<${t}>`).filter((v, i, a) => a.indexOf(v) === i).join(' and ') : '';
    } catch { return ''; }
  }

  private buildFormControls(): void {
    for (const name of Object.keys(this.formData.controls)) {
      this.formData.removeControl(name, { emitEvent: false });
    }
    // An AI step is the pipeline's, not the operator's: no control, no tag from this side.
    for (const field of this.formFields().filter(f => f.fieldType !== 'ai')) {
      const existing = this.findTag(field);
      const seed = existing ?? field.defaultValue ?? '';
      const control = this.fb.control(
        field.fieldType === 'checkbox' ? seed === 'true' : seed,
        field.required ? [Validators.required] : []);
      this.formData.addControl(this.controlName(field), control, { emitEvent: false });
    }
    this.syncFormToTags();
  }

  private findTag(field: PipelineField): string | null {
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
   * The form does not replace the tags, it authors them -- which is what keeps `xmlTagsInfo` and
   * the payload generation in `save()` working with no knowledge of forms at all. A tag the form
   * does not own (from before this task had a form) is left alone rather than dropped.
   */
  syncFormToTags(): void {
    for (const field of this.formFields()) {
      if (field.fieldType === 'ai') continue;
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
    // A row with neither a key nor a value is not a tag -- drop it rather than send it.
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const value = this.tags.at(i).getRawValue();
      if (!(value.tagKey ?? '').trim() && !(value.tagValue ?? '').trim()) {
        this.tags.removeAt(i, { emitEvent: false });
      }
    }
  }

  /**
   * Choices for a select field, as the value the tag carries and the label shown for it.
   *
   * The author writes them one per line, and on each line an optional first `=` separates the
   * two -- `lines=JSON Lines (one object per line)`. This used to return plain strings and the
   * template bound the same one to both `[value]` and the option's text, which is why a dropdown
   * could either read sensibly or send something the worker understood, never both. A line with
   * no `=` is unchanged from that behaviour: the whole line is still value and label alike, which
   * is what keeps every task saved against an older form opening on its own answer.
   *
   * The trailing entry is a repair for the case where it does not: a tag already holding a value
   * that matches no choice (a renamed choice, or one of the comma-separated rows the ETL demo
   * seeder wrote) rendered as a completely blank dropdown, and the obvious fix -- picking
   * something, anything -- overwrote an answer the operator never saw. Carrying it as a labelled
   * option shows what the task actually holds instead of hiding it.
   */
  fieldChoices(field: PipelineField): FieldChoice[] {
    const choices = parseFieldChoices(field.fieldOptions);
    const current = String(this.formData.get(this.controlName(field))?.value ?? '').trim();
    if (current && !choices.some(choice => choice.value === current)) {
      return [...choices, { value: current, label: `${current} (not one of the choices)` }];
    }
    return choices;
  }

  save(): void {
    this.submitted.set(true);
    // Belt and braces: the fields sync as they are typed, but a value restored by the browser
    // or set programmatically would not have fired an input event.
    if (this.pipelineDef()) {
      this.syncFormToTags();
      // The payload is generated from the form's own answers below, never from whatever the
      // (hidden) box last held, so its own validity does not gate a form-driven save.
      this.form.get('formData')!.markAllAsTouched();
      if (this.form.get('formData')!.invalid || this.form.get('taskName')!.invalid
          || this.form.get('sourceTaskTypeId')!.invalid || this.form.get('taskStatus')!.invalid) {
        this.form.markAllAsTouched();
        this.toast.error('Check the highlighted fields.');
        return;
      }
      this.generatePayloadFromTags(xml => {
        if (xml == null) return; // generatePayloadFromTags already toasted why
        this.form.get('taskPayload')!.setValue(xml);
        this.submitTask();
      });
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    this.submitTask();
  }

  /**
   * Turns the tag rows a Pipeline Form authored into the document the worker actually receives.
   *
   * There is no more "Configuration tags" screen to preview this on demand (removed 2026-09-07,
   * along with the rest of the hand-edited tag table) -- the form's fields are the only surface,
   * so generating the payload has to happen here, on save, rather than waiting for a click that
   * no longer exists. Asking the server rather than assembling the document in the browser is
   * still deliberate: a second implementation would drift from the one that matters, and the
   * nesting rules for `tagParent` are more intricate than they look.
   */
  private generatePayloadFromTags(then: (xml: string | null) => void): void {
    const tags = (this.form.getRawValue().tags as any[])
      .filter(t => (t.tagKey ?? '').trim())
      .map(t => ({ tagKey: (t.tagKey ?? '').trim(),
                   tagParent: (t.tagParent ?? '').trim(),
                   tagValue: (t.tagValue ?? '').trim() }));
    if (!tags.length) {
      this.toast.error('Fill in at least one field before saving.');
      then(null);
      return;
    }
    this.saving.set(true);
    this.http.post<ApiResponse<string>>(`${API_BASE}/setting.json/xmlCreateChecker`,
      { xmlTagsInfo: tags }).subscribe({
      next: response => {
        // This endpoint returns the document in `message` rather than `data`.
        const xml = (response as any).message ?? response.data ?? '';
        if (response.status !== API_SUCCESS || !xml) {
          this.saving.set(false);
          this.toast.error(response.message || 'Those answers could not be turned into a payload.');
          then(null);
          return;
        }
        then(String(xml));
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'Those answers could not be turned into a payload.');
        then(null);
      },
    });
  }

  private submitTask(): void {
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
          this.router.navigate(['/operations/tasks']);
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

function toReferenceOption(ref: TaskReference): ComboboxOption {
  return {
    value: String(ref.id),
    label: ref.value ? `${ref.name} (${ref.value})` : ref.name,
    hint: ref.description ?? '',
  };
}
