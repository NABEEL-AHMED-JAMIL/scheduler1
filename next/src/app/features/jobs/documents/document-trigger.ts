/**
 * MIG-364: a job's document trigger -- the second "Event" way to start a job: when a document of one type is approved,
 * by a reviewer or automatically -- and what the approved documents did to the job, as Core's
 * sourceJob.json/documentTrigger and documentApprovals answer. It mirrors the inbox trigger (inbox/inbox-trigger.ts).
 */
import { BATCH_MAX } from '../inbox/inbox-trigger';

export interface DocumentTrigger {
  jobId: number;
  configured: boolean;
  enabled?: boolean;
  /** The document type whose approved documents start the job. */
  documentTypeId?: number | null;
  /** How many documents that waited one run takes (1: a run per document). */
  batchSize?: number | null;
  dateUpdated?: string | null;
  /** How many approved documents wait for the job's next run now. */
  waiting?: number | null;
}

export interface DocumentApproval {
  extractionId: number;
  typeVersion?: number | null;
  documentTypeId?: number | null;
  ocrDocumentId?: number | null;
  /** Who approved it: a reviewer, or the type's auto-approve threshold. */
  approval?: 'auto' | 'reviewer' | string | null;
  /** Started (jobQueueId is its run), Waiting (for the run in flight to end; place is its turn) or Skipped (reason says why). */
  outcome: 'Started' | 'Waiting' | 'Skipped' | string;
  reason?: string | null;
  jobQueueId?: number | null;
  dateCreated?: string | null;
  startedAt?: string | null;
  /** A waiting document's place in the line -- 1 is taken by the next run. */
  place?: number | null;
}

/** The trigger, or null when the answer is not one (an unknown endpoint answers an empty list). */
export function triggerOf(data: unknown): DocumentTrigger | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as DocumentTrigger;
}

/** Only the approvals that are approvals: anything else in the answer is dropped rather than drawn. */
export function approvalsOf(data: unknown): DocumentApproval[] {
  return Array.isArray(data)
    ? data.filter(a => a && typeof a === 'object' && a.extractionId !== null && a.extractionId !== undefined && Number.isFinite(Number(a.extractionId)))
    : [];
}

/** A document type as the sentences name it: its name when the workspace's list has it, its id otherwise. */
export function typeName(documentTypeId: number | null | undefined, names?: ReadonlyMap<number, string> | null): string {
  if (documentTypeId === null || documentTypeId === undefined) return 'the chosen type';
  return names?.get(Number(documentTypeId)) ?? `document type ${documentTypeId}`;
}

/** The trigger in one sentence, in the words Core's save answers with. */
export function triggerSentence(trigger: DocumentTrigger | null | undefined, names?: ReadonlyMap<number, string> | null): string {
  if (!trigger?.configured) return 'No approved document starts this schedule.';
  if (trigger.enabled === false) return 'The document trigger is off: documents that are approved do not start this schedule.';
  const type = typeName(trigger.documentTypeId, names);
  const documents = names?.has(Number(trigger.documentTypeId))
    ? `Every document of '${type}' that is approved starts this schedule.`
    : `Every document of ${type} that is approved starts this schedule.`;
  const batch = Number(trigger.batchSize ?? 1);
  return batch > 1
    ? `${documents} Documents approved while a run is going wait; the next run takes up to ${batch} of them.`
    : documents;
}

/** How many approved documents wait for the job's next run, or '' when none do. */
export function waitingSentence(trigger: DocumentTrigger | null | undefined): string {
  const waiting = Number(trigger?.waiting ?? 0);
  if (!waiting) return '';
  return waiting === 1
    ? '1 document waits for the run in flight to end.'
    : `${waiting} documents wait for the run in flight to end, in the order they were approved.`;
}

/** How many documents one run may take: the inbox's limit, 1 to 50. */
export { BATCH_MAX };
export function batchProblem(batch: number | string | null | undefined): string {
  const value = Number(batch);
  return Number.isInteger(value) && value >= 1 && value <= BATCH_MAX ? '' : `Documents per run is a whole number from 1 to ${BATCH_MAX}.`;
}

/**
 * The documents each run started, by its run id, in the order they were approved: one for a run per document, several
 * for a run that took the documents that waited. The first is the one the run's chip links to.
 */
export function runsStartedByDocument(approvals: DocumentApproval[]): Map<number, DocumentApproval[]> {
  const map = new Map<number, DocumentApproval[]>();
  // The answer is newest first; a run's documents read oldest first.
  for (const approval of [...approvals].reverse()) {
    if (approval.outcome !== 'Started' || !approval.jobQueueId) continue;
    const run = Number(approval.jobQueueId);
    const list = map.get(run) ?? [];
    list.push(approval);
    map.set(run, list);
  }
  return map;
}

/** The chip on a run a document started: "Document #812", or "3 documents" with every id in its title. */
export function startedChip(documents: DocumentApproval[]): { text: string; title: string } {
  if (documents.length === 1) {
    return { text: `Document #${documents[0].extractionId}`, title: `Started by document #${documents[0].extractionId} being approved` };
  }
  return {
    text: `${documents.length} documents`,
    title: `Started by documents ${documents.map(d => '#' + d.extractionId).join(', ')} being approved`,
  };
}

/** How the document was approved, in words. */
export function approvalWord(approval: DocumentApproval['approval']): string {
  return approval === 'auto' ? 'approved automatically' : approval === 'reviewer' ? 'approved by a reviewer' : 'approved';
}
