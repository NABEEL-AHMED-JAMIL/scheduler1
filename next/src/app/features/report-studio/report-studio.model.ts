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

export interface TemplateDetail extends TemplateRow {
  draft?: VersionRow;
  published?: VersionRow;
  versions: VersionRow[];
  samples: SampleRow[];
  reports: number;
}

/** Where a report's data comes from: each read as the person asking (media-service's Connectors). */
export type SourceRef =
  | { connector: 'INLINE_JSON'; text: string; format?: 'JSON' | 'CSV' }
  | { connector: 'RUN_OUTPUT'; jobQueueId: number; runDatasetId: number }
  | { connector: 'BUCKET_OBJECT'; bucket: string; key: string }
  | { connector: 'UPLOAD' | 'SOURCE'; sourceId: string }
  | { connector: 'SAMPLE'; sampleId: string }
  | { connector: 'SNAPSHOT'; snapshotId: string };

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
  problems: Problem[];
  summary: { errors: number; warnings: number; valid: boolean };
}

export interface OutputRow { format: 'PDF' | 'HTML'; bytes: number; pages?: number | null; sha256: string; fileName: string; }

export interface SnapshotRow {
  snapshotId: string; connector: string; label?: string | null; mode: string; format: string; pipelineRunId?: number | null;
  sourceVersion?: string | null; records?: number | null; bytes: number; sha256: string; takenAt?: string | null;
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
