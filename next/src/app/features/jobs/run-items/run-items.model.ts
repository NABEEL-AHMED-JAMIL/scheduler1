import { formatDuration } from '../../../shared/ui/time-format';
import { formatSize } from '../../../shared/ui/format-size';
import { plural } from '../run-steps/run-page.model';

/**
 * The run page's Items tab (MIG-420): a pipeline that works item by item -- each recording, each document, each page --
 * shows what happened to every item, step by step. The shapes are Core's sourceJob.json/runItems* answers; the
 * functions here are the readings the screens make of them, pure, for the specs.
 */

export type ItemStatus = 'running' | 'done' | 'failed';
export type ItemFilter = 'all' | 'done' | 'failed' | 'running';
export const ITEM_FILTERS: readonly ItemFilter[] = ['all', 'done', 'failed', 'running'];

export type CellStatus = 'done' | 'failed' | 'not_run' | 'shared' | 'left_out';

/** What one step did for one item. */
export interface ItemCell {
  status: CellStatus;
  rows?: number | null;
  files?: number | null;
  sharedBy?: number | null;
  reused?: boolean | null;
  hasData?: boolean | null;
}

export interface ItemStepRef { index: number; key: string; name: string; }

export interface RunItem {
  ref: string;
  key: string;
  label: string;
  folder?: string | null;
  parentRef?: string | null;
  position?: number | null;
  status: ItemStatus;
  failedStep?: ItemStepRef | null;
  reason?: string | null;
  attempt?: number | null;
  /** A document with pages: its sub-items' counts. */
  children?: { total: number; done: number; failed: number } | null;
  fileCount?: number | null;
  durationMs?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  cells?: Record<string, ItemCell> | null;
  fields?: Record<string, unknown> | null;
}

export interface ItemStep { index: number; key: string; name: string; task: string; role: 'source' | 'each' | 'fan_out' | 'shared' | 'pass'; }

export interface ItemsSummary {
  items: number;
  done: number;
  failed: number;
  running: number;
  subItems?: number | null;
  /** The failed leaves: what Retry failed items retries. */
  failedItems: number;
  files: number;
  averageMs?: number | null;
  failedAt?: { step: string; count: number }[] | null;
  runStatus?: string | null;
  retryable?: boolean | null;
  /** Why the failed items cannot be retried now, in Core's words; null when they can. */
  retryWhy?: string | null;
  /** What a sub-item is called: "page" for a split document, else "sub-item". */
  childNoun?: string | null;
  /** The step that found the items. */
  source?: string | null;
}

export interface ItemsPage {
  jobQueueId: number;
  itemRun: boolean;
  summary: ItemsSummary;
  steps: ItemStep[];
  fields: string[];
  masked: string[];
  maskNote?: string | null;
  total: number;
  page: number;
  size: number;
  items: RunItem[];
}

/** The list's question (POST sourceJob.json/runItems). */
export interface ItemsQuery {
  jobQueueId: number;
  status: ItemFilter;
  search?: string;
  parent?: string;
  page: number;
  size: number;
  fields?: string[];
}

export interface ItemDetailStep {
  index: number; key: string; name: string; task?: string | null; status: CellStatus | 'running';
  note?: string | null; durationMs?: number | null; rows?: number | null; files?: number | null; sharedBy?: number | null;
  hasData?: boolean | null; reusedFromAttempt?: number | null;
}

export interface ItemFile {
  fileRef: string; name: string; role: 'input' | 'output'; stepKey?: string | null; stepName?: string | null;
  format?: string | null; bytes?: number | null; previewable?: boolean | null; expired?: boolean | null; fileId?: number | null;
}

export interface ItemVersion { attempt: number; status: ItemStatus; current: boolean; endedAt?: string | null; reason?: string | null; }

