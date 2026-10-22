import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injector, WritableSignal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { instantMs } from '../../core/instant';
import type { InboxTask, TaskCount } from '../workflows/workflows.api';
import type { WaitingRun } from '../jobs/history/review-waiting';
import type { Extraction } from '../documents/documents.model';

/**
 * UX review DR2 (owner 2026-10-13, "go for best"): one Review home over the three places where something waits for a
 * person -- Approval-step tasks (workflow-service's Task inbox), runs whose results wait for review (Core's run review)
 * and documents in review (ai-service's document review). This file reads the three with the services' own list calls,
 * in parallel, and lays them out as one list; the menu's badge and Home's "N waiting for your review" count the same
 * list (TaskCountService loads this file lazily), so the number and the page never disagree.
 *
 * Who sees what is each service's own answer, read as the reader: a source the reader may not open is not asked at all,
 * a run is listed to a reviewer only through their own open task about it (they decide runs in the Task inbox; Core's
 * console decision is a workspace administrator's), and a document claimed by someone else is listed but not pickable.
 */

export type ReviewKind = 'approval' | 'run' | 'document';
/** Which service decides an item: the reader's task (workflow-service), Core's run review, or ai-service. */
export type ReviewVia = 'task' | 'core' | 'document';

/** A row of the Review home: one thing waiting for a decision, whatever service it lives in. */
export interface ReviewItem {
  /** Unique across the three kinds (task 1142 and document 1142 are two rows): the bulk selection's id. */
  uid: number;
  kind: ReviewKind;
  via: ReviewVia;
  /** The service's own id: the task's, the run's (jobQueueId) or the document's (extractionId). */
  id: number;
  runId?: number;
  jobId?: number;
  /** What it is: the request's title, the run, the document. */
  title: string;
  /** Where it comes from: the pipeline, the workflow, the document type. */
  from: string;
  /** Waiting since (ISO, as the service wrote it). */
  since: string | null;
  due: string | null;
  overdue: boolean;
  /** Who it waits on, in words: You, Your teams, Administrators, Claimed by Sam. */
  waitsOn: string;
  /** The reader may decide it in bulk; else `whyNot` says why its box is off. */
  pickable: boolean;
  whyNot: string;
  /** An approval step's task, or a plain task step (decided on its own). */
  stepType?: 'approval' | 'task';
  individual?: boolean;
  task?: InboxTask;
  run?: WaitingRun;
  doc?: Extraction;
}

/** What the reader may open, from the session (the console's own answer, never the source of the server's). */
export interface ReviewViewer {
  /** Holds the Task inbox: approvals, and the reader's tasks about runs. */
  tasks: boolean;
  /** Holds Document review. */
  documents: boolean;
  /** A workspace administrator: decides any run through Core's run review. */
  admin: boolean;
  /**
   * Holds Schedules or the Queue, the pages Core's review/waiting answers (ZT-F2): a task-inbox holder without either was
   * asked it on every page and refused (403) twice. Absent: asked as before.
   */
  runs?: boolean;
  me: number | null;
}

/** The three lists in, with what did not fit on their first page and which source could not be read. */
export interface ReviewLoad {
  items: ReviewItem[];
  /** Waiting beyond the rows read: tasks and documents counted by their service, runs only known to be "more". */
  beyond: { tasks: number; documents: number; runs: boolean };
  /** The sources that answered an error (the others are still listed). */
  failed: ReviewKind[];
  /** The whole count, as the badge and Home show it. */
  total: number;
  overdue: number;
}

const KIND_BASE: Record<ReviewKind, number> = { approval: 1e10, run: 2e10, document: 3e10 };
export const uidOf = (kind: ReviewKind, id: number) => KIND_BASE[kind] + id;

/** The first page each list is read with: the Task inbox's and the queue's own page size. */
export const REVIEW_PAGE = 100;

