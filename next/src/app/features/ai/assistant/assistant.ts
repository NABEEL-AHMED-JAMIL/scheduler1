import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
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
  AssistantAnswer, AssistantLink, AssistantMessage, Conversation, PipelineDraft, ToolCall, ToolDef, ToolTrace, allowedTools, askFirstNames,
  cardView, confirmLabel, contentBlocks, filesLink, mergeMessages, outcomeLook, runLink, toolState, traceOwners, withDecision,
} from './assistant.model';
import { DatasetPanel } from './dataset-panel';
import { DataPolicyApi } from '../../admin/data-policies/data-policy.api';
import { PolicyLevel, levelSummary, levelsOf, policyState } from '../../admin/data-policies/data-policy.model';
import { sensitivityText } from '../../../shared/ui/sensitivity';

interface Connection { connectionId: number; name: string; isDefault?: boolean; status?: string; defaultModel?: string | null; provider?: string; }
interface TraceState { loading: boolean; error: string; trace: ToolTrace | null; }

/** What a person can ask first: reads only, so trying one never starts anything. */
const SUGGESTIONS = [
  'Which pipeline jobs do I have?',
  'List the data sources in this workspace.',
  'How did my last run go?',
];

/**
 * AI › AI Assistant (MIG-252): a conversation with ai-service's assistant (MIG-241). It plans with
 * the tools of the Tool Registry, acts as the signed-in person, and asks before any write: a write
 * comes back as a confirmation card, and nothing runs until the person presses its button (decide).
 * Each run's tool calls are traced under the answer (tools/trace), a refused or blocked call shown
 * as one. A result links its execution (the MIG-251 run page), its output and files in Browse
 * files, and a dataset the assistant kept; a drafted pipeline opens in the step builder, unsaved.
 *
 * send and decide are synchronous and a local model can take minutes: the page shows a working
 * state with the time waited, and Stop waiting only stops waiting -- the server finishes the run
 * and the answer is in the conversation the next time it is read.
 *
 * Model output is text: printed as text, a fenced block in a <pre>, never bound as HTML.
 */
