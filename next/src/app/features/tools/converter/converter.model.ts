import { formatSize } from '../../../shared/ui/format-size';

/**
 * The Document Converter's shapes and the rules its screen follows (tools redesign, owner-approved 2026-11-02): a queue of
 * up to 20 files, each converted on the server and kept in Recent conversions for 30 days (or in a bucket), every failure
 * said in plain words with what to do next. Pure, so the page and its specs read the same rules.
 */

/** A family of formats the converter reads, and what each can become (documentConverter.json/supportedFormats). */
export interface FormatFamily {
  key: string;
  label: string;
  inputFormats: string[];
  outputFormats: string[];
}

/** What the converter takes (documentConverter.json/limits, ADR-027), and its queue right now. */
export interface ConverterLimits {
  maxFileSizeMb: number;
  tableMaxFileSizeMb: number;
  xlsxMaxFileSizeMb: number;
  pdfMaxRows: number;
  pdfMaxPages: number;
  maxOutputMb: number;
  timeoutSeconds: number;
  slots: number;
  maxWaiting: number;
  running?: number;
  waiting?: number;
}

export type ConversionOutcome = 'DONE' | 'SHORTENED' | 'FAILED';
export type ConversionError = 'TOO_LARGE' | 'PASSWORD' | 'UNREADABLE' | 'TIMEOUT' | 'UNSUPPORTED' | 'OUTPUT_TOO_LARGE' | 'FAILED';

/** One fidelity check of a result: pages as in the original, fonts embedded, a font substituted, text selectable. */
export interface ConversionCheck {
  key: 'pages' | 'fonts' | 'substitution' | 'text' | string;
  ok: boolean;
  text: string;
}

/** One conversion as Recent conversions lists it (documentConverter.json/conversions). */
export interface ConversionRow {
  conversionId: number;
  name: string;
  inputFileName: string;
  inputFormat: string;
  inputFileSize?: number | null;
  inputPages?: number | null;
  outputFormat: string;
  outputFileName?: string | null;
  outputFileSize?: number | null;
  outputPages?: number | null;
  outcome: ConversionOutcome;
  errorCode?: ConversionError | null;
  errorMessage?: string | null;
  errorHint?: string | null;
  rowCount?: number | null;
  rowsShown?: number | null;
  engine?: string | null;
  tookMs?: number | null;
  keptIn?: 'bucket' | null;
  bucketName?: string | null;
  targetFolder?: string | null;
  outputStorageKey?: string | null;
  expiresAt?: string | null;
  documents?: { ocrDocumentId?: number | null; outcome?: string | null } | null;
  checks?: ConversionCheck[] | null;
  createdBy?: number | null;
  createdByName?: string | null;
  createdAt?: string | null;
}

/** Each facet's counts over the window and the search (each ignores its own picks), as media-service answers them. */
export interface ConversionFacets {
  status?: Record<string, number>;
  from?: Record<string, number>;
  kept?: Record<string, number>;
  by?: Record<string, number>;
}

export interface ConversionPage {
  rows: ConversionRow[];
  total: number;
  failedCount: number;
  /** Every conversion in the window, whatever the search and facets. */
  all?: number;
  page?: number;
  size?: number;
  facets?: ConversionFacets;
}

/** What Recent conversions asks for (tools Option A): the window (0 = all time), the search, a page, and the facets picked. */
export interface ConversionQuery {
  days: number;
  q: string;
  page: number;
  size: number;
  status: readonly string[];
  from: readonly string[];
  kept: readonly string[];
  by: readonly string[];
}

/** The facets' words. Converting is the page's own (files still on their way); the rest are media-service's keys. */
export const STATUS_WORDS: Readonly<Record<string, string>> = { DONE: 'Done', CONVERTING: 'Converting', SHORTENED: 'Shortened', FAILED: 'Failed' };
export const FROM_WORDS: Readonly<Record<string, string>> = { word: 'Word', excel: 'Excel and CSV', slides: 'PowerPoint', pdf: 'PDF',
  images: 'Images', markup: 'Markdown and HTML', other: 'Other' };
export const KEPT_WORDS: Readonly<Record<string, string>> = { kept: 'In a bucket or Documents', temp: '30 days only' };
export const BY_WORDS: Readonly<Record<string, string>> = { me: 'Me', others: 'Others' };

