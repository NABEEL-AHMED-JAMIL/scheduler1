/**
 * Report Studio's shapes as media-service sends them (MIG-403). Times are instants ("...Z"); the console prints them
 * with serverTime, 24-hour. Ids are ULIDs. Storage keys never reach the browser.
 */

export interface Problem {
  severity: 'ERROR' | 'WARNING';
  stage: string;
  code: string;
  message: string;
  componentId?: string;
  path?: string;
}

export interface TemplateRow {
  templateId: string;
  tenantId: number;
  name: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  currentPublishedVersion?: number | null;
  draftRevision?: number | null;
  hasDraft: boolean;
  origin: 'BLANK' | 'STARTER' | 'COPY' | 'IMPORT';
  originRef?: string | null;
  rowVersion: number;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** MIG-406: who made it and who changed it last, by name (Identity). */
  ownerName?: string | null;
  updatedByName?: string | null;
}

export interface StarterRow { key: string; name: string; description?: string | null; category?: string | null; components: number; }

export interface TemplateLibrary { templates: TemplateRow[]; starters: StarterRow[]; }

export interface VersionRow {
  versionId: string;
  templateId: string;
  version: number;
  state: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  revision: number;
  schemaVersion: string;
  sha256: string;
  basedOnVersion?: number | null;
  changeSummary?: string | null;
  createdBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedBy?: number | null;
  publishedAt?: string | null;
  definition?: TemplateDefinition;
}

export interface TemplateDefinition { schemaVersion: string; template: Record<string, unknown> & { name?: string; components?: unknown[] }; }

export interface SampleRow {
  sampleId: string;
  templateId: string;
  name: string;
  kind: 'INLINE_JSON' | 'RUN_OUTPUT';
  format: string;
  bytes?: number | null;
  jobQueueId?: number;
  runDatasetId?: number;
  createdAt?: string | null;
}

/** An open "Ask for approval" on the draft (MIG-404): who asked, when, for which revision, and whether it is still that one. */
export interface ApprovalRequest {
  requestedBy?: number | null;
  requestedByName?: string | null;
  requestedAt?: string | null;
  revision: number;
  note?: string | null;
  current: boolean;
}

export interface TemplateDetail extends TemplateRow {
  draft?: VersionRow;
  published?: VersionRow;
  versions: VersionRow[];
  samples: SampleRow[];
  reports: number;
  activity?: ActivityRow[];
  approval?: ApprovalRequest | null;
}

/** A template's data contract, as the Data tab and Create report read it (MIG-404): paths only. */
export interface ContractField { path: string; type: string; required: boolean; label?: string | null; }
export interface TemplateContract {
  templateId: string; tenantId: number; name: string; version: number; state: string; rootPath: string; fields: ContractField[];
}

/** Where a report's data comes from: each read as the person asking (media-service's Connectors). */
export type SourceRef =
  | { connector: 'INLINE_JSON'; text: string; format?: 'JSON' | 'CSV' }
  | { connector: 'RUN_OUTPUT'; jobQueueId: number; runDatasetId: number }
  | { connector: 'BUCKET_OBJECT'; bucket: string; key: string }
  | { connector: 'UPLOAD' | 'SOURCE'; sourceId: string }
  | { connector: 'SAMPLE'; sampleId: string }
  | { connector: 'SNAPSHOT'; snapshotId: string }
  /** Several files as one report's data (media 2026-10-20): each part any one-file source, side by side as {name: its rows}. */
  | { connector: 'BUNDLE'; parts: Record<string, OneFileSource> };

/** Whether data may be kept as a template's test sample (media's saveSample: pasted data, a run's output, or several files). */
export function keepable(s: SourceRef | null | undefined): boolean {
  return !!s && (s.connector === 'INLINE_JSON' || s.connector === 'RUN_OUTPUT' || s.connector === 'BUNDLE');
}

/** A source that is one file: what a bundle's part may be (never a bundle or a snapshot). */
export type OneFileSource = Exclude<SourceRef, { connector: 'BUNDLE' } | { connector: 'SNAPSHOT' }>;

/** At most this many files in a bundle (media's Connectors.BUNDLE_PARTS); a part's name is a letter, then letters, digits or _. */
export const BUNDLE_MAX_PARTS = 8;
export const BUNDLE_PART_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * A bundle's parts as a snapshot names them: by its ref ({connector: BUNDLE, parts: {name: ref}}) when the answer carries it,
 * else from its label -- media's "2 files: summary, latest · <the first part's source>" (since 502aa0d, at most 160
 * characters, cut with "…"), or the first form "2 files: summary (summary.csv) + latest (latest.csv)"; null when it is not
 * a bundle. A name the label cut short is left out.
 */
