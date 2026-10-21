import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { PIPELINE_FIELDS, Topic } from '../../ai/assistant/create-pipeline';
import { pipelineIdOf } from '../../ai/assistant/flow.model';

/** A pipeline the copy may start from: its task, and the registry pipeline that holds its steps. */
export interface CopySource { taskDetailId: number; taskName: string; pipelineId?: string | null; taskStatus?: string; }

export type StartWith = 'assistant' | 'steps' | 'copy';

/** The task a new pipeline's steps hang on: the empty payload a step pipeline carries (Core's default too). */
export const STEP_PAYLOAD = '<data></data>';

/**
 * UX review 2026-10-12 (P3): a new pipeline starts from a choice, not from Kafka. New pipeline asked first for a Kafka
 * connection ("pick it first"), a topic, a registry task and a required XML payload; the AI Assistant, the easier way, was
 * not offered, and the steps came only after a save.
 *
 *   1. Describe it to the AI Assistant -- the description waits in the assistant's composer.
 *   2. Add steps yourself -- a name, then the step builder; the event source (topic) is under "Advanced" and optional.
 *   3. Copy an existing pipeline -- its steps copied into a pipeline of its own (not shared), starting inactive.
 *
 * The full form (topic, registry task, XML payload) stays one link away for a pipeline a Kafka message starts.
 */
