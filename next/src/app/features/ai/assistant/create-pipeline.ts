import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { SERVER_ZONE } from '../../../core/instant';
import { Icon } from '../../../shared/ui/icon';
import { FlowDefinition, FlowTrigger, PipelineFlowArtifact, pipelineIdOf } from './flow.model';
import { ConversationApi } from './conversation.api';

export interface CreatePipelineData {
  flow: PipelineFlowArtifact;
  /** The definition with the settings the person filled in the flow panel. */
  definition: FlowDefinition;
}

/** What was created: everything the run card and "Open in step builder" need. */
export interface CreatedPipeline {
  pipelineId: string;
  pipelineKey: number;
  taskDetailId: number;
  jobId: number;
  jobName: string;
}

export interface Topic { sourceTaskTypeId: number; serviceName: string; status?: string; }

type StepState = 'todo' | 'doing' | 'done' | 'failed';

export const CREATE_STEPS = ['Pipeline', 'Steps', 'Pipeline task', 'Schedule', 'Trigger'] as const;

/**
 * Core asks every pipeline for at least one field (what its task form collects): a designed pipeline gets one optional
 * note, which its steps never need -- they read their own source.
 */
export const PIPELINE_FIELDS = [{ tagKey: 'note', label: 'Note', fieldType: 'text', required: false, position: 0 }];

/** The job Core is asked for: manual, a schedule (every hour/day/week/month at a time), or manual with an inbox trigger. */
export function jobPayload(name: string, taskDetailId: number, trigger: FlowTrigger, today: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    jobName: name, taskDetail: { taskDetailId }, execution: trigger.type === 'schedule' ? 'Auto' : 'Manual', priority: 1, maxAttempts: 1,
    retryBackoffSeconds: 30, jobStatus: 'Active', completeJob: false, failJob: false, skipJob: false,
  };
  if (trigger.type === 'schedule') {
    const frequency = ({ hour: 'Hr', day: 'Daily', week: 'Weekly', month: 'Monthly' } as Record<string, string>)[trigger.every ?? 'day'] ?? 'Daily';
    payload['schedulers'] = [{ startDate: today, endDate: '', startTime: /^\d\d:\d\d$/.test(trigger.at ?? '') ? trigger.at : '06:00', frequency,
      intervalValue: '1', daysOfWeek: frequency === 'Weekly' ? 'MON' : null, dayOfMonth: frequency === 'Monthly' ? 1 : null }];
  }
  return payload;
}

/**
 * Create pipeline (AI workflow review): the designed flow saved through Core's own endpoints, as the signed-in person --
 * the pipeline (pipeline.json/save), its steps (pipeline.json/steps/save, which checks the definition once more), a
 * pipeline task on it (sourceTask.json/addSourceTask), and a schedule to run it (sourceJob.json/addSourceJob; Auto on
 * the flow's timetable, else Manual), with the inbox trigger when the flow starts on a file. Each call's answer is
 * shown as it comes; a refusal stops there and says which part exists already. Only a workspace administrator gets
 * here (the endpoints are theirs), and the assistant itself never saves anything.
 */
