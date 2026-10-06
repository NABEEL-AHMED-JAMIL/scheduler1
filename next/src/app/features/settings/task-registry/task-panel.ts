import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { StepsApi } from '../../tasks/steps/steps.service';
import { StepTaskEntry } from '../../tasks/steps/steps.model';
import { TaskStatePill, TaskSwitch } from '../../tasks/steps/task-switch';
import { SchemaFields } from './schema-fields';
import {
  RegistryRow, permissionLabel, readableSchema, retryText, schemaShape, stateOf, timeoutText,
} from './task-registry.model';

export interface TaskPanelData {
  row: RegistryRow;
  /** A workspace administrator: may switch a step task on or off here. */
  isAdmin: boolean;
  /** Told each switched task's new line, so the list behind the panel shows it too. */
  onSwitched?: (line: StepTaskEntry) => void;
}

/** What the panel closes with: 'edit' asks the page to open a Legacy row's pipeline in its dialog. */
export type TaskPanelResult = 'edit' | undefined;

/**
 * One task of the Task Registry (MIG-250), in the wide side panel: what it does, its settings (the config schema, as
 * a list to read), what it takes and gives, how it runs -- retry, timeout, who may use it, its AI tool name, the
 * service behind it -- and, for a workspace administrator, its switch. A Legacy row is an existing pipeline: its
 * payload fields and topic, and Edit pipeline, which the page opens in the pipeline dialog exactly as before.
 */
@Component({
  selector: 'app-task-panel',
  imports: [SidePanel, StatusPill, Icon, RouterLink, SchemaFields, TaskSwitch, TaskStatePill],
  template: `
    <app-side-panel [heading]="row().name" [subtitle]="subtitle()">
      <div class="flex flex-col gap-5 min-w-0">
        <div class="flex flex-wrap items-start gap-2">
          <span class="pill" [class.pill-neutral]="!row().legacy" [class.pill-solid-neutral]="row().legacy" [attr.data-kind]="row().kind">{{ row().kind }}</span>
          <app-task-state class="min-w-0" [state]="row().state" [reason]="row().reason" [overridden]="row().overridden" />
        </div>
        @if (row().description) { <p class="text-sm text-[color:var(--text-secondary)] [overflow-wrap:anywhere]">{{ row().description }}</p> }

        @if (pipeline(); as p) {
          <section class="flex flex-col gap-2 min-w-0" aria-labelledby="task-panel-pipeline">
            <h3 id="task-panel-pipeline" class="text-sm font-semibold">Pipeline</h3>
            <dl class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt class="text-[color:var(--text-muted)]">Pipeline ID</dt><dd><span class="pipeline-id-chip">{{ p.pipelineId }}</span></dd>
              <dt class="text-[color:var(--text-muted)]">Topic</dt>
              <dd class="min-w-0">
                @if (p.topicName) {
                  <a class="link-inline" [routerLink]="['/configuration/kafka']" [queryParams]="p.kafkaConnectionProfileId ? { profileId: p.kafkaConnectionProfileId } : {}"
                     (click)="ref.close()">{{ p.topicName }}</a>
                  @if (p.kafkaTopic) { <span class="mono text-[color:var(--text-muted)] ml-1">{{ p.kafkaTopic }}</span> }
                } @else {
                  <span class="pill pill-warn" title="Assign a topic; a task cannot pick this pipeline until then">No topic</span>
                }
              </dd>
              <dt class="text-[color:var(--text-muted)]">Status</dt><dd><app-status [label]="p.status || 'Active'" [quiet]="true" /></dd>
              @if (p.createdByName) { <dt class="text-[color:var(--text-muted)]">Created by</dt><dd class="[overflow-wrap:anywhere]">{{ p.createdByName }}</dd> }
              @if (p.updatedByName) { <dt class="text-[color:var(--text-muted)]">Updated by</dt><dd class="[overflow-wrap:anywhere]">{{ p.updatedByName }}</dd> }
            </dl>
            <h4 class="text-xs font-semibold text-[color:var(--text-secondary)] mt-2">Payload fields</h4>
            @if (p.fields) {
              <ul class="pipeline-fields">
                @for (field of p.fields; track field.pipelineFieldId ?? field.tagKey) {
                  <li>
                    <span class="mono">{{ field.tagKey }}</span>
                    <span class="pipeline-field-label truncate" [title]="field.helpText || ''">{{ field.label }}</span>
                    <span class="pipeline-field-meta">{{ field.fieldType }}@if (field.required) { · required }@if (field.tagParent) { · in {{ field.tagParent }} }</span>
                  </li>
                } @empty {
                  <li class="text-[color:var(--text-muted)]">No fields: a task on it is written as raw tags.</li>
                }
              </ul>
            } @else {
              <p class="text-sm text-[color:var(--text-muted)]">{{ p.fieldCount ?? 0 }} field(s), {{ p.requiredCount ?? 0 }} required.</p>
            }
            <p class="field-note text-[color:var(--text-muted)]">Always on: an existing pipeline stays runnable. Its topic, fields and AI steps are edited in its dialog.</p>
          </section>
        } @else if (data.isAdmin) {
          <section class="flex flex-col gap-2" aria-labelledby="task-panel-switch">
            <h3 id="task-panel-switch" class="text-sm font-semibold">In this workspace</h3>
            <div class="flex items-center gap-3">
              <p class="text-sm text-[color:var(--text-secondary)] flex-1 min-w-0">
                {{ task().enabled ? 'On: Add step offers it in every pipeline here.' : 'Off: Add step does not offer it here.' }}
                @if (task().overridable === false) { It cannot be switched. }
                @else if (task().available === false && !task().enabled) { It cannot be switched on until the platform can run it. }
                @else { {{ task().enabledByDefault === false ? 'Off by default.' : 'On by default.' }} }
              </p>
              <app-task-switch [task]="task()" [busy]="switching()" (switched)="switchTo($event)" />
            </div>
          </section>
        }

        <section class="flex flex-col gap-1 min-w-0" aria-labelledby="task-panel-settings">
          <h3 id="task-panel-settings" class="text-sm font-semibold">Settings</h3>
          <p class="field-note text-[color:var(--text-muted)]">What a step running it is configured with.</p>
          <app-schema-fields [fields]="settings()" />
        </section>

        <section class="grid sm:grid-cols-2 gap-4 min-w-0" aria-label="Input and output">
          @for (io of ioSides(); track io.label) {
            <div class="min-w-0">
              <h3 class="text-sm font-semibold">{{ io.label }}</h3>
              <p class="text-sm mt-1">{{ io.shape }}</p>
              @if (io.description) { <p class="text-xs text-[color:var(--text-secondary)] mt-0.5 [overflow-wrap:anywhere]">{{ io.description }}</p> }
            </div>
          }
        </section>

        <section class="flex flex-col gap-2 min-w-0" aria-labelledby="task-panel-runs">
          <h3 id="task-panel-runs" class="text-sm font-semibold">How it runs</h3>
          <dl class="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            <dt class="text-[color:var(--text-muted)]">Service</dt><dd class="mono">{{ task().backingService || '—' }}</dd>
            <dt class="text-[color:var(--text-muted)]">Runs</dt><dd>{{ task().runsInEngine === false ? 'By its worker, outside the step engine' : 'In the step engine' }}</dd>
            <dt class="text-[color:var(--text-muted)]">Retry</dt><dd>{{ retry() }}</dd>
            <dt class="text-[color:var(--text-muted)]">Timeout</dt><dd>{{ timeout() }}</dd>
            <dt class="text-[color:var(--text-muted)]">Who may add it</dt><dd>{{ permission() }}</dd>
            <dt class="text-[color:var(--text-muted)]">AI tool name</dt><dd class="mono [overflow-wrap:anywhere]">{{ task().aiToolName || '—' }}</dd>
          </dl>
        </section>
      </div>
      <div foot>
        @if (pipeline() && data.isAdmin) {
          <button type="button" class="btn btn-primary btn-sm" (click)="ref.close('edit')"><app-icon name="edit" />Edit registry task</button>
        }
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="ref.close()">Close</button>
      </div>
    </app-side-panel>
  `,
})
export class TaskPanel {
  readonly ref = inject<DialogRef<TaskPanelResult>>(DialogRef);
  readonly data = inject<TaskPanelData>(DIALOG_DATA);
  private readonly api = inject(StepsApi);
  private readonly toast = inject(ToastService);

