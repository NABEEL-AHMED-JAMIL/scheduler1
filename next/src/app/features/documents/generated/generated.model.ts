import { instantMs } from '../../../core/instant';
import { RunOutput } from '../../jobs/run-steps/run-steps.model';
import { ObjectSummary } from '../../objects/storage.service';

/**
 * MIG-253: Documents' generated outputs -- a dataset rendered through media-service's render
 * (MIG-232), and the Reports list built from what already exists.
 *
 * There is no table of generated files to read. Reports is assembled from two places: renders
 * saved to a bucket (a folder listing, `reports/` by default) and what recent runs put out
 * (sourceJob.json/runOutputs across a capped number of recent runs). A proper generated-outputs
 * endpoint is a backend gap; until it exists the list says how far it looked.
 *
 * @author Nabeel Ahmed
 */

/** One output format of GET /documentConverter.json/renderFormats. */
export interface RenderFormat { format: string; contentType: string; usesTemplate: boolean; maxRows: number; }
export interface RenderPlaceholder { name: string; description: string; }
export interface RenderFormats { formats: RenderFormat[]; placeholders: RenderPlaceholder[]; limits?: Record<string, number>; }

/** A saved report template (media_db.report_template), as fetchAllTemplates lists it. */
export interface ReportTemplateSummary {
  reportTemplateId: number;
  name: string;
  description?: string | null;
  pageSize?: string | null;
  orientation?: string | null;
  watermarkText?: string | null;
  dateUpdated?: string | null;
}

/** POST /documentConverter.json/render's answer. */
export interface RenderResult {
  outputFormat: string;
  outputFileName: string;
  outputContentType: string;
  outputFileSize?: number;
  outputBase64: string;
  rowCount?: number;
  columnCount?: number;
  pageCount?: number | null;
  templateName?: string | null;
  save?: boolean;
  bucketName?: string | null;
  outputStorageKey?: string | null;
}

export const PAGE_SIZES = ['A4', 'A3', 'LETTER', 'LEGAL'] as const;
export type PageSize = typeof PAGE_SIZES[number];
export type Orientation = 'portrait' | 'landscape';

/** How the document is laid out: a saved template, or the default layout with these options. */
export interface TemplateOptions {
  templateId: number | null;
  title: string;
  pageSize: PageSize;
  orientation: Orientation;
  watermark: string;
}

export const DEFAULT_OPTIONS: TemplateOptions = { templateId: null, title: '', pageSize: 'A4', orientation: 'portrait', watermark: '' };

export type DatasetParse =
  | { ok: true; dataset: unknown; rows: number; columns: string[] }
  | { ok: false; error: string };

const SHAPE = 'A dataset is a list of records (JSON objects), or columns and rows.';
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function columnsOf(records: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const r of records) for (const k of Object.keys(r)) seen.add(k);
  return [...seen];
}

/**
 * Pasted rows, read the way media-service's DatasetReader reads them (its three shapes), so a
 * mistake is said here rather than after a round trip. The server still checks everything.
 */
export function parseDatasetText(text: string): DatasetParse {
  if (!text.trim()) return { ok: false, error: 'Paste the rows as JSON.' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `This is not valid JSON: ${(e as Error).message}` };
  }
  let rows: number, columns: string[];
  if (Array.isArray(value) || (isRecord(value) && Array.isArray(value['records']))) {
    const records = (Array.isArray(value) ? value : value['records']) as unknown[];
    if (!records.every(isRecord)) return { ok: false, error: SHAPE };
    rows = records.length;
    columns = columnsOf(records as Record<string, unknown>[]);
  } else if (isRecord(value) && Array.isArray(value['columns']) && Array.isArray(value['rows'])) {
    rows = (value['rows'] as unknown[]).length;
    columns = (value['columns'] as unknown[]).map(String);
  } else {
    return { ok: false, error: SHAPE };
  }
  if (!rows) return { ok: false, error: 'The dataset has no rows.' };
  return { ok: true, dataset: value, rows, columns };
}

export interface RenderInput {
  outputFormat: string;
  /** Rows sent with the request (one of parseDatasetText's shapes) -- or: */
  dataset?: unknown;
  /** a table stored in one of the workspace's buckets, read by media-service as the caller. */
  source?: { bucket: string; key: string };
  options: TemplateOptions;
  fileName?: string;
  save?: { bucket: string; folder: string } | null;
}

/**
 * The body of POST /documentConverter.json/render. A saved template is named by its id alone; the
 * default layout goes as an inline template with no body (media-service fills in its default), so
 * the page size, orientation and watermark apply to it. The title rides on the dataset, which is
 * what {{title}} reads; a stored table has no title of its own, so the template's name carries it.
 */