@Component({
  selector: 'app-create-pipeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  styles: [`.cp-dialog { width: min(36rem, 94vw); max-height: 88vh; }`],
  template: `
    <div class="cp-dialog card shadow-xl flex flex-col" role="dialog" aria-labelledby="create-pipeline-title">
      <header class="px-5 pt-4 pb-3 border-b border-subtle">
        <h2 id="create-pipeline-title" class="font-semibold text-base">Create pipeline</h2>
        <p class="text-xs text-[color:var(--text-muted)] mt-0.5">Saved in this workspace as you. Nothing runs until you press Run now.</p>
      </header>
      <div class="px-5 py-4 overflow-y-auto flex flex-col gap-3 min-h-0">
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Name</span>
          <input class="input" maxlength="120" [value]="name()" [disabled]="busy() || !!created()" (input)="setName($any($event.target).value)" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Pipeline id</span>
          <input class="input mono" maxlength="40" [value]="pipelineId()" [disabled]="busy() || !!created()"
                 (input)="pipelineId.set($any($event.target).value.toUpperCase())" />
          <span class="text-xs text-[color:var(--text-muted)]">Upper case, digits and _; unique in the workspace.</span>
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Topic</span>
          <select class="input" [disabled]="busy() || !!created() || !topics().length" (change)="topicId.set(+$any($event.target).value)">
            @for (t of topics(); track t.sourceTaskTypeId) {
              <option [value]="t.sourceTaskTypeId" [selected]="t.sourceTaskTypeId === topicId()">{{ t.serviceName }}</option>
            }
          </select>
          @if (topicsError()) { <span class="text-xs text-crit-500">{{ topicsError() }}</span> }
        </label>
        <div class="text-sm flex flex-col gap-1">
          <span class="font-medium">Starts</span>
          <span class="text-[color:var(--text-secondary)]">{{ triggerText() }}</span>
        </div>
        @if (data.flow.problems.length) {
          <p class="text-xs rounded-md px-2.5 py-2 bg-warn-500/5 text-[color:var(--warn-text)]" role="note">
            The flow still has {{ data.flow.problems.length }} problem{{ data.flow.problems.length === 1 ? '' : 's' }}; Core checks the steps again
            and refuses them if they are wrong. Fill the settings in the flow panel first.
          </p>
        }
        @if (steps().length) {
          <ol class="list-none m-0 p-0 flex flex-col gap-1.5" aria-label="What is being created" data-create-steps>
            @for (s of steps(); track s.label) {
              <li class="flex items-start gap-2 text-sm" [attr.data-state]="s.state">
                <app-icon [name]="s.state === 'done' ? 'checkCircle' : s.state === 'failed' ? 'xCircle' : s.state === 'doing' ? 'refresh' : 'minus'"
                          [class]="s.state === 'done' ? 'icon-ok' : s.state === 'failed' ? 'icon-crit' : s.state === 'doing' ? 'spin' : 'text-[color:var(--text-muted)]'"
                          size="0.95em" />
                <span class="min-w-0"><span class="font-medium">{{ s.label }}</span>
                  @if (s.note) { <span class="block text-xs break-words" [class]="s.state === 'failed' ? 'text-crit-500' : 'text-[color:var(--text-muted)]'">{{ s.note }}</span> }
                </span>
              </li>
            }
          </ol>
        }
      </div>
      <footer class="px-5 py-3 border-t border-subtle flex flex-wrap justify-end gap-2">
        @if (created(); as c) {
          <button type="button" class="btn btn-primary btn-sm" (click)="ref.close(c)"><app-icon name="check" />Done</button>
        } @else {
          <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="ref.close(null)">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !canCreate()" (click)="create()">
            <app-icon name="save" [busy]="busy()" />Create pipeline
          </button>
        }
      </footer>
    </div>
  `,
})
export class CreatePipeline implements OnInit {
  readonly ref = inject<DialogRef<CreatedPipeline | null>>(DialogRef);
  readonly data = inject<CreatePipelineData>(DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router, { optional: true });
  private readonly conversations = inject(ConversationApi);

  readonly name = signal(this.data.flow.name || 'AI pipeline');
  readonly pipelineId = signal(pipelineIdOf(this.data.flow.name));
  readonly topics = signal<Topic[]>([]);
  readonly topicsError = signal('');
  readonly topicId = signal<number | null>(null);
  readonly busy = signal(false);
  readonly created = signal<CreatedPipeline | null>(null);
  readonly steps = signal<{ label: string; state: StepState; note?: string }[]>([]);

  readonly canCreate = computed(() => !!this.name().trim() && /^[A-Z][A-Z0-9_]{1,39}$/.test(this.pipelineId()) && this.topicId() != null);
  readonly triggerText = computed(() => {
    const t = this.data.flow.trigger;
    if (t.type === 'schedule') return `On a schedule: every ${t.every ?? 'day'}${t.at ? ' at ' + t.at : ''} (America/Chicago).`;
    if (t.type === 'inbox') return 'When a file lands in the pipeline\'s inbox (an inbox trigger on its schedule).';
    return 'On demand: Run now, or the API.';
  });

  ngOnInit(): void {
    this.http.get<ApiResponse<Topic[]>>(`${API_BASE}/setting.json/topics`, { params: { q: '', limit: 50 } }).subscribe({
      next: r => {
        const list = (r.status === API_SUCCESS ? r.data ?? [] : []).filter(t => (t.status ?? 'Active') === 'Active');
        this.topics.set(list);
        this.topicId.set(list[0]?.sourceTaskTypeId ?? null);
        if (!list.length) this.topicsError.set(r.message && r.status !== API_SUCCESS ? r.message : 'This workspace has no active topic to put a pipeline under.');
      },
      error: err => this.topicsError.set(err?.error?.message || 'The topics could not be read.'),
    });
  }

  setName(value: string): void {
    const before = pipelineIdOf(this.name());
    this.name.set(value);
    if (this.pipelineId() === before) this.pipelineId.set(pipelineIdOf(value));
  }