/** A list call's data, null when it answered an error; undefined when it was not asked (the reader may not open it). */
function read<T>(call: Observable<ApiResponse<T>>): Observable<T | null> {
  return call.pipe(
    map(r => (r?.status === API_SUCCESS ? (r.data ?? null) : null)),
    catchError(() => of(null)),
  );
}

const notAsked = of(undefined);

/**
 * Marks the reads made for the menu's badge (countReview): the shell's own background calls, whose moment depends on when
 * this lazily loaded file arrives. The characterisation harness answers them and leaves them out of a screen's pin, as it
 * does the top bar's picture.
 */
export const BADGE_READ = new HttpContextToken<boolean>(() => false);

/** The three sources, read in parallel as the reader; each one the reader may not open is not asked. */
export function loadReview(http: HttpClient, viewer: ReviewViewer, context?: HttpContext): Observable<ReviewLoad> {
  const inbox = `${API_BASE}/taskInbox.json`;
  const page = { params: { limit: REVIEW_PAGE }, context };
  return forkJoin({
    count: viewer.tasks ? read(http.get<ApiResponse<TaskCount>>(`${inbox}/count`, { context })) : notAsked,
    mine: viewer.tasks ? read(http.get<ApiResponse<InboxTask[]>>(`${inbox}/mine`, page)) : notAsked,
    teams: viewer.tasks ? read(http.get<ApiResponse<InboxTask[]>>(`${inbox}/teams`, page)) : notAsked,
    // A reviewer's runs come with their tasks; Core's list adds the pipeline, when it finished and whether it is
    // individual review. Without Schedules or the Queue it answers 403, and the tasks are listed without it.
    runs: viewer.admin || (viewer.tasks && viewer.runs !== false)
      ? read(http.get<ApiResponse<{ runs?: WaitingRun[]; more?: boolean }>>(`${API_BASE}/sourceJob.json/review/waiting`, { context })) : notAsked,
    documents: viewer.documents
      ? read(http.get<ApiResponse<{ items?: Extraction[]; total?: number }>>(`${API_BASE}/documentReview.json/queue`,
        { params: { page: 0, size: REVIEW_PAGE, status: 'Review' }, context }))
      : notAsked,
  }).pipe(map(a => merge(viewer, {
    count: a.count ?? null,
    mine: a.mine === undefined ? [] : a.mine,
    teams: a.teams === undefined ? [] : a.teams,
    runs: a.runs?.runs ?? [],
    runsMore: !!a.runs?.more,
    runsFailed: a.runs === null && viewer.admin,
    documents: a.documents === undefined ? [] : a.documents === null ? null : a.documents.items ?? [],
    documentTotal: a.documents?.total ?? 0,
  })));
}

