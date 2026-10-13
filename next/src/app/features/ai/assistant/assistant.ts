import { ConversationRow, titleOf } from './conversation.model';
import { ModelSetupBanner } from '../model-setup-banner';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, TimeoutError, firstValueFrom } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { LIST_LIMIT } from '../../../core/api/list-limit';
import { AuthService } from '../../../core/auth/auth.service';
import { roleLabel } from '../../../core/auth/auth.models';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';
import { ToastService } from '../../../shared/ui/toast.service';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { StickToBottom } from '../../../shared/ui/stick-to-bottom';
import { confirmWith } from '../../../shared/ui/confirm';
import { copyText } from '../../../shared/ui/clipboard.util';
import { capTitle } from '../../../shared/ui/long-text';
import { formatSize } from '../../../shared/ui/format-size';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { workspaceName } from '../../../shared/ui/workspace-name';
import { PipelineDraftHandoff } from '../../tasks/steps/draft-handoff';
import { ASSISTANT_TIMEOUT_MS, AssistantApi } from './assistant.api';
import {
  AssistantAnswer, AssistantLink, AssistantMessage, ChartArtifact, Conversation, PipelineDraft, RunProgress, ToolCall, ToolDef, ToolTrace, allowedTools,
  askFirstNames, cardView, chartAnswerOfArtifact, confirmLabel, contentBlocks, filesLink, isChart, mergeMessages, newestChart, outcomeLook, runLink,
  toolState, traceOwners, withDecision,
} from './assistant.model';
import { DatasetPanel } from './dataset-panel';
import { RunFollow } from './run-follow';
import { FlowPanel } from './flow-panel';
import { ConversationList } from './conversation-list';
import { ChartAnswerSlot } from '../../analytics/charts/chart-answer-slot';
import { TracePanel, TraceRun } from './trace-panel';
import { PipelineFlowArtifact, flowVerdict, isFlow, newestFlow } from './flow.model';
import { DataPolicyApi } from '../../admin/data-policies/data-policy.api';
import { PolicyLevel, levelSummary, levelsOf, policyState } from '../../admin/data-policies/data-policy.model';
import { sensitivityText } from '../../../shared/ui/sensitivity';
import { PageHeader } from '../../../shared/ui/page-header';

interface Connection { connectionId: number; name: string; isDefault?: boolean; status?: string; defaultModel?: string | null; provider?: string; }
interface TraceState { loading: boolean; error: string; trace: ToolTrace | null; }
export type PanelTab = 'flow' | 'chart' | 'trace' | 'context';

/**
 * What a person can ask first, by what they want. Healthcare shows up only here, as samples: everything the assistant
 * does is generic. Reads never start anything; a design is drawn, never saved.
 */
export const SUGGESTIONS: { group: string; icon: string; prompts: string[] }[] = [
  { group: 'Design a pipeline', icon: 'layers', prompts: [
    'Design a pipeline: when a lab results CSV lands in the inbox, validate it against the lab contract, flag abnormal values, ask the '
      + 'reviewer to approve, then save a PDF and notify the doctor.',
    'Design a pipeline: pull patients and observations from FHIR daily, compute risk flags, summarise with AI, approve, dashboard.',
    'Design a pipeline: every night read orders.csv from storage, keep the paid orders, and save them as a CSV.',
  ] },
  { group: 'Ask about runs', icon: 'zap', prompts: ['How did my last run go?', 'Which runs failed this week?', 'Which pipeline jobs do I have?'] },
  { group: 'Look things up', icon: 'database', prompts: ['List the data sources in this workspace.', 'What can a pipeline step point at here?'] },
];

/** How often a working run is read while it works: every second for half a minute, then every two. */
export const PROGRESS_MS = [1000, 2000] as const;

/**
 * AI › AI Assistant, redesigned (AI workflow review, 2026-10-12): the conversation on one side, the result on the
 * other -- the flow the assistant drew on a graph canvas (investigation-graph pattern), each run's tool calls as a trace,
 * and the context it works under. A question answers at once with its run; the run's phase and calls arrive while it
 * works (progress), Stop stops it on the server (cancel), and a run that failed or stopped can be asked again (Retry).
 *
 * The assistant plans with the Tool Registry, acts as the signed-in person, and asks before any write: a write comes
 * back as a confirmation card, and nothing runs until the person presses its button. A pipeline it designs is never
 * saved by it: Create pipeline saves it through Core's own endpoints, as the person. Model output is text: printed as
 * text, a fenced block in a <pre>, never bound as HTML.
 */