export function bundleParts(s: { label?: string | null; sourceRef?: { connector?: string; parts?: Record<string, unknown> } | null } | null | undefined):
  { name: string; label: string }[] | null {
  if (!s) return null;
  const parts = s.sourceRef?.connector === 'BUNDLE' ? s.sourceRef.parts : undefined;
  const fromLabel = new Map<string, string>();
  const m = /^(\d+) files: (.*)$/s.exec(s.label ?? '');
  if (m && / \+ |^[A-Za-z][A-Za-z0-9_]{0,63} \(/.test(m[2])) {
    for (const piece of m[2].split(/ \+ (?=[A-Za-z][A-Za-z0-9_]{0,63} \()/)) {
      const p = /^([A-Za-z][A-Za-z0-9_]{0,63}) \((.*?)\)?(\.\.\.)?$/s.exec(piece.trim());
      if (p) fromLabel.set(p[1], p[2]);
    }
  } else if (m) {
    const [names, ...rest] = m[2].split(' · ');
    const list = names.split(', ');
    for (const [i, n] of list.entries()) {
      const name = n.trim();
      if (BUNDLE_PART_NAME.test(name) && !(i === list.length - 1 && !rest.length && name.endsWith('…'))) fromLabel.set(name, '');
    }
    const first = [...fromLabel.keys()][0];
    if (first && rest.length) fromLabel.set(first, rest.join(' · '));
  }
  if (parts && typeof parts === 'object') return Object.keys(parts).map(name => ({ name, label: fromLabel.get(name) ?? '' }));
  return m ? [...fromLabel].map(([name, label]) => ({ name, label })) : null;
}

export interface DataSourceRow {
  sourceId: string;
  name: string;
  connector: 'RUN_OUTPUT' | 'BUCKET_OBJECT' | 'UPLOAD' | 'INLINE_JSON';
  format: string;
  rootPath: string;
  bytes?: number | null;
  records?: number;
  jobQueueId?: number;
  runDatasetId?: number;
  bucket?: string;
  key?: string;
  createdAt?: string | null;
}

export interface SchemaField { path: string; type: string; types?: string[]; nullable: boolean; }

export interface TreeNode { path: string; type: string; length?: number; children?: TreeNode[]; item?: TreeNode; truncated?: boolean; }

export interface InspectResult {
  records: number;
  shape: 'list' | 'object' | 'value';
  schema: SchemaField[];
  warnings: string[];
  sample: unknown[];
  sampleRecords: number;
  inspected: number;
  tree: TreeNode;
  label: string;
  connector: string;
  format: string;
  bytes: number;
  sha256: string;
  rootPath: string;
}

export interface PreviewResult {
  html?: string | null;
  records: number;
  label?: string | null;
  /** The distinct data paths the template reads (the designer's "N data fields used"). */
  fields?: number;
  problems: Problem[];
  summary: { errors: number; warnings: number; valid: boolean };
}

/** A pipeline run reports were asked from lately (MIG-404, the Overview's "Connected pipelines"). */
export interface PipelineRunUse {
  tenantId: number; pipelineRunId: number; lastUsedAt: string; jobs: number; failed: number; templateIds: string[];
}

export interface OutputRow { format: 'PDF' | 'HTML'; bytes: number; pages?: number | null; sha256: string; fileName: string; }

export interface SnapshotRow {
  snapshotId: string; connector: string; label?: string | null; mode: string; format: string; pipelineRunId?: number | null;
  sourceVersion?: string | null; records?: number | null; bytes: number; sha256: string; takenAt?: string | null;
  /** Where the data came from (ids only); a bundle's names its parts. Not every answer carries it. */
  sourceRef?: { connector?: string; parts?: Record<string, unknown> } | null;
}

export interface ReportVersionRow {
  versionId: string;
  reportId: string;
  version: number;
  parentVersion?: number | null;
  templateVersion: number;
  snapshotId: string;
  jobId: string;
  jobLabel?: string;
  jobMs?: number | null;
  reason?: string | null;
  pages?: number | null;
  rendererVersion?: string | null;
  createdBy?: number | null;
  createdAt?: string | null;
  outputs: OutputRow[];
  diagnostics: Problem[];
  snapshot?: SnapshotRow;
  config?: Record<string, unknown>;
  /** MIG-406: its approval, and the certification signature that approval put on its PDF. */
  approval?: Approval | null;
}

/** A report version's approval (MIG-406): never by whoever generated it; signed when its PDF was certified. */
export interface Approval {
  approvalId: string;
  reportId: string;
  version: number;
  approvedBy: number;
  approverName?: string | null;
  approvedAt: string;
  note?: string | null;
  signed: boolean;
  notSignedReason?: string | null;
  signedSha256?: string | null;
  signedBytes?: number | null;
  originalSha256?: string | null;
  certificateSha256?: string | null;
  certificateSubject?: string | null;
  reason?: string | null;
}

/** What Verify signature says (MIG-406): the file's own signature facts and whether it is one of the workspace's approved versions. */
export interface VerifyResult {
  source: 'stored' | 'uploaded';
  sha256: string;
  verified: boolean;
  matchesStored: boolean;
  certificateMatches: boolean;
  problems: string[];
  reportId?: string;
  reportLabel?: string;
  reportName?: string;
  version?: number;
  approval?: Approval;
  signature: { signed: boolean; intact: boolean; coversWholeFile: boolean; certified: boolean; signerName?: string | null;
    signatureName?: string | null; reason?: string | null; location?: string | null; signedAt?: string | null; certificateSha256?: string | null;
    certificateNotAfter?: string | null; };
}

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'VALIDATING' | 'RENDERING_HTML' | 'RENDERING_PDF' | 'STORING_OUTPUT' | 'SUCCEEDED'
  | 'FAILED' | 'CANCELLED';

export interface JobRow {
  jobId: string;
  tenantId: number;
  jobNo: number;
  label: string;
  reportId: string;
  reportName?: string;
  reportLabel?: string;
  templateId: string;
  templateName?: string;
  templateVersion?: number;
  status: JobStatus;
  progressPct: number;
  errorCode?: string | null;
  error?: string | null;
  retryable: boolean;
  source: string;
  pipelineRunId?: number | null;
  resultVersion?: number | null;
  requestedBy?: number | null;
  /** The name the console sent with the request (MIG-404). */
  requestedByName?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  pages?: number | null;
  formats: string[];
  diagnostics: Problem[];
}

export interface ReportRow {
  reportId: string;
  tenantId: number;
  reportNo: number;
  label: string;
  name: string;
  templateId: string;
  templateName: string;
  status: 'GENERATED' | 'FAILED' | 'ARCHIVED';
  currentVersion?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  current?: ReportVersionRow;
  lastJob?: JobRow;
  /** MIG-406: the current version is approved and its PDF certified. */
  signed?: boolean;
}

export interface ActivityRow { actor?: number | null; action: string; at: string; detail: Record<string, unknown>; }

export interface ReportDetail extends ReportRow { versions: ReportVersionRow[]; jobs: JobRow[]; activity: ActivityRow[]; }

export interface StudioOverview {
  figures: {
    versionsThisMonth: number; reports: number; publishedTemplates: number; templatesWithDrafts: number; templates: number;
    jobsFinishedThisMonth: number; jobsSucceededThisMonth: number; failedLast7Days: number; running: number;
  };
  recentReports: ReportRow[];
  recentJobs: JobRow[];
  failedJobs: JobRow[];
  templateActivity: TemplateRow[];
  pipelineRuns?: PipelineRunUse[];
}

/** A job still on its way: the console polls it. */
export function isRunning(status: JobStatus | string | undefined | null): boolean {
  return !!status && !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status);
}

const STAGE_WORDS: Record<string, string> = {
  QUEUED: 'Queued', PROCESSING: 'Preparing', VALIDATING: 'Checking', RENDERING_HTML: 'Rendering HTML', RENDERING_PDF: 'Rendering PDF',
  STORING_OUTPUT: 'Storing', SUCCEEDED: 'Completed', FAILED: 'Failed', CANCELLED: 'Cancelled',
};

/** A job's stage as a person reads it ("Rendering PDF"). */
export function stageWord(status: string | null | undefined): string {
  return STAGE_WORDS[status ?? ''] ?? (status ?? '—');
}

/** The status chip's word for a template, a report or a job (the shared status pill's vocabulary). */
export function chipWord(status: string | null | undefined): string {
  switch (status) {
    case 'PUBLISHED': return 'Published';
    case 'DRAFT': return 'Draft';
    case 'ARCHIVED': return 'Archived';
    case 'SUPERSEDED': return 'Superseded';
    case 'GENERATED': return 'Ready';
    case 'SUCCEEDED': return 'Completed';
    case 'FAILED': return 'Failed';
    case 'CANCELLED': return 'Cancelled';
    case 'QUEUED': return 'Queued';
    default: return isRunning(status) ? 'Running' : (status ?? '—');
  }
}

/** Bytes as a person reads them. */
export function size(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Where a template came from, in words. */
export function originWord(t: Pick<TemplateRow, 'origin' | 'originRef'>): string {
  switch (t.origin) {
    case 'STARTER': return `From the ${(t.originRef ?? '').replace('starter:', '').replace(/-/g, ' ')} starter`;
    case 'COPY': return 'A copy';
    case 'IMPORT': return 'Imported JSON';
    default: return 'Blank';
  }
}

/** The pasted text, checked as JSON in the browser first (the server checks again): null when it reads, else why not. */
export function jsonProblem(text: string): string | null {
  if (!text.trim()) return 'Paste some JSON first.';
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return `That is not valid JSON: ${(e as Error).message}`;
  }
}

/** Pasted test data is at most 5 MB (media-service's INLINE_MAX). */
export const PASTE_MAX_BYTES = 5 * 1024 * 1024;

/** A key the console sends with one generate request, so a double click makes one job. */
export function idempotencyKey(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
  return `console#${random}`;
}