/** The answers, as one list: what is read, laid out; no call here. Exported for the screen's tests. */
export function merge(viewer: ReviewViewer, a: {
  count: TaskCount | null; mine: InboxTask[] | null; teams: InboxTask[] | null;
  runs: WaitingRun[]; runsMore: boolean; runsFailed: boolean;
  documents: Extraction[] | null; documentTotal: number;
}): ReviewLoad {
  const items: ReviewItem[] = [];
  const failed: ReviewKind[] = [];
  if (a.mine === null || a.teams === null) failed.push('approval');
  if (a.runsFailed) failed.push('run');
  if (a.documents === null) failed.push('document');

  const runs = new Map(a.runs.map(r => [r.jobQueueId, r]));
  const covered = new Set<number>();
  const seen = new Set<number>();
  const tasks = [...(a.mine ?? []).map(t => ({ t, mine: true })), ...(a.teams ?? []).map(t => ({ t, mine: false }))];
  for (const { t, mine } of tasks) {
    if (t.state !== 'Open' || seen.has(t.id)) continue;
    seen.add(t.id);
    const runId = runOf(t);
    const ownRequest = t.requestedBy != null && t.requestedBy === viewer.me;
    const approval = t.stepType === 'approval';
    const run = runId != null ? runs.get(runId) : undefined;
    if (runId != null) covered.add(runId);
    const individual = !!run?.individual;
    const pickable = approval && !ownRequest && t.requestState !== 'Approved' && !individual;
    items.push({
      uid: uidOf(runId != null ? 'run' : 'approval', t.id), kind: runId != null ? 'run' : 'approval', via: 'task', id: t.id,
      runId: runId ?? undefined, jobId: run?.jobId,
      title: runId != null && run ? `Run #${runId}` : t.requestTitle || t.name,
      from: run?.jobName || t.workflowName || t.workflow || '',
      since: run?.finishedAt ?? t.createdAt ?? null, due: t.dueAt ?? null, overdue: !!t.overdue,
      waitsOn: waitsOnTask(t, mine, viewer.me),
      pickable, whyNot: pickable ? '' : ownRequest ? 'Your own request: someone else decides it.'
        : individual ? 'Its pipeline requires individual review: open it to decide.'
        : !approval ? 'A task step: open it to do it.' : 'No longer waiting for a decision.',
      stepType: t.stepType, individual, task: t, run,
    });
  }
  // Core's runs that no task of the reader's covers: an administrator decides them through Core's run review.
  if (viewer.admin) {
    for (const run of a.runs) {
      if (covered.has(run.jobQueueId)) continue;
      const individual = !!run.individual;
      items.push({
        uid: uidOf('run', run.jobQueueId), kind: 'run', via: 'core', id: run.jobQueueId, runId: run.jobQueueId, jobId: run.jobId,
        title: `Run #${run.jobQueueId}`, from: run.jobName || `Schedule ${run.jobId}`,
        since: run.finishedAt, due: null, overdue: false, waitsOn: partiesWaiting(run),
        pickable: !individual, whyNot: individual ? 'Its pipeline requires individual review: open it to decide.' : '',
        individual, run,
      });
    }
  }
  for (const doc of a.documents ?? []) {
    const heldByOther = !!doc.claimActive && doc.claimedBy != null && doc.claimedBy !== viewer.me;
    const pickable = doc.status === 'Review' && !heldByOther;
    items.push({
      uid: uidOf('document', doc.extractionId), kind: 'document', via: 'document', id: doc.extractionId,
      title: `Document ${doc.extractionId}`, from: doc.documentTypeName || doc.documentTypeKey || 'Not classified',
      since: doc.dateFinished || doc.dateCreated || null, due: null, overdue: false,
      waitsOn: doc.claimActive && doc.claimedBy != null
        ? (doc.claimedBy === viewer.me ? 'You (claimed)' : `Claimed by ${doc.claimedByName || 'user ' + doc.claimedBy}`)
        : 'Any reviewer',
      pickable, whyNot: pickable ? '' : heldByOther ? 'Claimed by someone else: they decide it.' : 'Already decided.',
      doc,
    });
  }
  sortItems(items);

  const loadedTasks = seen.size;
  const taskTotal = a.count ? (a.count.mine ?? 0) + (a.count.teams ?? 0) : loadedTasks;
  const beyond = {
    tasks: Math.max(0, taskTotal - loadedTasks),
    documents: Math.max(0, a.documentTotal - (a.documents?.length ?? 0)),
    runs: viewer.admin && a.runsMore,
  };
  return {
    items, beyond, failed,
    total: items.length + beyond.tasks + beyond.documents,
    overdue: items.filter(i => i.overdue).length,
  };
}

/** Overdue first, then the soonest due, then the longest waiting: the order a reviewer works in. */
export function sortItems(items: ReviewItem[]): ReviewItem[] {
  const at = (s: string | null) => instantMs(s) ?? Number.MAX_SAFE_INTEGER;
  return items.sort((x, y) => Number(y.overdue) - Number(x.overdue)
    || (x.due && y.due ? at(x.due) - at(y.due) : x.due ? -1 : y.due ? 1 : 0)
    || at(x.since) - at(y.since) || x.uid - y.uid);
}