/** The queue holds at most this many files at once (the design's "up to 20 at once"). */
export const QUEUE_MAX = 20;
/** Files converted at the same time from one page: the converter has two office slots. */
export const QUEUE_PARALLEL = 2;
/** A busy converter (429) is asked again after this long, by itself. */
export const BUSY_RETRY_MS = 15_000;

/** A file in the queue, from this computer or a bucket, and where its conversion stands. */
export interface QueueItem {
  id: number;
  name: string;
  size: number | null;
  extension: string;
  /** The file itself, for an upload; a bucket file is read when its turn comes. */
  file: File | null;
  source: { bucket: string; key: string } | null;
  target: string;
  state: 'waiting' | 'uploading' | 'converting' | 'done' | 'failed';
  /** Upload progress, 0-100, while uploading. */
  progress: number | null;
  /** Convert was pressed for it: it goes when a slot is free. A file dropped later waits for the next press. */
  asked: boolean;
  /** The converter was busy: waiting to be asked again (the row says so). */
  busy: boolean;
  /** Why it failed before the converter answered (not a format it converts, the bucket file unreadable). */
  problem: Problem | null;
  row: ConversionRow | null;
  /** When it was dropped: its When in the table until the server's row replaces it. */
  addedAt?: Date;
}

/** A failure in plain words: what happened, and what to do next. */
export interface Problem {
  title: string;
  text: string;
  icon: 'alert' | 'lock' | 'clock';
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** The family that reads this extension, or null. */
export function familyOf(families: FormatFamily[], extension: string): FormatFamily | null {
  return families.find(f => f.inputFormats.includes(extension)) ?? null;
}

/** The target a new file gets: the one asked for all files when its family has it, else its family's first other format. */
export function defaultTarget(family: FormatFamily | null, extension: string, convertAllTo: string): string {
  if (!family) return '';
  if (convertAllTo && family.outputFormats.includes(convertAllTo)) return convertAllTo;
  return family.outputFormats.find(f => f !== extension) ?? family.outputFormats[0] ?? '';
}

/** The size limit for one conversion: a CSV/TSV (or XLSX) to PDF is streamed, everything else goes to LibreOffice. */
export function limitMbFor(limits: ConverterLimits | null, extension: string, target: string): number | null {
  if (!limits) return null;
  if (target === 'pdf' && (extension === 'csv' || extension === 'tsv')) return limits.tableMaxFileSizeMb;
  if (target === 'pdf' && extension === 'xlsx') return limits.xlsxMaxFileSizeMb;
  return limits.maxFileSizeMb;
}

/** The strip's line after "Drop files to convert": "up to 20 at once, 50 MB each". */
export function stripHint(limits: ConverterLimits | null): string {
  return `up to ${QUEUE_MAX} at once, ${limits?.maxFileSizeMb ?? 50} MB each`;
}

/** What kind of file this is, in words: "Word document", "Excel workbook". */
export function kindLabel(extension: string): string {
  const kinds: Record<string, string> = {
    doc: 'Word document', docx: 'Word document', rtf: 'Rich text', odt: 'OpenDocument text', ott: 'OpenDocument text',
    xls: 'Excel workbook', xlsx: 'Excel workbook', ods: 'OpenDocument spreadsheet', csv: 'CSV table', tsv: 'TSV table',
    ppt: 'PowerPoint deck', pptx: 'PowerPoint deck', odp: 'OpenDocument presentation', pdf: 'PDF', md: 'Markdown',
    html: 'Web page', htm: 'Web page', txt: 'Plain text', png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image',
    bmp: 'Image', tif: 'Image', tiff: 'Image', svg: 'Image', webp: 'Image', vsdx: 'Visio drawing', odg: 'OpenDocument drawing',
  };
  return kinds[extension] ?? (extension ? extension.toUpperCase() + ' file' : 'File');
}

/** The colour group of a file's type badge (a class, never a colour): word, sheet, slides, pdf, image, text. */
export function badgeTone(extension: string): string {
  if (['doc', 'docx', 'rtf', 'odt', 'ott'].includes(extension)) return 'ft-word';
  if (['xls', 'xlsx', 'ods', 'csv', 'tsv'].includes(extension)) return 'ft-sheet';
  if (['ppt', 'pptx', 'odp'].includes(extension)) return 'ft-slides';
  if (extension === 'pdf') return 'ft-pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'webp'].includes(extension)) return 'ft-image';
  return 'ft-text';
}

/** Why a file cannot go before it is sent: a type the converter does not read. Empty when it can. */
export function queueProblem(families: FormatFamily[], name: string): Problem | null {
  const extension = extensionOf(name);
  if (familyOf(families, extension)) return null;
  if (['mp3', 'm4a', 'wav', 'ogg', 'flac', 'webm'].includes(extension)) {
    return { title: 'A recording, not a document.', text: 'Audio Transcript turns recordings into text.', icon: 'alert' };
  }
  return { title: 'Not a format this converts.', text: extension
    ? `".${extension}" is not one of the supported formats; Supported formats lists what it reads.`
    : 'The file has no extension, so its format cannot be told. Rename it with one and drop it again.', icon: 'alert' };
}

/** A failed conversion in plain words with what to do next, from the server's code (its own sentence when it gave one). */
export function problemOf(row: ConversionRow, limits: ConverterLimits | null = null): Problem | null {
  if (row.outcome !== 'FAILED') return null;
  const size = row.inputFileSize != null ? formatSize(row.inputFileSize) : 'too big';
  const limit = limits ? limitMbFor(limits, row.inputFormat, row.outputFormat) : null;
  switch (row.errorCode) {
    case 'TOO_LARGE':
      return { title: 'Too large to convert.', icon: 'alert', text: row.errorHint || `This file is ${size}; the converter takes up to `
        + `${limit ?? 50} MB a file. Split it into parts, or ask your administrator to raise the limit.` };
    case 'PASSWORD':
      return { title: 'Protected with a password.', icon: 'lock', text: row.errorHint || (row.inputFormat === 'pdf'
        ? 'Open it in a PDF reader, save a copy without the password, and drop it here again.'
        : 'Open it in Word, remove the password (File › Info › Protect Document), save, and drop it here again.') };
    case 'TIMEOUT':
      return { title: 'It took too long.', icon: 'clock', text: row.errorHint || 'A very large document can take longer than the '
        + 'converter waits. Split it, or convert a smaller part.' };
    case 'OUTPUT_TOO_LARGE':
      return { title: 'The result is too large.', icon: 'alert', text: row.errorHint || 'Convert a smaller part of it.' };
    case 'UNSUPPORTED':
      return { title: 'Not a format this converts.', icon: 'alert', text: row.errorHint || row.errorMessage || 'Supported formats lists what it reads.' };
    case 'UNREADABLE':
      return { title: 'The file could not be read.', icon: 'alert', text: row.errorHint || 'It may be damaged, or not really the type its '
        + 'name says. Open it on your computer, save it again, and drop it here.' };
    default:
      return { title: 'The conversion failed.', icon: 'alert', text: row.errorHint || row.errorMessage || 'Try again; if it keeps failing, '
        + 'ask your administrator.' };
  }
}

/** The status pill of a row in Recent conversions: its label and tone. */
export function statusOf(row: ConversionRow): { label: string; tone: 'ok' | 'warn' | 'crit'; icon: string } {
  if (row.outcome === 'DONE') return { label: 'Done', tone: 'ok', icon: 'check' };
  if (row.outcome === 'SHORTENED') return { label: 'Shortened', tone: 'warn', icon: 'alert' };
  const labels: Partial<Record<ConversionError, string>> = {
    TOO_LARGE: 'Too large', PASSWORD: 'Password', TIMEOUT: 'Too slow', UNREADABLE: 'Unreadable', UNSUPPORTED: 'Not supported',
    OUTPUT_TOO_LARGE: 'Result too large',
  };
  return { label: labels[row.errorCode ?? 'FAILED'] ?? 'Failed', tone: 'crit', icon: row.errorCode === 'PASSWORD' ? 'lock' : 'alert' };
}

/** The line under a status pill: "61.2 MB, limit 50 MB", "first 5,000 of 7,412 rows", "remove the password, try again". */
export function statusNote(row: ConversionRow, limits: ConverterLimits | null): string {
  if (row.outcome === 'SHORTENED' && row.rowCount != null) {
    return `first ${(row.rowsShown ?? 0).toLocaleString('en-US')} of ${row.rowCount.toLocaleString('en-US')} rows`;
  }
  if (row.outcome !== 'FAILED') return '';
  if (row.errorCode === 'TOO_LARGE') {
    const limit = limitMbFor(limits, row.inputFormat, row.outputFormat);
    return `${row.inputFileSize != null ? formatSize(row.inputFileSize) : 'Too big'}${limit != null ? `, limit ${limit} MB` : ''}`;
  }
  if (row.errorCode === 'PASSWORD') return 'remove the password, try again';
  return '';
}

/** "184 KB → 212 KB · 3 pages", or an em dash for a conversion with no result. */
export function resultText(row: ConversionRow): string {
  if (row.outcome === 'FAILED' || row.outputFileSize == null) return '—';
  const pages = row.outputPages != null ? ` · ${row.outputPages} ${row.outputPages === 1 ? 'page' : 'pages'}` : '';
  const from = row.inputFileSize != null ? `${formatSize(row.inputFileSize)} → ` : '';
  return `${from}${formatSize(row.outputFileSize)}${pages}`;
}

/** The table's Conversion: "DOCX → PDF", "PDF → —" for one with no result. */
export function conversionText(row: Pick<ConversionRow, 'inputFormat' | 'outputFormat' | 'outcome'>): string {
  return `${row.inputFormat.toUpperCase()} → ${row.outcome === 'FAILED' || !row.outputFormat ? '—' : row.outputFormat.toUpperCase()}`;
}

/** The table's Result: "3 pages · 212 KB", or an em dash for a conversion with no result. */
export function resultShort(row: ConversionRow): string {
  if (row.outcome === 'FAILED' || row.outputFileSize == null) return '—';
  const pages = row.outputPages != null ? `${row.outputPages} ${row.outputPages === 1 ? 'page' : 'pages'} · ` : '';
  return `${pages}${formatSize(row.outputFileSize)}`;
}

/** The panel's meta line: "DOCX → PDF · 3.1 s". */
export function panelMeta(row: ConversionRow): string {
  return `${conversionText(row)}${row.tookMs != null ? ` · ${(row.tookMs / 1000).toFixed(1)} s` : ''}`;
}

/**
 * The panel's one check line: the first two checks that passed ("Same page count · fonts embedded"), and apart, the ones
 * that did not (a font substituted), or the rows a shortened table printed.
 */
export function checkLines(row: ConversionRow): { ok: string; warn: string } {
  const words = (list: ConversionCheck[]) => list.map((c, i) => (i ? c.text.charAt(0).toLowerCase() + c.text.slice(1) : c.text)).join(' · ');
  const checks = row.checks ?? [];
  const warn = [words(checks.filter(c => !c.ok))];
  if (row.outcome === 'SHORTENED' && row.rowCount != null) {
    warn.unshift(`First ${(row.rowsShown ?? 0).toLocaleString('en-US')} of ${row.rowCount.toLocaleString('en-US')} rows printed`);
  }
  // One line under the page: the first two that passed (pages, fonts); every check is listed under Details.
  return { ok: words(checks.filter(c => c.ok).slice(0, 2)), warn: warn.filter(Boolean).join(' · ') };
}

/** The folder a kept result is in ("converted/2026-11/"), from its key; the bucket root as "/". */
export function folderOf(row: Pick<ConversionRow, 'outputStorageKey' | 'targetFolder'>): string {
  const key = row.outputStorageKey ?? '';
  const cut = key.lastIndexOf('/');
  if (cut > 0) return key.slice(0, cut + 1);
  const folder = (row.targetFolder ?? '').replace(/^\/+/, '');
  return folder ? (folder.endsWith('/') ? folder : folder + '/') : '/';
}

/** Whether Send to Documents may take this result: Document Intelligence reads PDFs and images. */
export function documentsTakes(format: string | null | undefined): boolean {
  return ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp'].includes((format ?? '').toLowerCase());
}

/** "Not kept · until 2 Dec" for a result kept 30 days in the history; empty for a kept or failed one. */
export function notKeptText(row: ConversionRow, until: string | null): string {
  if (row.keptIn === 'bucket' || row.outcome === 'FAILED') return '';
  return until ? `Not kept · until ${until}` : 'Not kept';
}

/** The AI Assistant's first message for a pipeline that starts from a kept result. */
export function assistantPrompt(bucket: string, key: string): string {
  return `Build a pipeline that reads the file ${bucket}/${key} and `;
}