export function renderBody(input: RenderInput): Record<string, unknown> {
  const { options } = input;
  const title = options.title.trim();
  const body: Record<string, unknown> = { outputFormat: input.outputFormat };
  if (input.source) {
    body['source'] = { bucket: input.source.bucket, key: input.source.key };
  } else {
    const data = input.dataset;
    body['dataset'] = !title ? data
      : Array.isArray(data) ? { title, records: data }
      : { ...(data as Record<string, unknown>), title };
  }
  if (options.templateId != null) {
    body['templateId'] = options.templateId;
  } else {
    const template: Record<string, unknown> = {};
    if (title) template['name'] = title;
    template['pageSize'] = options.pageSize;
    template['orientation'] = options.orientation;
    if (options.watermark.trim()) template['watermarkText'] = options.watermark.trim();
    body['template'] = template;
  }
  if (input.fileName?.trim()) body['fileName'] = input.fileName.trim();
  if (input.save?.bucket) {
    body['save'] = true;
    body['bucketName'] = input.save.bucket;
    if (input.save.folder.trim()) body['targetFolder'] = input.save.folder.trim();
  }
  return body;
}

/** The render's file, carried as base64 in the envelope, back as bytes. */
export function base64ToBlob(base64: string, type: string): Blob {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

// ------------------------------------------------------------------------------------------ Reports

/** Where a listed output lives: a bucket object, a file a run kept, or an upload a run made. */
export type ReportOrigin = 'bucket' | 'run-file' | 'run-bucket';
export type ReportStatus = 'Ready' | 'Expired' | 'In storage';

/** One row of Documents › Reports. */
export interface GeneratedReport {
  id: string;
  name: string;
  type: string;
  origin: ReportOrigin;
  created?: string | null;
  size?: number | null;
  status: ReportStatus;
  owner?: string | null;
  bucket?: string | null;
  key?: string | null;
  /** The run that made it, when a run did. */
  jobQueueId?: number;
  jobId?: number;
  jobName?: string | null;
  pipeline?: string | null;
  runDatasetId?: number | null;
  expiresAt?: string | null;
  rowCount?: number | null;
}

/** The run an output list belongs to, with the schedule and pipeline it ran under. */
export interface RunContext {
  jobQueueId: number;
  jobId: number;
  jobName?: string | null;
  pipelineName?: string | null;
  owner?: string | null;
}

/** A file's type as a person names it: its format when known, else its extension. */
export function typeOf(name: string, format?: string | null): string {
  if (format) return format.toUpperCase();
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : 'File';
}

/** The files of one folder listing; subfolders are not outputs. */
export function reportsFromObjects(bucket: string, objects: ObjectSummary[]): GeneratedReport[] {
  return objects.filter(o => !o.folder).map(o => ({
    id: `obj-${bucket}/${o.key}`, name: o.name, type: typeOf(o.name), origin: 'bucket' as const, bucket, key: o.key,
    created: o.lastModified ?? null, size: o.size ?? null, status: 'In storage' as const,
  }));
}

/** What one run put out: a file it kept (downloadable until it expires) and uploads to a bucket. */
export function reportsFromRun(run: RunContext, outputs: RunOutput[]): GeneratedReport[] {
  return outputs.map(o => {
    const common = {
      id: `run-${o.runOutputId}`, name: o.name, type: typeOf(o.name, o.format),
      created: o.recordedAt ?? null, size: o.byteCount ?? null, owner: run.owner ?? null,
      jobQueueId: run.jobQueueId, jobId: run.jobId, jobName: run.jobName ?? null, pipeline: run.pipelineName ?? null,
      rowCount: o.rowCount ?? null,
    };
    return o.kind === 'bucket'
      ? { ...common, origin: 'run-bucket' as const, status: 'In storage' as const, bucket: o.bucket ?? null, key: o.key ?? null }
      : { ...common, origin: 'run-file' as const, status: o.expired ? 'Expired' as const : 'Ready' as const,
          runDatasetId: o.runDatasetId ?? null, expiresAt: o.expiresAt ?? null };
  });
}

/**
 * One list, newest first. An object a run uploaded is listed once, as the run's upload -- the run
 * says which pipeline wrote it, the listing only that it is there.
 */
export function mergeReports(objects: GeneratedReport[], runs: GeneratedReport[]): GeneratedReport[] {
  const fromRuns = new Set(runs.filter(r => r.origin === 'run-bucket').map(r => `${r.bucket}/${r.key}`));
  const all = [...runs, ...objects.filter(o => !fromRuns.has(`${o.bucket}/${o.key}`))];
  const at = (r: GeneratedReport) => instantMs(r.created ?? null) ?? 0;
  return all.sort((a, b) => at(b) - at(a));
}

/** The run that uploaded an object, among the runs read. */
export function findRunOf(reports: GeneratedReport[], bucket: string, key: string): GeneratedReport | undefined {
  return reports.find(r => r.origin === 'run-bucket' && r.bucket === bucket && r.key === key);
}

/** The schedules whose runs are worth reading: those that ran, most recent first, up to `max`. */
export function recentJobs<T extends { jobId: number; lastJobRun?: string | null }>(jobs: T[], max: number): T[] {
  return jobs.filter(j => !!j.lastJobRun)
    .sort((a, b) => (instantMs(b.lastJobRun) ?? 0) - (instantMs(a.lastJobRun) ?? 0))
    .slice(0, max);
}

/** A run's outputs that are datasets it still holds -- what "From an execution" can render. */
export function datasetOf(outputs: RunOutput[]): RunOutput[] {
  return outputs.filter(o => o.kind === 'file' && o.runDatasetId != null && !o.expired);
}