  /** The task's line as Core last said: a switch here replaces it. */
  readonly task = signal<StepTaskEntry>(this.data.row.task);
  readonly switching = signal(false);

  readonly row = computed<RegistryRow>(() => {
    const row = this.data.row;
    if (row.legacy) return row;
    const task = this.task();
    return { ...row, task, ...stateOf(task), overridden: !!task.overridden };
  });
  readonly pipeline = computed(() => this.data.row.pipeline ?? null);
  readonly subtitle = computed(() => `${this.row().kind} · ${this.row().code}`);
  readonly settings = computed(() => readableSchema(this.task().configSchema));
  readonly ioSides = computed(() => {
    const t = this.task();
    const legacy = this.row().legacy;
    const none = (side: 'in' | 'out') => (side === 'in' ? 'It starts the rows: nothing comes in.'
      : t.runsInEngine === false ? 'The worker does the rest: no rows come back to the steps.' : 'Nothing goes on to a next step.');
    return [
      { label: 'Input', shape: legacy ? this.row().input : schemaShape(t.inputSchema), description: t.inputSchema ? t.inputSchema.description ?? '' : none('in') },
      { label: 'Output', shape: legacy ? this.row().output : schemaShape(t.outputSchema), description: t.outputSchema ? t.outputSchema.description ?? '' : none('out') },
    ];
  });
  readonly retry = computed(() => retryText(this.task().retry));
  readonly timeout = computed(() => timeoutText(this.task().timeoutSeconds));
  readonly permission = computed(() => permissionLabel(this.task().requiredPermission));

  switchTo(enabled: boolean | null): void {
    if (!this.data.isAdmin || this.switching()) return;
    const code = this.task().code;
    this.switching.set(true);
    this.api.switchTask(code, enabled).subscribe({
      next: r => {
        this.switching.set(false);
        // A refusal hands the switch the same line afresh, so its box goes back to where it was.
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The task could not be switched.'); this.task.update(t => ({ ...t })); return; }
        this.toast.success(r.message || 'Switched.');
        if (r.data?.code) {
          this.task.update(t => ({ ...t, ...r.data }));
          this.data.onSwitched?.(r.data);
        }
      },
      error: err => {
        this.switching.set(false);
        this.toast.error(err?.error?.message || 'The task could not be switched.');
        this.task.update(t => ({ ...t }));
      },
    });
  }
}