@Component({
  selector: 'app-assistant',
  imports: [PageHeader, Icon, StatusPill, ServerTimePipe, StickToBottom, RouterLink, ModelSetupBanner, RunFollow,
    FlowPanel, TracePanel, ChartAnswerSlot, ConversationList],
  templateUrl: './assistant.html',
  // Escape closes the history laid over the thread, as it closes a side panel.
  host: { '(document:keydown.escape)': 'historyOpen.set(false)' },
  // The page's own layout, kept with the page (lazy) rather than as new global utilities.
  styles: [`
    .ai-grid { position: relative; display: grid; gap: 1rem; align-items: stretch; }
    .ai-history { display: none; flex-direction: column; min-height: 0; }
    /* Below 1280 the list opens over the thread as the console's side panels do (UX review 2026-10-12, A9): the pane's
       full height, flush with its edge, a backdrop that closes it, and the same short slide in. */
    .ai-history.open { display: flex; position: absolute; z-index: 21; top: 0; bottom: 0; left: 0; width: min(22rem, 90%);
      border-radius: 0 var(--radius-lg) var(--radius-lg) 0; animation: ai-history-slide 180ms ease-out; }
    .ai-history-backdrop { position: absolute; inset: 0; z-index: 20; background: var(--scrim); border-radius: var(--radius-lg); }
    @keyframes ai-history-slide { from { transform: translateX(-1.5rem); opacity: 0; } to { transform: none; opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .ai-history.open { animation: none; } }
    .ai-list { padding: 0.375rem; min-height: 0; }
    .ai-thread { min-height: 30rem; }
    .ai-result { min-height: 34rem; }
    .ai-indent { margin-left: 2rem; }
    .ai-model { max-width: 26rem; }
    .ai-dot { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: var(--text-muted); }
    .ai-dot.ok { background: var(--ok-text); }
    .ai-dot.warn { background: var(--warn-text); }
    .ai-facts { display: none; }
    @media (min-width: 1024px) {
      .ai-grid { grid-template-columns: minmax(24rem, 0.95fr) minmax(28rem, 1.05fr); height: calc(100dvh - 12.5rem); min-height: 36rem; }
      .ai-pane { min-height: 0; }
    }
    @media (min-width: 1280px) {
      .ai-grid { grid-template-columns: 15rem minmax(26rem, 0.95fr) minmax(30rem, 1.15fr); }
      .ai-history, .ai-history.open { display: flex; position: static; width: auto; box-shadow: none; border-radius: var(--radius-lg); animation: none; }
      .ai-history-backdrop { display: none; }
    }
    @media (min-width: 1536px) { .ai-facts { display: inline; } }
  `],
})
export class Assistant implements OnInit {
  private readonly api = inject(AssistantApi);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly handoff = inject(PipelineDraftHandoff);
  private readonly policies = inject(DataPolicyApi);

  readonly suggestions = SUGGESTIONS;
  readonly timeoutMinutes = ASSISTANT_TIMEOUT_MS / 60_000;

  readonly conversations = signal<Conversation[]>([]);
  readonly conversationsLoading = signal(true);
  readonly conversation = signal<Conversation | null>(null);
  readonly messages = signal<AssistantMessage[]>([]);
  readonly threadLoading = signal(false);
  readonly threadError = signal('');
  /** The conversation list beside the thread; folded away on narrower screens until asked for. */
  readonly historyOpen = signal(false);

  readonly draft = signal('');
  /** What the page is waiting for: an answer to a question, or to a decision. */
  readonly working = signal<'send' | 'decide' | null>(null);
  /** The question being answered, shown in the thread until the answer brings the stored one. */
  readonly waitingFor = signal('');
  readonly elapsed = signal(0);
  readonly error = signal('');
  /** The person stopped the run: it ends on the server at its next step. */
  readonly stopped = signal(false);
  readonly stopping = signal(false);
  readonly deciding = signal<string | null>(null);

  /** The run working now, as progress reads it: its phase and calls, live. */
  readonly live = signal<RunProgress | null>(null);

  readonly traces = signal<Record<number, TraceState>>({});
  readonly openTraces = signal<ReadonlySet<number>>(new Set());
  /** The run whose calls the Trace tab shows: the live one, else the one picked, else the newest. */
  readonly traceRunId = signal<number | null>(null);

  readonly tab = signal<PanelTab>('flow');
  /** The message whose flow the Flow tab shows; null: the newest. */
  readonly pickedFlow = signal<number | null>(null);