@Component({
  selector: 'app-new-pipeline',
  imports: [Icon, RouterLink, PageHeader],
  template: `
    <div class="page">
      <app-page-header title="New pipeline" subtitle="Start from what it should do. A schedule, triggers and a review come after it is made." />

      @if (noWorkspace()) {
      <!-- A platform administrator's own sign-in has no workspace, and a pipeline is a workspace's: the topic list offered
           every workspace's topics, the first (another workspace's) was picked by itself, and Create answered "That topic
           belongs to another workspace" (owner 2026-10-20). Same guard as Workflows and the Task inbox. -->
      <div class="card p-10 flex flex-col items-center text-center gap-2" data-test="needs-workspace">
        <app-icon name="layers" size="1.5rem" class="icon-muted" />
        <p class="text-sm text-[color:var(--text-primary)]">Pipelines belong to a workspace, and this sign-in has none.</p>
        <p class="text-sm text-[color:var(--text-secondary)]">Open the workspace with "Work in this workspace" on Platform › Workspaces to build its pipelines.</p>
        <a routerLink="/platform/workspaces" class="btn btn-default btn-sm mt-2"><app-icon name="external" />Choose a workspace</a>
      </div>
      } @else {
      <div class="grid gap-4 lg:grid-cols-3 items-start" data-test="start-with">
        <!-- 1. The AI Assistant -->
        <section class="card p-4 flex flex-col gap-3 new-start" [class.is-on]="chosen() === 'assistant'" data-start="assistant">
          <div class="flex items-center gap-2">
            <span class="stat-glyph"><app-icon name="chat" /></span>
            <h2 class="text-base font-semibold">Describe it to the AI Assistant</h2>
          </div>
          <p class="text-sm text-[color:var(--text-secondary)]">Say in plain words what to read, what to work out and where the results go. The
            assistant drafts the steps; nothing is saved until you press Create.</p>
          @if (canAssistant()) {
            <label class="flex flex-col gap-1">
              <span class="label">What should it do?</span>
              <textarea id="newPipelineAsk" class="input" rows="4" maxlength="4000" data-test="assistant-ask"
                        placeholder="Read the daily admissions file, flag readmissions within 30 days, and keep a dataset for the dashboard."
                        [value]="ask()" (input)="ask.set($any($event.target).value)" (focus)="chosen.set('assistant')"></textarea>
            </label>
            <div class="flex justify-end">
              <button type="button" class="btn btn-primary btn-sm" data-test="to-assistant" (click)="toAssistant()">
                <app-icon name="chat" />Open the AI Assistant</button>
            </div>
          } @else {
            <p class="text-xs text-[color:var(--text-muted)]">The AI Assistant is not part of your access.</p>
          }
        </section>

        <!-- 2. Steps -->
        <section class="card p-4 flex flex-col gap-3 new-start" [class.is-on]="chosen() === 'steps'" data-start="steps">
          <div class="flex items-center gap-2">
            <span class="stat-glyph"><app-icon name="layers" /></span>
            <h2 class="text-base font-semibold">Add steps yourself</h2>
          </div>
          <p class="text-sm text-[color:var(--text-secondary)]">Name it, then pick its steps in the step builder: read, check, transform, ask
            an AI model, review and write.</p>
          <label class="flex flex-col gap-1">
            <span class="label">Name <span class="text-[color:var(--crit-text)]">*</span></span>
            <input id="newPipelineName" class="input" maxlength="120" data-test="steps-name" placeholder="Readmission risk (daily)"
                   [value]="name()" (input)="name.set($any($event.target).value)" (focus)="chosen.set('steps')" />
          </label>
          <details class="text-sm" data-test="event-source">
            <summary class="cursor-pointer select-none text-[color:var(--text-secondary)] w-fit">Advanced: event source</summary>
            <div class="mt-2 flex flex-col gap-1">
              <label class="label" for="newPipelineTopic">Topic (optional)</label>
              <select id="newPipelineTopic" class="input" [value]="topicId() ?? ''" (change)="topicId.set(+$any($event.target).value || null)">
                @for (t of topics(); track t.sourceTaskTypeId) { <option [value]="'' + t.sourceTaskTypeId">{{ t.serviceName }}</option> }
              </select>
              <p class="field-note text-[color:var(--text-muted)]">Only for a pipeline a Kafka message starts. Left as it is, the workspace's own topic is used.</p>
            </div>
          </details>
          <div class="flex justify-end">
            <button type="button" class="btn btn-primary btn-sm" data-test="create-steps" [disabled]="busy() || !name().trim()" (click)="createWithSteps()">
              <app-icon name="plus" [busy]="busy() && chosen() === 'steps'" />Create and add steps</button>
          </div>
        </section>

        <!-- 3. Copy -->
        <section class="card p-4 flex flex-col gap-3 new-start" [class.is-on]="chosen() === 'copy'" data-start="copy">
          <div class="flex items-center gap-2">
            <span class="stat-glyph"><app-icon name="copy" /></span>
            <h2 class="text-base font-semibold">Copy an existing pipeline</h2>
          </div>
          <p class="text-sm text-[color:var(--text-secondary)]">Its steps are copied into a pipeline of its own, so a change to one never
            changes the other. The copy starts inactive.</p>
          <label class="flex flex-col gap-1">
            <span class="label">Pipeline to copy</span>
            <select id="newPipelineCopyFrom" class="input" data-test="copy-from" [value]="copyFrom() ?? ''" (focus)="chosen.set('copy')"
                    (change)="pickCopy(+$any($event.target).value || null)">
              <option value="">Choose…</option>
              @for (p of copyable(); track p.taskDetailId) { <option [value]="'' + p.taskDetailId">{{ p.taskName }}</option> }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="label">Name of the copy</span>
            <input id="newPipelineCopyName" class="input" maxlength="120" data-test="copy-name" [value]="copyName()" (input)="copyName.set($any($event.target).value)" />
          </label>
          <div class="flex justify-end">
            <button type="button" class="btn btn-primary btn-sm" data-test="create-copy" [disabled]="busy() || !copyFrom() || !copyName().trim()" (click)="createCopy()">
              <app-icon name="copy" [busy]="busy() && chosen() === 'copy'" />Copy it</button>
          </div>
        </section>
      </div>

      @if (error()) { <p class="text-sm text-crit-500" role="alert" data-test="new-error">{{ error() }}</p> }

      <p class="text-xs text-[color:var(--text-muted)]">A pipeline a Kafka message starts, with its own XML payload?
        <a class="link-inline" routerLink="/pipelines/new/form" data-test="full-form">Use the full form</a>.</p>
      }
    </div>
  `,
})
export class NewPipeline implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly chosen = signal<StartWith | null>(null);
  readonly ask = signal('');
  readonly name = signal('');
  readonly topics = signal<Topic[]>([]);
  readonly topicId = signal<number | null>(null);
  readonly sources = signal<CopySource[]>([]);
  readonly copyFrom = signal<number | null>(null);
  readonly copyName = signal('');
  readonly busy = signal(false);
  readonly error = signal('');

  readonly canAssistant = computed(() => this.auth.canOpen('ai-prompts'));
  /** A pipeline with steps of its own (a registry pipeline) can be copied; an XML-only task has none to copy. */
  readonly copyable = computed(() => this.sources().filter(p => !!p.pipelineId && p.taskStatus !== 'Delete'));

  /** A platform administrator's own sign-in: no workspace to put a pipeline in (they open one first). */
  readonly noWorkspace = computed(() => !this.auth.user()?.tenantId);

  ngOnInit(): void {
    if (this.noWorkspace()) return;
    this.http.get<ApiResponse<Topic[]>>(`${API_BASE}/setting.json/topics`, { params: { q: '', limit: 50 } }).subscribe({
      next: r => {
        const list = (r.status === API_SUCCESS ? r.data ?? [] : []).filter(t => (t.status ?? 'Active') === 'Active');
        this.topics.set(list);
        this.topicId.set(list[0]?.sourceTaskTypeId ?? null);
      },
      error: () => this.topics.set([]),
    });
    this.http.post<ApiResponse<CopySource[]>>(`${API_BASE}/sourceTask.json/listSourceTask`, {}, { params: { page: 1, limit: 1000 } }).subscribe({
      next: r => this.sources.set(r.status === API_SUCCESS ? (r.data ?? []).slice().sort((a, b) => a.taskName.localeCompare(b.taskName)) : []),
      error: () => this.sources.set([]),
    });
  }

  toAssistant(): void {
    // ZT-P12: what is typed here is a pipeline to design, said the way the assistant's own suggestions say it; without it
    // "Read the visits file, ..." was answered as a question (the file read, no pipeline drawn).
    const asked = this.ask().trim();
    const prompt = asked && !/^design a pipeline\b/i.test(asked) ? `Design a pipeline: ${asked}` : asked;
    this.router.navigate(['/ai/assistant'], { queryParams: prompt ? { prompt } : {} });
  }

  pickCopy(id: number | null): void {
    this.chosen.set('copy');
    this.copyFrom.set(id);
    const source = this.sources().find(p => p.taskDetailId === id);
    if (source) this.copyName.set(`${source.taskName} (copy)`);
  }

  /** 2: the registry pipeline (empty steps), the task on it, then its editor on the Steps tab. */
  async createWithSteps(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.busy()) return;
    this.chosen.set('steps');
    await this.run(async () => {
      const pid = await this.newPipelineId(name);
      await this.post('/pipeline.json/save', { pipelineId: pid, pipelineName: name, sourceTaskTypeId: this.topicId(), status: 'Active',
        description: `Made with New pipeline: ${name}.`.slice(0, 500), fields: PIPELINE_FIELDS });
      return this.task(name, pid, 'Active');
    });
  }

  /** 3: the source's steps saved under a pipeline of the copy's own, and a task on it, inactive. */
  async createCopy(): Promise<void> {
    const source = this.sources().find(p => p.taskDetailId === this.copyFrom());
    const name = this.copyName().trim();
    if (!source?.pipelineId || !name || this.busy()) return;
    this.chosen.set('copy');
    await this.run(async () => {
      const sourceKey = await this.pipelineKeyOf(source.pipelineId!);
      const view = await firstValueFrom(this.http.get<ApiResponse<{ json?: string; stored?: boolean }>>(
        `${API_BASE}/pipeline.json/steps/definition`, { params: { pipelineKey: sourceKey } }));
      if (view.status !== API_SUCCESS) throw new Error(view.message || 'The pipeline to copy could not be read.');
      const pid = await this.newPipelineId(name);
      await this.post('/pipeline.json/save', { pipelineId: pid, pipelineName: name, sourceTaskTypeId: this.topicId(), status: 'Active',
        description: `A copy of ${source.taskName}.`.slice(0, 500), fields: PIPELINE_FIELDS });
      if (view.data?.stored && view.data.json) {
        await this.post('/pipeline.json/steps/save', { pipelineKey: await this.pipelineKeyOf(pid), format: 'json', text: view.data.json });
      }
      return this.task(name, pid, 'Inactive');
    });
  }

  private async run(work: () => Promise<number>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const taskDetailId = await work();
      await this.router.navigate(['/pipelines', taskDetailId, 'edit'], { queryParams: { tab: 'steps' } });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** An id for the registry pipeline from the name, with a number added while one is taken. */
  private async newPipelineId(name: string): Promise<string> {
    const r = await firstValueFrom(this.http.get<ApiResponse<{ rows?: { pipelineId: string }[] }>>(
      `${API_BASE}/pipeline.json/list`, { params: { page: 1, limit: 200, q: pipelineIdOf(name) } }));
    const taken = new Set((r.data?.rows ?? []).map(p => p.pipelineId));
    let pid = pipelineIdOf(name);
    for (let n = 2; taken.has(pid) && n < 100; n++) pid = pipelineIdOf(name, String(n));
    return pid;
  }

  private async task(name: string, pid: string, status: 'Active' | 'Inactive'): Promise<number> {
    const body: Record<string, unknown> = { taskName: name, taskStatus: status, pipelineId: pid, taskPayload: STEP_PAYLOAD };
    if (this.topicId() != null) body['sourceTaskType'] = { sourceTaskTypeId: this.topicId() };
    const saved = await this.post('/sourceTask.json/addSourceTask', body);
    const id = Number(/ID (\d+)/.exec(saved.message ?? '')?.[1] ?? NaN);
    if (Number.isFinite(id)) return id;
    throw new Error('The pipeline was saved, but its id did not come back: find it under Pipelines.');
  }

  private async pipelineKeyOf(pid: string): Promise<number> {
    const r = await firstValueFrom(this.http.get<ApiResponse<{ rows?: { pipelineKey: number; pipelineId: string }[] }>>(
      `${API_BASE}/pipeline.json/list`, { params: { page: 1, limit: 20, q: pid } }));
    const key = r.data?.rows?.find(p => p.pipelineId === pid)?.pipelineKey;
    if (key == null) throw new Error(`The pipeline ${pid} could not be found.`);
    return key;
  }

  private async post(path: string, body: unknown): Promise<ApiResponse> {
    let r: ApiResponse;
    try {
      r = await firstValueFrom(this.http.post<ApiResponse>(`${API_BASE}${path}`, body));
    } catch (err: unknown) {
      const e = err as { error?: { message?: string }; status?: number };
      throw new Error(e?.error?.message || `The platform answered HTTP ${e?.status ?? '?'}.`);
    }
    if (r.status !== API_SUCCESS) {
      const problems = (r.data as { problems?: { path?: string; message?: string }[] } | undefined)?.problems;
      throw new Error(problems?.length ? problems.slice(0, 3).map(p => [p.path, p.message].filter(Boolean).join(': ')).join('; ') : r.message || 'Refused.');
    }
    return r;
  }
}