export interface ItemDetail {
  item: RunItem & { index: number; of: number; prevRef?: string | null; nextRef?: string | null; current?: boolean | null };
  steps: ItemDetailStep[];
  fileCount: number;
  files: ItemFile[];
  versions: ItemVersion[];
  retry: { possible: boolean; fromStep?: string | null; fromStepIndex?: number | null; why?: string | null };
}

export interface ItemData {
  stepKey: string; stepName: string; status?: string | null; sharedBy?: number | null; rowCount?: number | null;
  columns: string[]; rows: Record<string, unknown>[]; masked?: string[] | null; truncated?: boolean | null; shared?: boolean | null;
  expired?: boolean | null; note?: string | null; maskNote?: string | null;
}

export interface ItemFilesPage {
  ref: string; label: string; total: number; page: number; size: number; bytes?: number | null; files: ItemFile[];
}

export interface ItemCounts { items: number; done: number; failed: number; running: number; }

export interface AttentionRun {
  jobQueueId: number; jobId: number; jobName?: string | null; endedAt?: string | null; failed: number; items: number;
  labels?: string[] | null; failedAt?: string[] | null;
}

/** The body Retry sends (POST sourceJob.json/retryRunItems). */
export interface RetryBody { jobQueueId: number; refs?: string[]; failed?: boolean; from: 'item' | 'failed_step'; }

/** The answer to a retry. */
export interface RetryAnswer { jobQueueId: number; attempt: number; items: number; from: string; fromStep?: string | null; fromStepIndex?: number | null; reused?: number | null; }

export type Tone = 'ok' | 'warn' | 'crit' | 'brand' | 'neutral';

/** The status pill an item shows: "Done", "Failed at AI prompt", "1 page failed" (amber) for a document with a bad page. */
export function itemLook(item: Pick<RunItem, 'status' | 'failedStep' | 'children'>, childNoun = 'page'): { label: string; tone: Tone } {
  if (item.status === 'failed') {
    return { label: item.failedStep?.name ? `Failed at ${item.failedStep.name}` : 'Failed', tone: 'crit' };
  }
  if (item.status === 'running') return { label: 'Running', tone: 'brand' };
  const bad = item.children?.failed ?? 0;
  if (bad > 0) return { label: `${bad} ${bad === 1 ? childNoun : `${childNoun}s`} failed`, tone: 'warn' };
  return { label: 'Done', tone: 'ok' };
}

/** What a step's cell offers for an item: open the panel at the step, open its files, or only say how it went. */
export interface CellLook {
  kind: 'view' | 'files' | 'failed' | 'shared' | 'none' | 'done';
  text: string;
  title: string;
}

export function cellLook(cell: ItemCell | null | undefined): CellLook {
  if (!cell || cell.status === 'not_run') return { kind: 'none', text: '—', title: 'Not run for this item' };
  if (cell.status === 'left_out') return { kind: 'none', text: '—', title: 'Left out for this item' };
  if (cell.status === 'shared') {
    const n = cell.sharedBy ?? 0;
    return { kind: 'shared', text: n ? `Shared by ${n.toLocaleString('en-GB')}` : 'Shared', title: 'Made once for the run and used by these items' };
  }
  const files = cell.files ?? 0;
  if (files > 1) return { kind: 'files', text: `${files.toLocaleString('en-GB')} files ›`, title: 'See the files this step made for the item' };
  if (cell.hasData) {
    return { kind: 'view', text: 'View', title: cell.status === 'failed' ? 'This step failed: see why and what it had' : 'See what this step had for the item' };
  }
  if (files === 1) return { kind: 'files', text: '1 file ›', title: 'See the file this step made for the item' };
  if (cell.status === 'failed') return { kind: 'failed', text: 'Failed', title: 'This step failed for the item' };
  return { kind: 'done', text: 'Done', title: 'Done, with nothing kept to show' };
}

/** The steps the table gives a column: every step that works on items, not the one that found them. */
export function stepColumns(steps: ItemStep[]): ItemStep[] {
  return steps.filter(s => s.role !== 'source');
}

