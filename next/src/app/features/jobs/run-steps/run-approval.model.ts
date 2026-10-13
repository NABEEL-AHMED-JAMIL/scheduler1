import { instantMs } from '../../../core/instant';
import { StepApproval, StepExecution, StepTimeline } from './run-steps.model';

/**
 * A run that waits at an Approval step (MIG-346), as the run page says it (run page polish 2026-10-12): the step and its
 * request, who it waits on by name, since when and until when, and how long the run has been going. Pure, for the specs.
 */

/** The step the run waits at, and its request; null when it waits at none. */
export interface WaitingApproval { step: StepExecution; approval: StepApproval; }

export function waitingApproval(timeline: StepTimeline | null | undefined): WaitingApproval | null {
  for (const step of timeline?.steps ?? []) {
    if (step.approval?.waiting && step.approval.status === 'PENDING') return { step, approval: step.approval };
  }
  return null;
}

/** The group ids (access profiles) the run's Approval steps go to, for their names. */
export function approvalGroups(timeline: StepTimeline | null | undefined): string[] {
  const ids = (timeline?.steps ?? []).map(s => s.approval?.reviewers)
    .filter(who => who?.kind === 'group' && !!who.value).map(who => String(who!.value));
  return [...new Set(ids)];
}

/**
 * Who an approval goes to, in words: a role as the people it names, a group by its name ("the Reviewer group") -- never
 * its id. A group whose name the reader may not read is "the pipeline's reviewer group".
 */
export function reviewersWords(reviewers: StepApproval['reviewers'], groupNames: ReadonlyMap<string, string>): string {
  if (!reviewers?.kind) return 'the workspace administrators';
  if (reviewers.kind === 'role') return reviewers.value === 'TENANT_USER' ? 'the workspace users' : 'the workspace administrators';
  const name = reviewers.value ? groupNames.get(String(reviewers.value)) : undefined;
  return name ? `the ${name} group` : 'the pipeline\'s reviewer group';
}

/** A span as a person says it, coarse enough to read at a glance (and to fit the strip): "<1 min", "45 min", "7 h", "2 d 17 h". */
export function spanWords(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return '<1 min';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

/** A moment next to now: "7 h ago", "in 2 d 17 h", "just now"; '' for none. */
export function fromNow(at: string | null | undefined, now: number): string {
  const ms = instantMs(at);
  if (ms === null) return '';
  const diff = now - ms;
  if (Math.abs(diff) < 60_000) return 'just now';
  return diff > 0 ? `${spanWords(diff)} ago` : `in ${spanWords(-diff)}`;
}

/**
 * The summary strip's Duration while the run is going, counted live: "Running · 7 h", or "Running · waiting 7 h" while it
 * waits at an Approval step (since the request). A run that has ended keeps its measured duration.
 */
export function liveDuration(startTime: string | null | undefined, waiting: WaitingApproval | null, now: number): string {
  if (waiting) {
    const since = instantMs(waiting.approval.requestedAt) ?? instantMs(waiting.step.startedAt);
    return since === null ? 'Running · waiting for approval' : `Running · waiting ${spanWords(now - since)}`;
  }
  const started = instantMs(startTime);
  return started === null ? 'Running' : `Running · ${spanWords(now - started)}`;
}

/** How the reader acts on the request: decide here (their Task inbox task), open the Review inbox, or only read who decides. */
export type ApprovalRoute = 'decide' | 'inbox' | 'none';

export function approvalRoute(hasTask: boolean, canOpenInbox: boolean): ApprovalRoute {
  return hasTask ? 'decide' : canOpenInbox ? 'inbox' : 'none';
}
