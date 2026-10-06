/**
 * MIG-336: the developer portal's markdown -- the guides (etl-platform docs/api/guides), the changelog and the spec's
 * own description -- parsed into blocks that templates draw. Nothing is bound as innerHTML: text is text, a link is an
 * <a> only for a safe address, and raw HTML shows as the characters it is. HTML comments are machine markers for the
 * docs test (`<!-- sample id="token" -->`) and are dropped.
 *
 * A run of two or more fenced blocks in different languages among bash/sh, python and javascript/js, with nothing but
 * blank lines or such markers between them, is one code group: tabs labelled curl, Python and Node.js.
 */

export type LangKey = 'curl' | 'python' | 'node';

export const LANG_LABELS: Record<LangKey, string> = { curl: 'curl', python: 'Python', node: 'Node.js' };

/** The tab a fenced block's language belongs to; null for any other language. */
export function langKeyOf(lang: string): LangKey | null {
  switch (lang.toLowerCase()) {
    case 'bash': case 'sh': return 'curl';
    case 'python': return 'python';
    case 'javascript': case 'js': return 'node';
    default: return null;
  }
}

export interface Span {
  text: string;
  code?: boolean;
  bold?: boolean;
  italic?: boolean;
  /** An external link (http, https, mailto): opens in a new tab. */
  href?: string;
  /** A console address: drawn as a routerLink. */
  route?: string;
  fragment?: string;
}

export interface CodeTab { key: LangKey; label: string; lang: string; code: string }

export type GuideBlock =
  | { kind: 'h'; level: number; id: string; spans: Span[] }
  | { kind: 'p'; spans: Span[] }
  | { kind: 'quote'; spans: Span[] }
  | { kind: 'ul' | 'ol'; items: Span[][] }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'group'; tabs: CodeTab[] }
  | { kind: 'table'; head: Span[][]; rows: Span[][][] }
  | { kind: 'hr' };

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens. */
export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

/** The console route of the portal; a guide's relative link to another guide (`webhooks.md#retries`) resolves here. */
export const PORTAL = '/integration/developer';

/**
 * Where a link may go: http(s) and mailto open as they are; a console path or a `#fragment` stays in the console; a
 * sibling guide (`webhooks`, `webhooks.md#retries`) opens that guide. Anything else (javascript:, data:, a path we
 * cannot place) is text.
 */
export function linkTarget(url: string): Pick<Span, 'href' | 'route' | 'fragment'> | null {
  const u = url.trim();
  if (/^(https?:|mailto:)/i.test(u)) return { href: u };
  const [path, fragment] = u.split('#', 2) as [string, string | undefined];
  if (!path && fragment !== undefined) return { route: '.', fragment };
  if (path.startsWith('/') && !path.startsWith('//')) return { route: path, ...(fragment ? { fragment } : {}) };
  // A sibling: `webhooks`, `./webhooks.md`; the portal's own pages by name, any other name a guide.
  const sibling = /^(?:\.\/)?([a-z0-9][a-z0-9-]*)(?:\.md)?$/i.exec(path);
  if (sibling) {
    const name = sibling[1].toLowerCase();
    const route = name === 'reference' || name === 'changelog' ? `${PORTAL}/${name}` : `${PORTAL}/guides/${name}`;
    return { route, ...(fragment ? { fragment } : {}) };
  }
  return null;
}

