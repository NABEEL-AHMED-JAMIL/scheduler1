/**
 * The help centre's Markdown (help/<topic>/*.md, owner 2026-10-26: one source for the help centre and the client book),
 * parsed into blocks the help page draws through templates -- never innerHTML: text is text, a link is an <a> only for
 * a safe address, raw HTML shows as the characters it is.
 *
 * The dialect is a small, fixed part of GitHub Markdown, written down in help/README.md:
 *   ## and ### headings          the article's parts ("On this page" lists the ## ones)
 *   paragraphs, **bold**, *italic*, `code`
 *   1. numbered steps and - bullets, one level of bullets or steps inside a step (indented two spaces or more)
 *   | tables |                   GitHub's pipe tables
 *   > **Tip:** ...               a call-out: Tip, Note, Warning or Privacy; any other quote is a Note
 *   ```Label                     a block to copy; the text after the fence is its label
 *   ![Alt text](name "Caption")  a figure on a line of its own: public/help/img/<name>.webp
 *   <!-- widget: name -->        a live part the page draws itself (the menu map); any other comment is dropped
 *   [text](#article-id)          another article (or #article-id--part); [text](/path) a console page; http(s) outside;
 *                                [text](/help/samples/x.csv) a sample file served with the help (a download)
 *
 * Self-contained on purpose (no imports): scripts/build-help.mjs runs this same file in Node to check every article and
 * to write the search text, so what the build checks is what the page draws.
 */

export interface HelpSpan {
  text: string;
  code?: boolean;
  bold?: boolean;
  italic?: boolean;
  /** Outside the console (http, https, mailto: opens in a new tab), or a sample file of the help (/help/...: downloads). */
  href?: string;
  /** A console page: drawn as a routerLink. */
  route?: string;
  /** Another help article, or one of its parts (article-id--part). */
  article?: string;
}

export interface HelpListItem { spans: HelpSpan[]; sub?: { ordered: boolean; items: HelpSpan[][] } }

export type CalloutTone = 'tip' | 'note' | 'warn' | 'privacy';

export type HelpBlock =
  | { kind: 'h'; level: 2 | 3; id: string; spans: HelpSpan[] }
  | { kind: 'p'; spans: HelpSpan[] }
  | { kind: 'callout'; tone: CalloutTone; label: string; paras: HelpSpan[][] }
  | { kind: 'ul' | 'ol'; items: HelpListItem[] }
  | { kind: 'code'; label: string; code: string }
  | { kind: 'table'; head: HelpSpan[][]; rows: HelpSpan[][][] }
  | { kind: 'figure'; name: string; alt: string; caption: string }
  | { kind: 'widget'; name: string }
  | { kind: 'hr' };

/** A heading's anchor: lower case, punctuation dropped, spaces to hyphens. */
export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

/** Where a link may go; null for anything else (javascript:, data:, a relative name), which stays text. */
export function helpLink(url: string): Pick<HelpSpan, 'href' | 'route' | 'article'> | null {
  const u = url.trim();
  if (/^(https?:|mailto:)/i.test(u)) return { href: u };
  if (/^#[\w-]+$/.test(u)) return { article: u.slice(1) };
  if (/^\/docs#[\w-]+$/.test(u)) return { article: u.slice(6) };
  // A sample file or figure served with the help (public/help/...): a plain download link, not a console page.
  if (/^\/help\/[\w./-]+$/.test(u) && !u.includes('..')) return { href: u };
  if (u.startsWith('/') && !u.startsWith('//') && !/\s/.test(u)) return { route: u };
  return null;
}

const TONES: Record<string, CalloutTone> = { tip: 'tip', note: 'note', warning: 'warn', caution: 'warn', privacy: 'privacy' };
const LABELS: Record<CalloutTone, string> = { tip: 'Tip', note: 'Note', warn: 'Warning', privacy: 'Privacy' };

/** Inline code first, so its contents are never read as bold, italic or a link. A backslash keeps a character as it is. */
export function parseSpans(source: string): HelpSpan[] {
  const text = source.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_, c: string) => String.fromCharCode(0xE000 + c.charCodeAt(0)));
  const back = (s: string) => s.replace(/[-]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xE000));
  const spans: HelpSpan[] = [];
  const pattern = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: back(text.slice(last, m.index)) });
    if (m[1]) spans.push({ text: back(m[2]), code: true });
    else if (m[3] !== undefined) {
      const code = /^`([^`]+)`$/.exec(m[3]);
      spans.push(code ? { text: back(code[1]), code: true, bold: true } : { text: back(m[3]).replace(/`/g, ''), bold: true });
    } else if (m[4] !== undefined || m[5] !== undefined) spans.push({ text: back(m[4] ?? m[5]), italic: true });
    else if (m[6] !== undefined) {
      const target = helpLink(back(m[7]));
      const inner = back(m[6]).replace(/\*\*/g, '');
      spans.push(target ? { text: inner, ...target } : { text: inner });
    } else if (m[8] !== undefined) spans.push({ text: back(m[8]), href: back(m[8]) });
    last = pattern.lastIndex;
  }
  if (last < text.length) spans.push({ text: back(text.slice(last)) });
  // Adjacent plain runs as one, so a search snippet and a screen reader read them as one.
  const merged: HelpSpan[] = [];
  for (const s of spans) {
    const prev = merged[merged.length - 1];
    if (prev && Object.keys(prev).length === 1 && Object.keys(s).length === 1) prev.text += s.text;
    else merged.push(s);
  }
  return merged.length ? merged : [{ text: '' }];
}