  readonly tools = signal<ToolDef[]>([]);
  readonly toolsError = signal('');
  readonly allowed = computed(() => allowedTools(this.tools()));
  readonly askFirst = computed(() => askFirstNames(this.tools()));
  readonly blocked = computed(() => this.tools().filter(t => toolState(t).label === 'Blocked'));

  readonly canPickModel = computed(() => this.auth.canManageAgents());
  /** Create pipeline and the step builder are a workspace administrator's (Core's save endpoints are theirs). */
  readonly canEditPipelines = computed(() => this.auth.isTenantAdmin());
  readonly connections = signal<Connection[]>([]);
  readonly connectionOptions = computed(() => this.connections().filter(c => (c.status ?? 'Active') === 'Active'));
  /** The picked connection; null is the workspace default, which the server chooses. */
  readonly connectionId = signal<number | null>(null);
  readonly modelLabel = computed(() => {
    const id = this.connectionId();
    const list = this.connectionOptions();
    const picked = id == null ? list.find(c => c.isDefault) : list.find(c => c.connectionId === id);
    return picked ? picked.name : 'Workspace default model';
  });
  /** The model the newest run used, and how it was asked for tools: what the header's status says. */
  readonly lastModel = signal<{ model: string | null; toolMode: string | null; seconds: number | null; ok: boolean } | null>(null);
  readonly modelStatus = computed(() => {
    const picked = this.connectionOptions().find(c => (this.connectionId() == null ? c.isDefault : c.connectionId === this.connectionId()));
    const last = this.lastModel();
    const model = last?.model ?? picked?.defaultModel ?? null;
    const facts: string[] = [];
    if (picked?.provider) facts.push(picked.provider);
    if (last?.toolMode) facts.push(last.toolMode === 'native' ? 'native tool calling' : 'JSON tool protocol');
    if (last?.seconds != null) facts.push(`last answer ${last.seconds.toFixed(1)} s`);
    return { name: this.modelLabel(), model, facts: facts.join(' · '), tone: last == null ? 'neutral' : last.ok ? 'ok' : 'warn' };
  });

  readonly workspace = signal('');
  /** MIG-254: the workspace's data policy, level by level -- what decides the models and write tools the assistant may use. */
  readonly policyLevels = signal<PolicyLevel[]>([]);
  readonly policyError = signal('');
  readonly policyHeadline = computed(() => {
    if (this.policyError()) return 'Not available';
    const levels = this.policyLevels();
    if (!levels.length) return '…';
    return { defaults: 'Defaults (not saved)', partly: 'Partly saved', saved: 'Saved' }[policyState(levels)];
  });
  readonly actingAs = computed(() => this.auth.displayName());
  readonly roleText = computed(() => roleLabel(this.auth.role()));

  readonly owners = computed(() => traceOwners(this.messages()));
  readonly renaming = signal(false);
  readonly renameText = signal('');

  /** The flow the Flow tab draws: the picked message's, else the conversation's newest. */
  readonly flow = computed<PipelineFlowArtifact | null>(() => {
    const picked = this.pickedFlow();
    if (picked != null) {
      const a = this.messages().find(m => m.messageId === picked)?.artifact;
      if (isFlow(a)) return a;
    }
    return newestFlow(this.messages())?.flow ?? null;
  });
  readonly flowMessageId = computed(() => this.pickedFlow() ?? newestFlow(this.messages())?.messageId ?? null);

  /** MIG-357: the message whose chart the Chart tab draws; null: the newest. */
  readonly pickedChart = signal<number | null>(null);
  /** The chart the Chart tab draws: the picked message's, else the conversation's newest. */
  readonly chart = computed<ChartArtifact | null>(() => {
    const picked = this.pickedChart();
    if (picked != null) {
      const a = this.messages().find(m => m.messageId === picked)?.artifact;
      if (isChart(a)) return a;
    }
    return newestChart(this.messages())?.chart ?? null;
  });
  readonly chartMessageId = computed(() => this.pickedChart() ?? newestChart(this.messages())?.messageId ?? null);
  readonly chartAnswer = computed(() => { const c = this.chart(); return c ? chartAnswerOfArtifact(c) : null; });
  /** Pinning puts a tile on a dashboard: whoever may open the dashboards. */
  readonly canPinCharts = computed(() => this.auth.canEditDashboards());