  async create(): Promise<void> {
    if (!this.canCreate() || this.busy()) return;
    this.busy.set(true);
    const trigger = this.data.flow.trigger;
    const labels = CREATE_STEPS.filter(l => l !== 'Trigger' || trigger.type === 'inbox');
    this.steps.set(labels.map(label => ({ label, state: 'todo' as StepState })));
    const name = this.name().trim();
    const pid = this.pipelineId();
    const topic = this.topicId()!;
    try {
      // 1. The pipeline: refused when the id is taken (the person picks another).
      await this.step('Pipeline', async () => {
        const saved = await this.post('/pipeline.json/save', { pipelineId: pid, pipelineName: name, sourceTaskTypeId: topic, status: 'Active',
          description: (this.data.flow.description || `Designed with the AI Assistant: ${name}.`).slice(0, 500), fields: PIPELINE_FIELDS });
        return saved.message || `${pid} saved.`;
      });
      const pipelineKey = await this.pipelineKeyOf(pid);
      // 2. Its steps: Core checks the definition once more and refuses it with its problems.
      await this.step('Steps', async () => {
        const r = await this.post('/pipeline.json/steps/save', { pipelineKey, format: 'json', text: JSON.stringify(this.data.definition) });
        return `${this.data.definition.steps.length} steps saved${(r.data as { version?: number } | undefined)?.version ? ' as version ' + (r.data as { version: number }).version : ''}.`;
      });
      // 3. A pipeline task on it: what a schedule runs.
      let taskDetailId = 0;
      await this.step('Pipeline task', async () => {
        await this.post('/sourceTask.json/addSourceTask', { taskName: name, taskStatus: 'Active', pipelineId: pid,
          sourceTaskType: { sourceTaskTypeId: topic }, taskPayload: '<data></data>' });
        taskDetailId = await this.taskOf(pid, name);
        return `Task ${taskDetailId}.`;
      });
      // 4. The schedule (a job): Auto on the flow's timetable, otherwise Manual.
      let jobId = 0;
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: SERVER_ZONE }).format(new Date());
      await this.step('Schedule', async () => {
        const r = await this.post('/sourceJob.json/addSourceJob', jobPayload(name, taskDetailId, trigger, today));
        jobId = Number(/jobId (\d+)/.exec(r.message ?? '')?.[1] ?? NaN);
        if (!Number.isFinite(jobId)) throw new Error('The schedule was saved but its id did not come back; find it under Schedules.');
        return `Job ${jobId}, ${trigger.type === 'schedule' ? 'on its timetable' : 'run on demand'}.`;
      });
      // 5. The inbox trigger, when a file starts the run.
      if (trigger.type === 'inbox') {
        await this.step('Trigger', async () => {
          await this.post('/sourceJob.json/inboxTrigger/save', { jobId, enabled: true, filePattern: '*' });
          return 'A file in the inbox starts a run.';
        });
      }
      this.created.set({ pipelineId: pid, pipelineKey, taskDetailId, jobId, jobName: name });
      this.report(this.created()!);
    } catch {
      // The failing step says why; whatever was created before it stays (and is named there).
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * The conversation list says the design was created, and links to it (2026-10-12). The conversation is the one open on
   * the page (?c=, which the assistant keeps in the address). Best effort: the pipeline stands whether or not this lands.
   */
  private report(c: CreatedPipeline): void {
    const id = Number(this.router?.parseUrl(this.router.url).queryParams['c']);
    if (!Number.isInteger(id) || id <= 0) return;
    this.conversations.pipelineCreated(id, { pipelineKey: c.pipelineKey, pipelineId: c.pipelineId, taskDetailId: c.taskDetailId, jobId: c.jobId,
      name: c.jobName }).subscribe({ error: () => undefined });
  }

  private async step(label: string, work: () => Promise<string>): Promise<void> {
    this.mark(label, 'doing');
    try {
      this.mark(label, 'done', await work());
    } catch (e) {
      const before = this.steps().filter(s => s.state === 'done').map(s => s.label.toLowerCase());
      this.mark(label, 'failed', `${e instanceof Error ? e.message : String(e)}${before.length ? ` (already created: ${before.join(', ')})` : ''}`);
      throw e;
    }
  }

  private mark(label: string, state: StepState, note?: string): void {
    this.steps.update(list => list.map(s => (s.label === label ? { ...s, state, note } : s)));
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

  private async pipelineKeyOf(pid: string): Promise<number> {
    const r = await firstValueFrom(this.http.get<ApiResponse<{ rows?: { pipelineKey: number; pipelineId: string }[] }>>(
      `${API_BASE}/pipeline.json/list`, { params: { page: 1, limit: 20, q: pid } }));
    const key = r.data?.rows?.find(p => p.pipelineId === pid)?.pipelineKey;
    if (key == null) throw new Error(`The pipeline ${pid} was saved but could not be found again.`);
    return key;
  }

  private async taskOf(pid: string, name: string): Promise<number> {
    const r = await firstValueFrom(this.http.post<ApiResponse<{ taskDetailId: number; pipelineId?: string; taskName?: string }[]>>(
      `${API_BASE}/sourceTask.json/listSourceTask`, {}, { params: { page: 1, limit: 1000 } }));
    const mine = (r.data ?? []).filter(t => t.pipelineId === pid && t.taskName === name).sort((a, b) => b.taskDetailId - a.taskDetailId);
    if (!mine.length) throw new Error('The pipeline task was saved but could not be found again.');
    return mine[0].taskDetailId;
  }
}