/** Inline code first, so its contents are never read as bold, italic or a link. */
export function parseSpans(source: string): Span[] {
  const text = source.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_, c: string) => String.fromCharCode(0xE000 + c.charCodeAt(0)));
  const back = (s: string, code = false) => s.replace(/[-]/g, ch => (code ? '\\' : '') + String.fromCharCode(ch.charCodeAt(0) - 0xE000));
  const spans: Span[] = [];
  const pattern = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: back(text.slice(last, m.index)) });
    if (m[1]) spans.push({ text: back(m[2].trim() || m[2], true), code: true });
    else if (m[3] !== undefined || m[4] !== undefined) {
      // **`type`** is code set in bold: drawn as code. Backticks inside other bold text are dropped.
      const inner = m[3] ?? m[4];
      const code = /^`([^`]+)`$/.exec(inner);
      spans.push(code ? { text: back(code[1], true), code: true, bold: true } : { text: back(inner).replace(/`/g, ''), bold: true });
    }
    else if (m[5] !== undefined || m[6] !== undefined) spans.push({ text: back(m[5] ?? m[6]), italic: true });
    else if (m[7] !== undefined) {
      const target = linkTarget(back(m[8]));
      spans.push(target ? { text: back(m[7]), ...target } : { text: back(m[7]) });
    } else if (m[9] !== undefined) spans.push({ text: back(m[9]), href: back(m[9]) });
    last = pattern.lastIndex;
  }
  if (last < text.length) spans.push({ text: back(text.slice(last)) });
  return spans.length ? spans : [{ text: '' }];
}

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)[^`]*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => parseSpans(c.trim()));

function startsBlock(line: string, next: string | undefined): boolean {
  return FENCE.test(line) || /^#{1,6}\s/.test(line) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)
    || /^\s*>/.test(line) || /^\s*<!--/.test(line) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    || (line.includes('|') && next !== undefined && TABLE_DIVIDER.test(next));
}

/** The markdown as blocks, code groups made. */
export function parseGuide(source: string): GuideBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: GuideBlock[] = [];
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
      blocks.push({ kind: 'code', lang: fence[2] ?? '', code: body.join('\n') });
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      // A marker, possibly over several lines: never shown.
      while (i < lines.length && !lines[i].includes('-->')) i++;
      i++;
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ kind: 'hr' }); i++; continue; }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const base = slugify(heading[2].replace(/[`*_]/g, '')) || 'section';
      const seen = ids.get(base) ?? 0;
      ids.set(base, seen + 1);
      blocks.push({ kind: 'h', level: heading[1].length, id: seen ? `${base}-${seen}` : base, spans: parseSpans(heading[2]) });
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const head = cells(line);
      const rows: Span[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ kind: 'quote', spans: parseSpans(quote.join(' ')) });
      continue;
    }
    const list = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const item = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      const items: string[] = [];
      while (i < lines.length) {
        if (item.test(lines[i])) items.push(lines[i++].replace(item, ''));
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1] += ' ' + lines[i++].trim();
        else break;
      }
      blocks.push({ kind: ordered ? 'ol' : 'ul', items: items.map(parseSpans) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    blocks.push({ kind: 'p', spans: parseSpans(para.join(' ')) });
  }
  return groupCode(blocks);
}

/**
 * Consecutive code blocks whose languages have a tab, each language once: a group of two or more becomes tabs. A
 * language met twice starts the next group, so two bash blocks in a row stay two blocks.
 */
export function groupCode(blocks: GuideBlock[]): GuideBlock[] {
  const out: GuideBlock[] = [];
  let run: CodeTab[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ kind: 'group', tabs: run });
    else for (const t of run) out.push({ kind: 'code', lang: t.lang, code: t.code });
    run = [];
  };
  for (const block of blocks) {
    const key = block.kind === 'code' ? langKeyOf(block.lang) : null;
    if (block.kind !== 'code' || !key) { flush(); out.push(block); continue; }
    if (run.some(t => t.key === key)) flush();
    run.push({ key, label: LANG_LABELS[key], lang: block.lang, code: block.code });
  }
  flush();
  return out;
}

/** A guide without its leading `# Title`, which the page shows as its heading. */
export function withoutTitle(blocks: GuideBlock[]): GuideBlock[] {
  return blocks[0]?.kind === 'h' && blocks[0].level === 1 ? blocks.slice(1) : blocks;
}

/** The text of a run of spans, for a heading's table of contents. */
export const plain = (spans: Span[]) => spans.map(s => s.text).join('');