const FENCE = /^\s*(`{3,}|~{3,})\s*(.*?)\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FIGURE = /^!\[([^\]]*)\]\(([\w-]+)(?:\s+"([^"]*)")?\)\s*$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => parseSpans(c.trim().replace(/\\\|/g, '|')));

function startsBlock(line: string, next: string | undefined): boolean {
  return FENCE.test(line) || /^#{1,6}\s/.test(line) || ITEM.test(line) || /^\s*>/.test(line) || /^\s*<!--/.test(line)
    || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) || FIGURE.test(line.trim())
    || (line.includes('|') && next !== undefined && TABLE_DIVIDER.test(next));
}

/** A quote's paragraphs; a first word of Tip:, Note:, Warning: (Caution:) or Privacy: in bold makes it that call-out. */
function callout(lines: string[]): HelpBlock {
  const paras: string[][] = [[]];
  for (const l of lines) {
    if (!l.trim()) { if (paras[paras.length - 1].length) paras.push([]); }
    else paras[paras.length - 1].push(l.trim());
  }
  const texts = paras.filter(p => p.length).map(p => p.join(' '));
  let tone: CalloutTone = 'note';
  const lead = /^\*\*(Tip|Note|Warning|Caution|Privacy):?\*\*:?\s*/i.exec(texts[0] ?? '');
  if (lead) {
    tone = TONES[lead[1].toLowerCase()];
    texts[0] = texts[0].slice(lead[0].length);
  }
  return { kind: 'callout', tone, label: LABELS[tone], paras: texts.map(parseSpans) };
}

/**
 * An article's Markdown as blocks. `idPrefix` makes the headings' ids unique on a page that shows several articles
 * (a whole chapter): an article's parts are `<article-id>--<heading>`.
 */
export function parseHelp(source: string, idPrefix = ''): HelpBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: HelpBlock[] = [];
  const ids = new Map<string, number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) body.push(lines[i++]);
      i++;
      blocks.push({ kind: 'code', label: fence[2] || 'Example', code: body.join('\n') });
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      const comment: string[] = [];
      while (i < lines.length && !lines[i].includes('-->')) comment.push(lines[i++]);
      comment.push(lines[i++] ?? '');
      const widget = /<!--\s*widget:\s*([\w-]+)\s*-->/.exec(comment.join(' '));
      if (widget) blocks.push({ kind: 'widget', name: widget[1] });
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ kind: 'hr' }); i++; continue; }
    const figure = FIGURE.exec(line.trim());
    if (figure) {
      blocks.push({ kind: 'figure', alt: figure[1], name: figure[2], caption: figure[3] ?? '' });
      i++;
      continue;
    }
    const heading = /^(#{2,3})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const base = slugify(heading[2].replace(/[`*_]/g, '')) || 'section';
      const seen = ids.get(base) ?? 0;
      ids.set(base, seen + 1);
      const id = (idPrefix ? `${idPrefix}--` : '') + (seen ? `${base}-${seen}` : base);
      blocks.push({ kind: 'h', level: heading[1].length as 2 | 3, id, spans: parseSpans(heading[2]) });
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const head = cells(line);
      const rows: HelpSpan[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(callout(quote));
      continue;
    }
    const first = ITEM.exec(line);
    if (first) {
      const indent = first[1].length;
      const ordered = /\d/.test(first[2]);
      const items: { text: string; sub: { ordered: boolean; items: string[] } | null }[] = [];
      while (i < lines.length) {
        const m = ITEM.exec(lines[i]);
        if (m && m[1].length <= indent + 1) {
          if (/\d/.test(m[2]) !== ordered) break;
          items.push({ text: m[3], sub: null });
          i++;
        } else if (m && m[1].length >= indent + 2 && items.length) {
          const cur = items[items.length - 1];
          cur.sub ??= { ordered: /\d/.test(m[2]), items: [] };
          cur.sub.items.push(m[3]);
          i++;
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          const cur = items[items.length - 1];
          if (cur.sub) cur.sub.items[cur.sub.items.length - 1] += ' ' + lines[i].trim();
          else cur.text += ' ' + lines[i].trim();
          i++;
        } else if (!lines[i].trim() && i + 1 < lines.length && ITEM.exec(lines[i + 1])) {
          // A blank line between items keeps the list going, as GitHub reads it.
          const m2 = ITEM.exec(lines[i + 1])!;
          if (m2[1].length > indent + 1 || /\d/.test(m2[2]) === ordered) i++;
          else break;
        } else break;
      }
      blocks.push({ kind: ordered ? 'ol' : 'ul', items: items.map(it => ({ spans: parseSpans(it.text),
        ...(it.sub ? { sub: { ordered: it.sub.ordered, items: it.sub.items.map(parseSpans) } } : {}) })) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    blocks.push({ kind: 'p', spans: parseSpans(para.join(' ')) });
  }
  return blocks;
}

/** The text of a run of spans. */
export const plain = (spans: HelpSpan[]) => spans.map(s => s.text).join('');

/** One line of searchable text per block, each with the ## part it is in (null before the first). */
export function linesOf(blocks: HelpBlock[]): { part: string | null; text: string }[] {
  const out: { part: string | null; text: string }[] = [];
  let part: string | null = null;
  for (const b of blocks) {
    switch (b.kind) {
      case 'h': if (b.level === 2) part = b.id; out.push({ part, text: plain(b.spans) }); break;
      case 'p': out.push({ part, text: plain(b.spans) }); break;
      case 'callout': out.push({ part, text: `${b.label}: ${b.paras.map(plain).join(' ')}` }); break;
      case 'ul': case 'ol':
        for (const it of b.items) out.push({ part, text: [plain(it.spans), ...(it.sub?.items ?? []).map(plain)].join(' ') });
        break;
      case 'code': out.push({ part, text: `${b.label}: ${b.code}` }); break;
      case 'table': for (const r of b.rows) out.push({ part, text: r.map(plain).join(' · ') }); break;
      case 'figure': if (b.caption || b.alt) out.push({ part, text: b.caption || b.alt }); break;
      default: break;
    }
  }
  return out;
}

/** The article's own contents: its ## headings. */
export function partsOf(blocks: HelpBlock[]): { id: string; title: string }[] {
  return blocks.filter((b): b is Extract<HelpBlock, { kind: 'h' }> => b.kind === 'h' && b.level === 2)
    .map(b => ({ id: b.id, title: plain(b.spans) }));
}

/** Every link to another article, and every figure, for the build's checks. */
export function refsOf(blocks: HelpBlock[]): { articles: string[]; figures: string[] } {
  const articles: string[] = [];
  const figures: string[] = [];
  const spans = (list: HelpSpan[]) => { for (const s of list) if (s.article) articles.push(s.article); };
  for (const b of blocks) {
    if (b.kind === 'p' || b.kind === 'h') spans(b.spans);
    else if (b.kind === 'callout') b.paras.forEach(spans);
    else if (b.kind === 'ul' || b.kind === 'ol') b.items.forEach(it => { spans(it.spans); it.sub?.items.forEach(spans); });
    else if (b.kind === 'table') { b.head.forEach(spans); b.rows.forEach(r => r.forEach(spans)); }
    else if (b.kind === 'figure') figures.push(b.name);
  }
  return { articles, figures };
}