@Component({
  selector: 'app-assistant',
  imports: [Icon, StatusPill, ServerTimePipe, StickToBottom, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './assistant.html',
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

  readonly draft = signal('');
  /** What the page is waiting for: an answer to a question, or to a decision. */
  readonly working = signal<'send' | 'decide' | null>(null);
  /** The question being answered, shown in the thread until the answer brings the stored one. */
  readonly waitingFor = signal('');
  readonly elapsed = signal(0);
  readonly error = signal('');
  /** The person stopped waiting: the answer may still arrive on the server. */
  readonly stopped = signal(false);
  readonly deciding = signal<string | null>(null);

  readonly traces = signal<Record<number, TraceState>>({});
  readonly openTraces = signal<ReadonlySet<number>>(new Set());

  readonly tools = signal<ToolDef[]>([]);
  readonly toolsError = signal('');
  readonly allowed = computed(() => allowedTools(this.tools()));
  readonly askFirst = computed(() => askFirstNames(this.tools()));
  readonly blocked = computed(() => this.tools().filter(t => toolState(t).label === 'Blocked'));

  readonly canPickModel = computed(() => this.auth.canManageAgents());
  /** A pipeline task's edit page (and its step builder) is a workspace administrator's. */
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

  private call: Subscription | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.call?.unsubscribe(); this.stopTicker(); });
  }

  ngOnInit(): void {
    this.loadConversations();
    this.loadTools();
    this.loadWorkspace();
    this.loadPolicy();
    if (this.canPickModel()) this.loadConnections();
    const id = Number(this.route.snapshot.queryParamMap.get('c'));
    if (Number.isInteger(id) && id > 0) this.open(id);
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
    this.api.conversation(conversationId).subscribe({
      next: r => {
        this.threadLoading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.threadError.set(r.message || 'Could not open the conversation.'); return; }
        this.conversation.set(r.data.conversation);
        this.messages.set(mergeMessages([], r.data.messages ?? []));
        this.remember(r.data.conversation.conversationId);
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
    this.wait('send', this.api.send(message, conversationId, this.pickedConnection()), {
      failed: () => this.draft.set(message),
    });
  }

  decide(message: AssistantMessage, approve: boolean): void {
    const card = message.card;
    if (!card || this.working()) return;
    this.error.set('');
    this.stopped.set(false);
    this.deciding.set(card.actionId);
    this.waitingFor.set('');
    this.wait('decide', this.api.decide(card.actionId, approve), {
      answered: () => this.messages.update(list => withDecision(list, card.actionId, approve)),
      refused: text => {
        this.toast.error(text || 'The decision was not taken.');
        const id = this.conversation()?.conversationId;
        if (id != null) this.open(id);
      },
    });
  }

  /** Stops waiting for the answer. The server is not told: the run finishes there, and reading the conversation again shows it. */
  stopWaiting(): void {
    if (!this.working()) return;
    this.call?.unsubscribe();
    this.call = null;
    this.settle();
    this.stopped.set(true);
    this.loadConversations();
  }

  /** Reads the open conversation again: an answer that arrived after Stop waiting. */
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

  private wait(what: 'send' | 'decide', request: ReturnType<AssistantApi['send']>,
    on: { answered?: () => void; refused?: (message: string) => void; failed?: () => void }): void {
    this.working.set(what);
    this.startTicker();
    this.call = request.subscribe({
      next: r => {
        this.settle();
        const data = r.data as AssistantAnswer | undefined;
        if (data?.conversation && Array.isArray(data.messages)) {
          on.answered?.();
          this.take(data);
          return;
        }
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

  /** An answer: the conversation (new or the same), its new messages, and the new run's calls opened. */
  private take(data: AssistantAnswer): void {
    const fresh = !this.conversation() || this.conversation()!.conversationId !== data.conversation.conversationId;
    this.conversation.set(data.conversation);
    this.messages.update(list => mergeMessages(fresh ? [] : list, data.messages));
    this.conversations.update(list => [data.conversation, ...list.filter(c => c.conversationId !== data.conversation.conversationId)]);
    if (fresh) this.remember(data.conversation.conversationId);
    const owners = this.owners();
    // Read afresh: a decision moves the run on, so a trace read while it waited is stale.
    for (const m of data.messages) if (m.toolRunId != null && owners.has(m.messageId)) this.showTrace(m.toolRunId, true);
  }

  private settle(): void {
    this.working.set(null);
    this.deciding.set(null);
    this.waitingFor.set('');
    this.call = null;
    this.stopTicker();
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

  toggleTrace(toolRunId: number): void {
    if (this.openTraces().has(toolRunId)) {
      this.openTraces.update(open => { const next = new Set(open); next.delete(toolRunId); return next; });
      return;
    }
    this.showTrace(toolRunId);
  }

  private showTrace(toolRunId: number, fresh = false): void {
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

  openDataset(link: AssistantLink): void {
    if (!link.datasetRef) return;
    this.dialog.open(DatasetPanel, sidePanelConfig({ datasetRef: link.datasetRef, tool: link.tool ?? '' }, 'wide'));
  }

  async copy(text: string): Promise<void> {
    if (await copyText(text)) this.toast.success('Copied.');
  }

  /**
   * Opens a drafted pipeline in the step builder of a pipeline task that uses its pipeline, on the
   * draft's text tab, unsaved: the builder is where it is checked and saved. The builder lives on a
   * pipeline task's edit page, so a draft for a pipeline no task uses (or for no pipeline) has no
   * builder to open; the person copies it instead.
   */
  async openDraft(draft: PipelineDraft): Promise<void> {
    const format = draft.format === 'json' ? 'json' : 'yaml';
    const taskDetailId = draft.pipelineKey != null ? await this.taskFor(draft.pipelineKey) : null;
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
  problemText(p: string | { message?: string; path?: string }): string {
    return typeof p === 'string' ? p : [p.path, p.message].filter(Boolean).join(': ');
  }
  traceOf(toolRunId: number): TraceState | null { return this.traces()[toolRunId] ?? null; }
  outcomeIcon(tone: string): string { return tone === 'ok' ? 'check' : tone === 'warn' ? 'clock' : tone === 'crit' ? 'lock' : 'minus'; }
  isRefusal(m: AssistantMessage): boolean { return m.runStatus === 'refused' || m.runStatus === 'failed'; }
  runNote(m: AssistantMessage): string {
    if (m.runStatus === 'refused') return 'Refused: nothing was run.';
    if (m.runStatus === 'failed') return 'The run failed.';
    if (m.runStatus === 'stopped') return 'The run stopped before it could answer.';
    return '';
  }
  /** A call's facts in one line: HTTP status, time, and what came back. */
  callFacts(c: ToolCall): string {
    const facts: string[] = [];
    if (c.httpStatus != null) facts.push(`HTTP ${c.httpStatus}`);
    if (c.durationMs != null) facts.push(`${c.durationMs} ms`);
    if (c.resultRows != null) facts.push(`${c.resultRows} row${c.resultRows === 1 ? '' : 's'}`);
    if (c.resultBytes != null) facts.push(formatSize(c.resultBytes));
    return facts.join(' · ');
  }
  elapsedText(): string {
    const s = this.elapsed();
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  }

  private remember(conversationId: number | null): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { c: conversationId }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