  /** What the Trace tab shows: the live run, or a finished run's trace as read. */
  readonly traceView = computed<{ run: TraceRun | null; calls: ToolCall[]; live: boolean }>(() => {
    const live = this.live();
    const id = this.traceRunId();
    if (live && (id == null || id === live.run.toolRunId)) return { run: live.run, calls: live.calls, live: !live.done };
    const state = id != null ? this.traces()[id] : null;
    if (state?.trace) {
      const r = state.trace.run as ToolTrace['run'] & { dateFinished?: string | null; elapsedMs?: number | null };
      // A finished run's time: from when it was made to when it finished (both the platform's wall-clock).
      const elapsedMs = r.elapsedMs ?? (r.dateCreated && r.dateFinished ? Math.max(0, Date.parse(r.dateFinished) - Date.parse(r.dateCreated)) : null);
      return { run: { ...r, elapsedMs } as TraceRun, calls: state.trace.calls, live: false };
    }
    return { run: null, calls: [], live: false };
  });
  readonly traceRuns = computed(() => {
    const ids: number[] = [];
    for (const m of this.messages()) if (m.toolRunId != null && !ids.includes(m.toolRunId)) ids.push(m.toolRunId);
    return ids.reverse();
  });

  /** The last question, when the answer to it failed or stopped: what Retry sends again. */
  readonly retryable = computed(() => {
    if (this.working()) return null;
    const list = this.messages();
    const last = list.at(-1);
    if (!last || last.role !== 'assistant' || !['failed', 'stopped', 'refused'].includes(last.runStatus ?? '')) return null;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].role === 'user') return list[i].content ?? null;
    return null;
  });

  private call: Subscription | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setTimeout> | null = null;
  private following: { runId: number; afterSeq: number; started: number; asked: string } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.call?.unsubscribe(); this.stopTicker(); this.stopPolling(); });
  }

  ngOnInit(): void {
    this.loadConversations();
    this.loadTools();
    this.loadWorkspace();
    this.loadPolicy();
    if (this.canPickModel()) this.loadConnections();
    const id = Number(this.route.snapshot.queryParamMap.get('c'));
    if (Number.isInteger(id) && id > 0) this.open(id);
    // UX review 2026-10-12 (P3): New pipeline's "Describe it to the AI Assistant" hands over what to build; it waits in
    // the composer for the person to send, and the address forgets it.
    const asked = (this.route.snapshot.queryParamMap.get('prompt') ?? '').trim();
    if (asked && !(Number.isInteger(id) && id > 0)) {
      this.draft.set(asked.slice(0, 4000));
      this.router.navigate([], { relativeTo: this.route, queryParams: { prompt: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  // ----------------------------------------------------------------------------------------- loading

  loadConversations(): void {
    this.conversationsLoading.set(true);
    this.api.conversations().subscribe({
      next: r => { this.conversationsLoading.set(false); if (r.status === API_SUCCESS) this.conversations.set(r.data ?? []); },
      error: () => this.conversationsLoading.set(false),
    });
  }

  loadTools(): void {
    this.toolsError.set('');
    this.api.tools().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.tools.set(r.data ?? []); else this.toolsError.set(r.message); },
      error: err => this.toolsError.set(err?.error?.message || 'Could not load the tools.'),
    });
  }

  private loadWorkspace(): void {
    // MIG-254: a staff member's managed session belongs to no workspace's people, so appUser.json/me refuses it;
    // the session's own answer (openSession) named the workspace.
    if (this.auth.isManagedSession()) {
      const user = this.auth.user();
      this.workspace.set(user ? workspaceName({ tenantId: user.tenantId, tenantName: user.tenantName }) : '');
      return;
    }
    this.http.get<ApiResponse<{ tenantId?: number | null; tenantName?: string | null }>>(`${API_BASE}/appUser.json/me`).subscribe({
      next: r => this.workspace.set(r.status === API_SUCCESS && r.data ? workspaceName(r.data) : ''),
      error: () => this.workspace.set(''),
    });
  }

  private loadPolicy(): void {
    this.policies.get().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.policyError.set(r.message || 'The data policy could not be read.'); return; }
        this.policyLevels.set(levelsOf(r.data));
      },
      error: err => this.policyError.set(err?.error?.message || 'The data policy could not be read.'),
    });
  }

  policyLevelText(level: string): string { return sensitivityText(level); }
  policyLevelSummary(level: PolicyLevel): string { return levelSummary(level); }

  /** Model connections are an administrator's to list (aiConnection.json is TENANT_ADMIN); a tenant user gets the default. */
  private loadConnections(): void {
    this.http.get<ApiResponse<Connection[]>>(`${API_BASE}/aiConnection.json/list`).subscribe({
      next: r => this.connections.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.connections.set([]),
    });
  }

  /** Opens a conversation: its messages, and the address names it so a reload comes back to it. */
  open(conversationId: number): void {
    if (this.working()) return;
    this.threadLoading.set(true);
    this.threadError.set('');
    this.error.set('');
    this.stopped.set(false);
    this.renaming.set(false);
    this.pickedFlow.set(null);
    this.pickedChart.set(null);
    this.historyOpen.set(false);
    this.api.conversation(conversationId).subscribe({
      next: r => {
        this.threadLoading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.threadError.set(r.message || 'Could not open the conversation.'); return; }
        this.conversation.set(r.data.conversation);
        this.messages.set(mergeMessages([], r.data.messages ?? []));
        this.remember(r.data.conversation.conversationId);
        const newest = this.traceRuns()[0];
        if (newest != null) this.showTrace(newest);
        this.tab.set(this.flow() ? 'flow' : this.chart() ? 'chart' : this.tab());
      },
      error: err => { this.threadLoading.set(false); this.threadError.set(err?.error?.message || 'Could not open the conversation.'); },
    });
  }

  newChat(): void {
    if (this.working()) return;
    this.conversation.set(null);
    this.messages.set([]);
    this.traces.set({});
    this.openTraces.set(new Set());
    this.traceRunId.set(null);
    this.live.set(null);
    this.pickedFlow.set(null);
    this.pickedChart.set(null);
    this.error.set('');
    this.threadError.set('');
    this.stopped.set(false);
    this.renaming.set(false);
    this.remember(null);
  }

  // ------------------------------------------------------------------------------------ ask and decide

  send(text = this.draft()): void {
    const message = text.trim();
    if (!message || this.working()) return;
    this.error.set('');
    this.stopped.set(false);
    this.draft.set('');
    this.waitingFor.set(message);
    const conversationId = this.conversation()?.conversationId ?? null;
    this.wait('send', this.api.sendAsync(message, conversationId, this.pickedConnection()), message, {
      failed: () => this.draft.set(message),
    });
  }

  /** Asks the last question again, after its answer failed or stopped. */
  retry(): void {
    const question = this.retryable();
    if (question) this.send(question);
  }

  decide(message: AssistantMessage, approve: boolean): void {
    const card = message.card;
    if (!card || this.working()) return;
    this.error.set('');
    this.stopped.set(false);
    this.deciding.set(card.actionId);
    this.waitingFor.set('');
    this.wait('decide', this.api.decideAsync(card.actionId, approve), '', {
      answered: () => this.messages.update(list => withDecision(list, card.actionId, approve)),
      refused: text => {
        this.toast.error(text || 'The decision was not taken.');
        const id = this.conversation()?.conversationId;
        if (id != null) this.open(id);
      },
    });
  }

  /** Stops the working run on the server: it ends before its next model turn or tool call, and says so in the conversation. */
  stop(): void {
    const following = this.following;
    if (!this.working()) return;
    if (!following) {
      // The answer has not named its run yet: nothing to stop on the server, so stop waiting.
      this.call?.unsubscribe();
      this.call = null;
      this.settle();
      this.stopped.set(true);
      return;
    }
    this.stopping.set(true);
    this.api.cancel(following.runId).subscribe({
      next: r => { if (r.status !== API_SUCCESS) this.toast.error(r.message || 'The run could not be stopped.'); this.stopped.set(true); },
      error: err => { this.stopping.set(false); this.toast.error(err?.error?.message || 'The run could not be stopped.'); },
    });
  }

  /** Reads the open conversation again: an answer that arrived after the page stopped following it. */
  checkAgain(): void {
    const id = this.conversation()?.conversationId;
    if (id != null) this.open(id);
    else this.loadConversations();
  }

  private pickedConnection(): number | null {
    const id = this.connectionId();
    if (id == null) return null;
    return this.connectionOptions().find(c => c.connectionId === id)?.isDefault ? null : id;
  }

  private wait(what: 'send' | 'decide', request: ReturnType<AssistantApi['send']>, asked: string,
    on: { answered?: () => void; refused?: (message: string) => void; failed?: () => void }): void {
    this.working.set(what);
    this.startTicker();
    this.call = request.subscribe({
      next: r => {
        this.call = null;
        const data = r.data as AssistantAnswer | undefined;
        if (data?.conversation && Array.isArray(data.messages)) {
          on.answered?.();
          this.take(data);
          const run = data.run;
          if (run?.toolRunId != null && run.status === 'running') {
            this.follow(run.toolRunId, data.afterSeq ?? Math.max(0, ...data.messages.map(m => m.seq)), asked);
            return;
          }
          this.settle();
          return;
        }
        this.settle();
        if (on.refused) on.refused(r.message);
        else this.error.set(r.message || 'The assistant did not answer.');
      },
      error: err => {
        this.settle();
        this.error.set(err instanceof TimeoutError
          ? `No answer after ${this.timeoutMinutes} minutes. The assistant may still finish: check again in a moment.`
          : err?.error?.message || 'The assistant could not be reached.');
        on.failed?.();
      },
    });
  }

  /** Follows a run while it works: its phase and calls as they come, then its answer from the conversation. */
  private follow(runId: number, afterSeq: number, asked: string): void {
    this.following = { runId, afterSeq, started: Date.now(), asked };
    this.traceRunId.set(runId);
    this.tab.set(this.tab() === 'context' ? 'trace' : this.tab());
    this.readProgress();
  }

  private readProgress(): void {
    const f = this.following;
    if (!f) return;
    this.api.progress(f.runId, this.conversation()?.conversationId ?? null, f.afterSeq).subscribe({
      next: r => {
        if (this.following !== f) return;
        if (r.status === API_SUCCESS && r.data) {
          this.live.set(r.data);
          if (r.data.done) { this.finish(f, r.data); return; }
        }
        this.schedule(f);
      },
      error: () => this.schedule(f),
    });
  }

  private schedule(f: { started: number }): void {
    this.stopPolling();
    const wait = Date.now() - f.started < 30_000 ? PROGRESS_MS[0] : PROGRESS_MS[1];
    this.poll = setTimeout(() => this.readProgress(), wait);
  }

  /** The run is done: its answer (and what it drew) comes from the conversation, read once more. */
  private finish(f: { runId: number }, progress: RunProgress): void {
    this.following = null;
    this.stopPolling();
    const run = progress.run;
    this.lastModel.set({ model: run.model ?? null, toolMode: run.toolMode ?? null, seconds: run.elapsedMs != null ? run.elapsedMs / 1000 : null,
      ok: run.status === 'answered' || run.status === 'awaiting_confirmation' });
    const id = this.conversation()?.conversationId;
    if (id == null) { this.settle(); return; }
    const hadFlow = this.flowMessageId();
    const hadChart = this.chartMessageId();
    this.api.conversation(id).subscribe({
      next: r => {
        this.settle();
        if (r.status === API_SUCCESS && r.data) {
          this.conversation.set(r.data.conversation);
          this.messages.set(mergeMessages([], r.data.messages ?? []));
          this.conversations.update(list => [r.data!.conversation, ...list.filter(c => c.conversationId !== id)]);
          this.pickedFlow.set(null);
          this.pickedChart.set(null);
          if (this.flowMessageId() !== hadFlow && this.flow()) this.tab.set('flow');
          else if (this.chartMessageId() !== hadChart && this.chart()) this.tab.set('chart');
        }
        this.showTrace(f.runId, true);
      },
      error: () => { this.settle(); this.error.set('The answer could not be read; check again in a moment.'); },
    });
  }

  /** An answer: the conversation (new or the same) and its new messages. */
  private take(data: AssistantAnswer): void {
    const fresh = !this.conversation() || this.conversation()!.conversationId !== data.conversation.conversationId;
    this.conversation.set(data.conversation);
    this.messages.update(list => mergeMessages(fresh ? [] : list, data.messages));
    this.conversations.update(list => [data.conversation, ...list.filter(c => c.conversationId !== data.conversation.conversationId)]);
    if (fresh) this.remember(data.conversation.conversationId);
    if (data.run?.status !== 'running') {
      const owners = this.owners();
      // Read afresh: a decision moves the run on, so a trace read while it waited is stale.
      for (const m of data.messages) if (m.toolRunId != null && owners.has(m.messageId)) this.showTrace(m.toolRunId, true);
    }
  }

  private settle(): void {
    this.working.set(null);
    this.deciding.set(null);
    this.waitingFor.set('');
    this.stopping.set(false);
    this.call = null;
    this.following = null;
    this.stopTicker();
    this.stopPolling();
  }

  private stopPolling(): void {
    if (this.poll) clearTimeout(this.poll);
    this.poll = null;
  }

  private startTicker(): void {
    this.stopTicker();
    this.elapsed.set(0);
    const started = Date.now();
    this.ticker = setInterval(() => this.elapsed.set(Math.floor((Date.now() - started) / 1000)), 1000);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.send(); }
  }

  useSuggestion(text: string): void { this.draft.set(text); }

  // ------------------------------------------------------------------------------------------- trace

  /** Shows a run's calls in the Trace tab. */
  openTrace(toolRunId: number): void {
    this.showTrace(toolRunId);
    this.tab.set('trace');
  }

  toggleTrace(toolRunId: number): void {
    if (this.openTraces().has(toolRunId)) {
      this.openTraces.update(open => { const next = new Set(open); next.delete(toolRunId); return next; });
      return;
    }
    this.showTrace(toolRunId);
  }

  pickTrace(value: string): void {
    const id = Number(value);
    if (Number.isFinite(id)) this.showTrace(id);
  }

  private showTrace(toolRunId: number, fresh = false): void {
    this.traceRunId.set(toolRunId);
    this.openTraces.update(open => new Set(open).add(toolRunId));
    const known = this.traces()[toolRunId];
    if (!fresh && known && (known.loading || known.trace)) return;
    // A fresh read keeps the calls already shown until the new ones arrive.
    this.setTrace(toolRunId, { loading: !known?.trace, error: '', trace: known?.trace ?? null });
    this.api.trace(toolRunId).subscribe({
      next: r => this.setTrace(toolRunId, r.status === API_SUCCESS && r.data
        ? { loading: false, error: '', trace: r.data }
        : { loading: false, error: r.message || 'Could not read the tool calls.', trace: null }),
      error: err => this.setTrace(toolRunId, { loading: false, error: err?.error?.message || 'Could not read the tool calls.', trace: null }),
    });
  }

  private setTrace(toolRunId: number, state: TraceState): void {
    this.traces.update(all => ({ ...all, [toolRunId]: state }));
  }

  // ------------------------------------------------------------------------------------ conversations

  startRename(): void {
    this.renameText.set(this.conversation()?.title ?? '');
    this.renaming.set(true);
  }

  saveRename(): void {
    const c = this.conversation();
    const title = this.renameText().trim();
    if (!c || !title) return;
    this.api.rename(c.conversationId, title).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        const renamed = { ...c, title };
        this.conversation.set(renamed);
        this.conversations.update(list => list.map(x => (x.conversationId === c.conversationId ? renamed : x)));
        this.renaming.set(false);
      },
      error: err => this.toast.error(err?.error?.message || 'The conversation could not be renamed.'),
    });
  }

  async remove(c: Conversation): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete "${c.title}"?`,
      body: 'The conversation and its messages go. Runs it started, and their executions, stay.',
      confirmLabel: 'Delete conversation', danger: true,
    });
    if (!ok) return;
    this.api.remove(c.conversationId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        this.toast.success(r.message || 'Conversation deleted.');
        this.conversations.update(list => list.filter(x => x.conversationId !== c.conversationId));
        if (this.conversation()?.conversationId === c.conversationId) this.newChat();
      },
      error: err => this.toast.error(err?.error?.message || 'The conversation could not be deleted.'),
    });
  }

  // ----------------------------------------------------------------------------------- results

  showFlow(messageId: number): void {
    this.pickedFlow.set(messageId);
    this.tab.set('flow');
  }

  /** MIG-357: a message's chart, in the Chart tab. */
  showChart(messageId: number): void {
    this.pickedChart.set(messageId);
    this.tab.set('chart');
  }

  openDataset(link: AssistantLink): void {
    if (!link.datasetRef) return;
    this.dialog.open(DatasetPanel, sidePanelConfig({ datasetRef: link.datasetRef, tool: link.tool ?? '' }, 'wide'));
  }

  async copy(text: string): Promise<void> {
    if (await copyText(text)) this.toast.success('Copied.');
  }

  /**
   * Opens a pipeline drafted before the review (free text) in the step builder of a pipeline task that uses its
   * pipeline, on the draft's text tab, unsaved. A designed flow opens from the Flow tab instead.
   */
  async openDraft(draft: PipelineDraft): Promise<void> {
    const format = draft.format === 'json' ? 'json' : 'yaml';
    // ai-service names a task on the pipeline (MIG-317); a draft kept before that is looked up as it always was.
    const taskDetailId = draft.taskDetailId ?? (draft.pipelineKey != null ? await this.taskFor(draft.pipelineKey) : null);
    if (taskDetailId == null) {
      this.toast.info('No pipeline task uses this pipeline yet, so there is no step builder to open. Copy the draft instead.');
      return;
    }
    this.handoff.offer(draft.pipelineKey!, { format, text: draft.text });
    await this.router.navigate(['/pipelines', taskDetailId, 'edit'], { queryParams: { tab: format } });
  }

  /** A pipeline task on this pipeline: pipeline.json/list gives the pipeline's id, listSourceTask the tasks naming it. */
  private async taskFor(pipelineKey: number): Promise<number | null> {
    try {
      const pipelines = await firstValueFrom(this.http.get<ApiResponse<{ rows?: { pipelineKey: number; pipelineId: string }[] }>>(
        `${API_BASE}/pipeline.json/list`, { params: { page: '1', limit: String(LIST_LIMIT) } }));
      const pipelineId = pipelines.data?.rows?.find(p => p.pipelineKey === pipelineKey)?.pipelineId;
      if (!pipelineId) return null;
      const tasks = await firstValueFrom(this.http.post<ApiResponse<{ taskDetailId: number; pipelineId?: string }[]>>(
        `${API_BASE}/sourceTask.json/listSourceTask`, {}, { params: { limit: LIST_LIMIT } }));
      return tasks.data?.find(t => t.pipelineId === pipelineId)?.taskDetailId ?? null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------- template readings

  blocks(m: AssistantMessage) { return contentBlocks(m.content); }
  cardOf(m: AssistantMessage) { return m.card ? cardView(m.card) : null; }
  confirmText(tool: string): string { return confirmLabel(tool); }
  outcome(outcome: string) { return outcomeLook(outcome); }
  runRoute(link: AssistantLink) { return runLink(link); }
  filesQuery(link: AssistantLink) { return filesLink(link); }
  toolLook(t: ToolDef) { return toolState(t); }
  size(bytes: number | null | undefined): string { return formatSize(bytes); }
  tip(text: string | null | undefined): string { return capTitle(text); }

  /**
   * Coordinator 2026-10-12: the thread's header reads the conversation's short title, as the list does (ai-service's
   * ConversationSummary; a title the person gave wins), with the first question in full as its tooltip. The list's row is
   * read first: it is the one refreshed after each answer.
   */
  private readonly threadRow = computed<ConversationRow | null>(() => {
    const open = this.conversation();
    if (!open) return null;
    const listed = this.conversations().find(c => c.conversationId === open.conversationId) as ConversationRow | undefined;
    return { ...(open as ConversationRow), ...(listed ?? {}) };
  });
  readonly threadTitle = computed(() => {
    const c = this.threadRow();
    if (!c) return 'New conversation';
    return c.renamed ? (c.title || 'Untitled conversation').trim() : titleOf(c);
  });
  readonly threadTip = computed(() => {
    const c = this.threadRow();
    return c ? (c.firstQuestion || c.title || '').trim() : '';
  });
  flowOf(m: AssistantMessage): PipelineFlowArtifact | null { return isFlow(m.artifact) ? m.artifact : null; }
  chartOf(m: AssistantMessage): ChartArtifact | null { return isChart(m.artifact) ? m.artifact : null; }
  draftOf(m: AssistantMessage): PipelineDraft | null {
    const a = m.artifact as PipelineDraft | null;
    return a && !isFlow(a) && !isChart(a) && typeof (a as PipelineDraft).text === 'string' ? a : null;
  }
  verdictOf(f: PipelineFlowArtifact) { return flowVerdict(f); }
  problemText(p: string | { message?: string; path?: string }): string {
    return typeof p === 'string' ? p : [p.path, p.message].filter(Boolean).join(': ');
  }
  traceOf(toolRunId: number): TraceState | null { return this.traces()[toolRunId] ?? null; }
  isRefusal(m: AssistantMessage): boolean { return m.runStatus === 'refused' || m.runStatus === 'failed'; }
  runNote(m: AssistantMessage): string {
    if (m.runStatus === 'refused') return 'Refused: nothing was run.';
    if (m.runStatus === 'failed') return 'The run failed.';
    if (m.runStatus === 'stopped') return 'The run stopped before it could answer.';
    return '';
  }
  elapsedText(): string {
    const s = this.elapsed();
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  }
  liveCalls(): ToolCall[] { return this.live()?.calls ?? []; }

  private remember(conversationId: number | null): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { c: conversationId }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
