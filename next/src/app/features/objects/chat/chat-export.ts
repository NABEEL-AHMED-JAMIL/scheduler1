/**
 * An assistant reply can carry a file: the model writes it inside a fenced block, optionally
 * followed by `TARGET_FORMAT: xlsx` when it wants the server to convert the fence's contents
 * into a binary format before download.
 *
 * The parsing lives here rather than in the component so the fence grammar can be tested
 * directly -- it is the part most likely to break on a model that formats its reply slightly
 * differently.
 */

export const EXPORT_MIME: Record<string, string> = {
  csv: 'text/csv',
  json: 'application/json',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  html: 'text/html',
  md: 'text/markdown',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

/** Formats the server can convert into; a fence tagged with one of these is a conversion request. */
const CONVERTIBLE = ['xlsx', 'docx', 'pdf'];

const FENCE_ALIASES: Record<string, string> = { markdown: 'md' };

/** Targets LibreOffice lays out as a document, where markdown structure is worth keeping. */
const RICH_TARGETS = ['pdf', 'docx'];

/**
 * Does this text carry markdown worth parsing? A heading, a bold or italic run, a bullet or
 * numbered list, a table row, a blockquote, a fenced or inline code span, or a link.
 */
const MARKDOWN_SIGNALS = [
  /^#{1,6}\s+\S/m,
  /\*\*[^*\n]+\*\*|__[^_\n]+__/,
  /(^|\s)[*_][^*_\n]+[*_](\s|$)/m,
  /^\s*[-*+]\s+\S/m,
  /^\s*\d+\.\s+\S/m,
  /^\s*\|.*\|\s*$/m,
  /^\s*>\s+\S/m,
  /`[^`\n]+`/,
  /\[[^\]\n]+\]\([^)\n]+\)/,
];

export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_SIGNALS.some(pattern => pattern.test(text));
}

const FENCE = String.raw`\`\`\`(csv|json|tsv|txt|html|md|markdown|xlsx|docx|pdf)\r?\n([\s\S]*?)\`\`\`[ \t]*\r?\n?\s*(?:TARGET_FORMAT:\s*(\w+)\b\s*)?`;

/**
 * Instruction text the model sometimes echoes back inside the fence. Left in, it would be
 * written into the downloaded file as if it were data.
 */
const BLEED = [
  /^-{2,}\s*(?:end\s+)?file content\s*-{2,}$/i,
  /^target_format\s*:\s*\w+\s*$/i,
  /^\[content truncated[^\]]*\]$/i,
];

export interface ChatFile {
  filename: string;
  content: string;
  mimeType: string;
  /** Present when the server has to convert the content before it can be saved. */
  pendingExport?: { sourceFormat: string; targetFormat: string; filename: string; mimeType: string };
}

/**
 * Cells opening with = + - or @ are formulas to a spreadsheet, and a csv fence becomes a file
 * someone opens in Excel. Its content came from a model summarising documents out of a bucket,
 * so the first character of a cell is not ours to trust. A leading apostrophe is the standard
 * defusal -- Excel reads the rest as text and does not show the quote.
 *
 * A field that parses as a number is left alone, so a column of negatives stays a column of
 * numbers rather than becoming text the sheet cannot total.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function defuseCell(field: string): string {
  const value = field.trim();
  if (!FORMULA_LEAD.test(value)) return field;
  if (Number.isFinite(Number(value))) return field;
  // Preserve the original spacing around the value the author wrote.
  return field.replace(value, `'${value}`);
}

function defuseSeparated(content: string, separator: string): string {
  return content
    .split(/\r?\n/)
    .map(line => line.split(separator).map(defuseCell).join(separator))
    .join('\n');
}

function stripBleed(content: string): string {
  const lines = content.split(/\r?\n/);
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || BLEED.some(p => p.test(last))) { lines.pop(); continue; }
    break;
  }
  return lines.join('\n');
}

/**
 * What the server should import the content *as*.
 *
 * A ```pdf fence means "make this a PDF", so the fence's own language was recorded as txt --
 * which is what got sent, and LibreOffice imported it as flat text. Every heading, bold run
 * and table in the reply then came out as literal asterisks and pipes, while the chat beside
 * it rendered the same text as markdown. Telling the server it is markdown lets LibreOffice's
 * Markdown filter build real headings, lists and tables, so the file matches what was on
 * screen. Spreadsheet targets are left alone: markdown structure means nothing to a sheet.
 */
export function sourceFormatFor(lang: string, targetFormat: string, content: string): string {
  if (lang !== 'txt' || !RICH_TARGETS.includes(targetFormat)) return lang;
  return looksLikeMarkdown(content) ? 'md' : lang;
}

/** The delimiter a fence's cells are separated by, or null when it is not a cell format. */
function fenceLangSeparator(lang: string): string | null {
  if (lang === 'csv') return ',';
  if (lang === 'tsv') return '\t';
  return null;
}

export function parseDownloadableFiles(text: string, baseName = 'export'): ChatFile[] {
  if (!text) return [];
  const pattern = new RegExp(FENCE, 'gi');
  const files: ChatFile[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    const fenceLang = FENCE_ALIASES[match[1].toLowerCase()] ?? match[1].toLowerCase();
    let content = stripBleed(match[2].replace(/\r?\n$/, ''));
    if (!content.trim()) continue;
    // Only the separated formats become spreadsheet cells; json, html and markdown do not.
    const separator = fenceLangSeparator(match[1].toLowerCase());
    if (separator) content = defuseSeparated(content, separator);

    // A fence tagged xlsx/docx/pdf holds text to be converted, so its own content is plain.
    const taggedForConversion = CONVERTIBLE.includes(fenceLang);
    const lang = taggedForConversion ? 'txt' : fenceLang;

    // Honour TARGET_FORMAT only for formats the server can actually produce; a model that
    // writes "TARGET_FORMAT: html" over an already-direct ```html fence is just noise.
    const declared = match[3]?.toLowerCase() ?? null;
    const targetFormat = declared && CONVERTIBLE.includes(declared)
      ? declared
      : (taggedForConversion ? fenceLang : null);

    index++;
    const suffix = index > 1 ? `-${index}` : '';

    if (targetFormat && targetFormat !== lang) {
      const filename = `${baseName}-export${suffix}.${targetFormat}`;
      files.push({
        filename, content, mimeType: EXPORT_MIME[lang],
        pendingExport: {
          sourceFormat: sourceFormatFor(lang, targetFormat, content),
          targetFormat, filename, mimeType: EXPORT_MIME[targetFormat],
        },
      });
    } else {
      files.push({
        filename: `${baseName}-export${suffix}.${lang}`,
        content,
        mimeType: EXPORT_MIME[lang],
      });
    }
  }
  return files;
}

/**
 * The same fence has to come out of the displayed text. Left in, the file's raw markup renders
 * as a wall of escaped tags in the bubble, directly above a download button offering the very
 * same content.
 */
export function stripExportFences(text: string): string {
  if (!text) return '';
  return text.replace(new RegExp(FENCE, 'gi'), '').replace(/\n{3,}/g, '\n\n').trim();
}