/** The run a task is about ("pipeline-run:8311"), or null. */
export function runOf(t: Pick<InboxTask, 'subjectType' | 'subjectId'>): number | null {
  const m = /^pipeline-run:(\d+)$/.exec(t.subjectId ?? '');
  if (m) return Number(m[1]);
  if ((t.subjectType === 'pipeline_run' || t.subjectType === 'pipeline-run') && /^\d+$/.test(t.subjectId ?? '')) return Number(t.subjectId);
  return null;
}

function waitsOnTask(t: InboxTask, mine: boolean, me: number | null): string {
  if (t.assigneeUserId != null) return t.assigneeUserId === me || mine ? 'You' : 'A colleague';
  if (t.assigneeKind === 'role') return t.assigneeValue === 'TENANT_ADMIN' ? 'Administrators' : 'Any member';
  return mine ? 'You' : 'Your teams';
}

/** "Internal review", or which party's review is still to come. */
export function partiesWaiting(run: Pick<WaitingRun, 'required' | 'decisions'>): string {
  const decided = new Set((run.decisions ?? []).map(d => (d.party ?? '').toLowerCase()));
  const waiting = (run.required ?? []).filter(p => !decided.has(p.toLowerCase()));
  if (!waiting.length) return 'A reviewer';
  return waiting.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' and ') + ' review';
}

/** "4 min", "3 h", "2 d": a span of minutes, as the list's Due / age column says it. */
export function spanOf(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hours = Math.round(m / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** How long an item has waited ("3 h"), '' without a time. */
export function ageOf(since: string | null, now: number): string {
  const at = instantMs(since);
  return at == null ? '' : spanOf((now - at) / 60_000);
}

/** How long until it is due ("Due in 3 h", "Due now"), '' without a due time. */
export function dueIn(due: string | null, now: number): string {
  const at = instantMs(due);
  if (at == null) return '';
  const minutes = (at - now) / 60_000;
  return minutes <= 1 ? 'Due now' : `Due in ${spanOf(minutes)}`;
}

/** How many of each kind wait, the rows beyond the first pages included: Home's line under the count. */
export function countKinds(load: ReviewLoad): { approval: number; run: number; document: number } {
  const n = (kind: ReviewKind) => load.items.filter(i => i.kind === kind).length;
  // Tasks beyond the first page are counted with the approvals: the service counts them, not what they are about.
  return { approval: n('approval') + load.beyond.tasks, run: n('run'), document: n('document') + load.beyond.documents };
}

/** The Review count the menu's badge and Home show (TaskCountService.review). */
export interface ReviewCount {
  total: number;
  overdue: number;
  /** More runs wait than Core lists at once: the count reads "N+". */
  more: boolean;
  kinds: { approval: number; run: number; document: number };
}

/**
 * TaskCountService's Review count, in this lazily loaded file so the menu's bundle does not carry it: the sources read as
 * the reader and laid out exactly as the page lays them out, so the badge and the list never disagree. Nothing is read
 * for someone who may decide nothing (a viewer); a screen's test without an HTTP client counts nothing.
 */
export function countReview(target: { injector: Injector; review: WritableSignal<ReviewCount | null> }): void {
  const auth = target.injector.get(AuthService);
  const http = target.injector.get(HttpClient, null);
  const viewer: ReviewViewer = {
    tasks: auth.canOpen('task-inbox'), documents: auth.canOpen('document-review'),
    admin: typeof auth.isTenantAdmin === 'function' && auth.isTenantAdmin(), me: auth.user()?.appUserId ?? null,
    runs: auth.canOpen('jobs') || auth.canOpen('queue'),
  };
  if (!http || (!viewer.tasks && !viewer.documents && !viewer.admin)) { target.review.set(null); return; }
  loadReview(http, viewer, new HttpContext().set(BADGE_READ, true)).subscribe({
    next: load => target.review.set({ total: load.total, overdue: load.overdue, more: load.beyond.runs, kinds: countKinds(load) }),
    error: () => {},
  });
}
