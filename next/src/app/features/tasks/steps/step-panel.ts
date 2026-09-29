import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { Field } from '../../../shared/ui/field';
import { SchemaForm } from './schema-form';
import {
  LIMITS, ON_ERRORS, Step, StepProblem, StepTaskEntry, canonicalStep, fieldsOf, onErrorLabel, parseJson, problemsAt, taskLabel,
  validKey,
} from './steps.model';

export interface StepPanelData {
  step: Step;
  index: number;
  /** The step's task in the registry; absent when the registry no longer has it (the server will say so). */
  task?: StepTaskEntry;
  /** The keys of the steps before it: what it may read. */
  earlierKeys: string[];
  /** The server's problems with this step, at paths relative to it ("retry.maxAttempts", "config.columns"). */
  problems: StepProblem[];
  /** The settings' on-error, for what "Default" means here. */
  defaultOnError?: string;
  canManage: boolean;
}

type ConfigMode = 'form' | 'json';

/**
 * One step of the builder in the wide side panel (MIG-249): what it is called, what it reads, how often it is tried,
 * how long a try may take, what its failure means, and its task's settings -- drawn from the task's configSchema
 * when the Task Registry gives one (MIG-231), as raw JSON otherwise, and switchable to raw JSON always. Apply hands
 * the edited step back; the builder's Save is what writes it.
 */
@Component({
  selector: 'app-step-panel',
  imports: [SidePanel, Icon, Field, SchemaForm],
  templateUrl: './step-panel.html',
})
export class StepPanel {
  readonly ref = inject<DialogRef<Step>>(DialogRef);
  readonly data = inject<StepPanelData>(DIALOG_DATA);

  readonly limits = LIMITS;
  readonly onErrors = ON_ERRORS;
  readonly onErrorText = onErrorLabel;
  readonly readOnly = !this.data.canManage;

  readonly edit = signal<Step>(structuredClone(this.data.step));
  /** Whether the task's schema can draw a form at all: an object with at least one setting. */
  readonly hasForm = !!this.data.task?.configSchema && fieldsOf(this.data.task.configSchema).length > 0;
  readonly configMode = signal<ConfigMode>(this.hasForm ? 'form' : 'json');
  readonly configText = signal(this.jsonOf(this.data.step.config));
  readonly configError = signal('');

  readonly heading = computed(() => `Step ${this.data.index + 1} · ${this.edit().key || 'no key'}`);
  readonly subtitle = computed(() => [taskLabel(this.data.task, this.data.step.task), this.data.task?.description].filter(Boolean).join(' · '));
  readonly keyError = computed(() => {
    const server = problemsAt(this.data.problems, 'key');
    if (server.length) return server.join(' · ');
    return validKey(this.edit().key) ? '' : 'Lower case letters, digits and _, starting with a letter.';
  });
  readonly configProblems = computed(() => problemsAt(this.data.problems, 'config'));
  /** The config's problems re-pathed for the form, which sits at the config itself. */
  readonly formProblems = computed(() => this.data.problems
    .filter(p => p.field.startsWith('config.') || p.field.startsWith('config['))
    .map(p => ({ field: p.field.replace(/^config\.?/, ''), message: p.message })));
  /** The step's problems no field shows: the step as a whole, or its task. */
  readonly generalProblems = computed(() => this.data.problems.filter(p => p.field === '' || p.field === 'task')
    .map(p => (p.field ? `Task: ${p.message}` : p.message)));
  readonly defaultOnErrorText = computed(() => `Default (the pipeline's: ${onErrorLabel(this.data.defaultOnError || 'fail').toLowerCase()})`);

  problemsAt(field: string): string {
    return problemsAt(this.data.problems, field).join(' · ');
  }

  patch(change: Partial<Step>): void {
    this.edit.update(step => ({ ...step, ...change }));
  }

  /** A number box: blank is absent (the default), anything else a whole number. */
  whole(raw: string): number | null {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  setRetry(field: 'maxAttempts' | 'delaySeconds', raw: string): void {
    this.edit.update(step => ({ ...step, retry: { ...(step.retry ?? {}), [field]: this.whole(raw) } }));
  }

  setConfig(config: Record<string, unknown>): void {
    this.patch({ config });
  }

  typeConfig(text: string): void {
    this.configText.set(text);
    const parsed = parseJson(text);
    if (parsed.error) { this.configError.set(`Not JSON: ${parsed.error}`); return; }
    if (parsed.value !== undefined && (typeof parsed.value !== 'object' || Array.isArray(parsed.value) || parsed.value === null)) {
      this.configError.set('The settings are an object: { "name": value, … }.');
      return;
    }
    this.configError.set('');
    this.patch({ config: parsed.value as Record<string, unknown> | undefined });
  }

  toggleMode(): void {
    if (this.configMode() === 'form') {
      this.configText.set(this.jsonOf(this.edit().config));
      this.configError.set('');
      this.configMode.set('json');
    } else if (!this.configError()) {
      this.configMode.set('form');
    }
  }

  apply(): void {
    if (this.readOnly || this.configError()) return;
    const step = { ...this.edit() };
    if (step.retry && step.retry.maxAttempts == null && step.retry.delaySeconds == null) delete step.retry;
    this.ref.close(canonicalStep(step));
  }

  close(): void { this.ref.close(); }

  private jsonOf(config: unknown): string {
    return config === undefined || config === null ? '' : JSON.stringify(config, null, 2);
  }
}