/** How long an item took, in the console's words ("1 min 12 sec"); a dash while unknown. */
export function itemTime(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '—' : formatDuration(ms / 1000);
}

/** The line under an item's name: its folder, and a document's pages ("40 pages · 39 done, 1 failed"). */
export function itemSub(item: Pick<RunItem, 'folder' | 'children' | 'key' | 'label'>, childNoun = 'page'): string {
  const parts: string[] = [];
  const folder = (item.folder ?? '').trim();
  if (folder) parts.push(folder);
  const c = item.children;
  if (c && c.total) {
    const state = [c.done ? `${c.done.toLocaleString('en-GB')} done` : '', c.failed ? `${c.failed.toLocaleString('en-GB')} failed` : ''].filter(Boolean).join(', ');
    parts.push(plural(c.total, childNoun) + (state ? ` · ${state}` : ''));
  }
  return parts.join(' · ');
}

/** The summary strip: Items, Done, Failed, Duration (and the average an item took), Files made. */
export interface ItemStat { label: string; value: string; foot: string; tone?: Tone; }

export function itemStats(summary: ItemsSummary, runDuration: string): ItemStat[] {
  const failedAt = (summary.failedAt ?? []).filter(f => f.count > 0);
  const failedFoot = !summary.failed ? 'none failed'
    : failedAt.length === 1 ? (summary.failed === 1 ? `at ${failedAt[0].step}` : `${summary.failed === 2 ? 'both' : 'all'} at ${failedAt[0].step}`)
    : failedAt.length ? failedAt.map(f => `${f.count} at ${f.step}`).join(', ') : 'see the failed items';
  const sub = summary.subItems ? ` · ${plural(summary.subItems, 'sub-item')}` : '';
  return [
    { label: 'Items', value: summary.items.toLocaleString('en-GB'), foot: (summary.source ? `found by ${summary.source}` : 'in this run') + sub },
    { label: 'Done', value: summary.done.toLocaleString('en-GB'), foot: summary.running ? `${summary.running.toLocaleString('en-GB')} still running` : 'every step finished', tone: 'ok' },
    { label: 'Failed', value: summary.failed.toLocaleString('en-GB'), foot: failedFoot, tone: summary.failed ? 'crit' : undefined },
    { label: 'Duration', value: runDuration, foot: summary.averageMs ? `about ${itemTime(summary.averageMs)} an item` : 'for the whole run' },
    { label: 'Files made', value: summary.files.toLocaleString('en-GB'), foot: summary.files ? 'by every item\'s steps' : 'none kept' },
  ];
}

/** The count a filter chip shows. */
export function filterCount(summary: ItemsSummary | null | undefined, filter: ItemFilter): number {
  if (!summary) return 0;
  return filter === 'all' ? summary.items : summary[filter];
}

export const FILTER_LABEL: Record<ItemFilter, string> = { all: 'All', done: 'Done', failed: 'Failed', running: 'Running' };

/** The status a ?status= value names, else All. */
export function filterOf(value: string | null | undefined): ItemFilter {
  const v = (value ?? '').toLowerCase();
  return (ITEM_FILTERS as readonly string[]).includes(v) ? v as ItemFilter : 'all';
}

/** The list's question for a filter, a search, a page and the columns asked for: empty parts are left out. */
export function itemsQuery(jobQueueId: number, f: { status: ItemFilter; search?: string; page?: number; size?: number; fields?: string[]; parent?: string }): ItemsQuery {
  const body: ItemsQuery = { jobQueueId, status: f.status, page: f.page ?? 0, size: f.size ?? 50 };
  const search = (f.search ?? '').trim();
  if (search) body.search = search;
  if (f.parent) body.parent = f.parent;
  if (f.fields?.length) body.fields = [...f.fields];
  return body;
}

/** Why Retry failed items cannot run now, or '' when it can. */
export function retryRefusal(summary: ItemsSummary | null | undefined): string {
  if (!summary) return '';
  if (!summary.failedItems) return 'No item failed.';
  if (summary.retryable) return '';
  if (summary.retryWhy) return summary.retryWhy;
  const status = (summary.runStatus ?? '').toLowerCase();
  if (['queue', 'start', 'running'].includes(status)) return 'The run is still going: retry its items once it has finished.';
  return 'These items cannot be retried now: their kept outputs may have expired, or the pipeline changed since the run.';
}

/** "48 of 50 done · 2 failed" for the Runs list; null for a run with no items. */
export function countsLine(c: ItemCounts | null | undefined): { done: string; failed: string; running: string } | null {
  if (!c || !c.items) return null;
  return {
    done: `${c.done.toLocaleString('en-GB')} of ${c.items.toLocaleString('en-GB')} done`,
    failed: c.failed ? `${c.failed.toLocaleString('en-GB')} failed` : '',
    running: c.running ? `${c.running.toLocaleString('en-GB')} running` : '',
  };
}

/** A file's format badge: its format, else its extension, upper case. */
export function formatBadge(f: Pick<ItemFile, 'format' | 'name'>): string {
  return (f.format || /\.([a-z0-9]+)$/i.exec(f.name ?? '')?.[1] || 'file').toUpperCase();
}

const IMAGE = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'BMP', 'SVG', 'TIF', 'TIFF'];
const TEXT = ['TXT', 'CSV', 'TSV', 'JSON', 'JSONL', 'NDJSON', 'MD', 'XML', 'HTML', 'LOG', 'VTT', 'SRT'];

/** How a file previews in the console: an image, a PDF, text -- or not at all (it downloads). */
export function previewKind(f: Pick<ItemFile, 'format' | 'name' | 'previewable'>): 'image' | 'pdf' | 'text' | null {
  const badge = formatBadge(f);
  if (f.previewable === false) return null;
  if (IMAGE.includes(badge)) return 'image';
  if (badge === 'PDF') return 'pdf';
  if (TEXT.includes(badge)) return 'text';
  return null;
}

/** "Download all (zip, 18.0 MB)". */
export function zipLabel(bytes: number | null | undefined): string {
  return bytes ? `Download all (zip, ${formatSize(bytes)})` : 'Download all (zip)';
}

/** "1–15 of 40". */
export function rangeLabel(page: number, size: number, total: number): string {
  if (!total) return '0 of 0';
  const first = page * size + 1;
  const last = Math.min(total, (page + 1) * size);
  return `${first.toLocaleString('en-GB')}–${last.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}`;
}

/** A field's value as a table cell writes it. */
export function fieldText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The Table view of a step's rows: its columns (or the rows' own keys) and each value as text. */
export function dataTable(data: Pick<ItemData, 'columns' | 'rows'>): { columns: string[]; rows: string[][] } {
  const columns = data.columns?.length ? data.columns : [...new Set((data.rows ?? []).flatMap(r => Object.keys(r ?? {})))];
  return { columns, rows: (data.rows ?? []).map(r => columns.map(c => fieldText(r?.[c]))) };
}

/** The retry's toast: Core's message, else one made from the answer. */
export function retriedSentence(answer: RetryAnswer | null | undefined, message: string | null | undefined): string {
  if (message?.trim()) return message.trim();
  if (!answer) return 'Retrying.';
  return `Retrying ${plural(answer.items, 'item')}${answer.fromStep ? ` from ${answer.fromStep}` : ''}: attempt ${answer.attempt}.`;
}

/**
 * The dialog config of an item's panel and of its files: sliding over the right of the screen at full height, about
 * 760 px wide on a big screen and most of the width on a tablet (styles.css, .side-panel-item).
 */
export function itemPanelConfig<D>(data: D) {
  return { data, panelClass: ['side-panel-host', 'side-panel-item'], hasBackdrop: true, autoFocus: 'first-tabbable' as const };
}
