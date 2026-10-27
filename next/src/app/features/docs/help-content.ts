import { Injectable } from '@angular/core';
import { HelpBlock, linesOf, parseHelp, parseSpans, HelpSpan } from './help-markdown';

/**
 * The help centre's content (owner 2026-10-26: one source for the help centre and the client book): help/ in this
 * repository, checked and gathered by scripts/build-help.mjs into public/help/content.json, which the page fetches once.
 * The same file feeds the AI Assistant's help search (ai-service scripts/gen-help-index.mjs) and the PDF book.
 */

export interface Place { label: string; path: string; }

export interface HelpArticle {
  id: string;
  topic: string;
  section: string;
  title: string;
  summary: string;
  who?: string;
  where?: Place[];
  aliases?: string[];
  popular?: string;
  related?: string[];
  minutes: number;
  /** The article's Markdown (help-markdown.ts's dialect), parsed when it is shown. */
  md: string;
}

export interface StartStep { title: string; article: string; text: string; figure: string | null; }
export interface Question { q: string; md: string; }

export interface HelpTopic {
  id: string;
  title: string;
  chapter: number;
  part: string;
  icon: string;
  blurb: string;
  /** The console pages it is about: a signed-in reader sees it when they may open one (none: everyone). */
  paths: string[];
  sections: string[];
  summary: string;
  start: StartStep[];
  faq: Question[];
  related: string[];
  /** Article ids, in reading order. */
  articles: string[];
}

export interface WhatsNew { date: string; title: string; article: string; text: string; }

export interface HelpData {
  topics: HelpTopic[];
  articles: HelpArticle[];
  whatsNew: WhatsNew[];
  /** Each screenshot's size in CSS pixels (taken at device scale 2): public/help/img/<name>.webp. */
  figures: Record<string, [number, number]>;
}

export const FIGURE_BASE = '/help/img/';
export const figureSrc = (name: string) => `${FIGURE_BASE}${name}.webp`;

/** The content file, fetched once per page load. */
@Injectable({ providedIn: 'root' })
export class HelpContent {
  private loading: Promise<HelpData> | null = null;

  load(): Promise<HelpData> {
    this.loading ??= fetch('/help/content.json', { credentials: 'omit' })
      .then(r => { if (!r.ok) throw new Error(`The help could not be read (${r.status}).`); return r.json() as Promise<HelpData>; })
      .catch(e => { this.loading = null; throw e; });
    return this.loading;
  }
}

/** Parsed articles, kept: an article is parsed once however often it is shown or searched. */
const parsed = new Map<string, HelpBlock[]>();
export function blocksOf(a: HelpArticle, prefix = a.id): HelpBlock[] {
  const key = `${prefix}\u0000${a.id}`;
  let b = parsed.get(key);
  if (!b) { b = parseHelp(a.md, prefix); parsed.set(key, b); }
  return b;
}

const markdownCache = new Map<string, HelpBlock[]>();
/** A topic's summary or a question's answer, parsed once. */
export function blocksOfText(md: string): HelpBlock[] {
  let b = markdownCache.get(md);
  if (!b) { b = parseHelp(md); markdownCache.set(md, b); }
  return b;
}

export const spansOf = (text: string): HelpSpan[] => parseSpans(text);

/** One search hit: the article, the part it is in, and the words around the best match with the matched words marked. */
export interface SearchHit { article: HelpArticle; part: string | null; partTitle: string | null; score: number; snippet: { text: string; hit: boolean }[]; }

export const WORDS = (q: string) => q.toLowerCase().split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}{}._/-]/gu, '')).filter(w => w.length > 1);

/** The words around the first match, every matched word marked, about 200 characters. */
export function snippetOf(text: string, words: string[]): { text: string; hit: boolean }[] {
  const lower = text.toLowerCase();
  const found = words.map(w => lower.indexOf(w)).filter(i => i >= 0);
  const first = found.length ? Math.min(...found) : 0;
  const start = Math.max(0, first - 70);
  const end = Math.min(text.length, start + 200);
  const cut = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return cut.split(pattern).filter(p => p).map(p => ({ text: p, hit: words.includes(p.toLowerCase()) }));
}

/**
 * Every article holding all the words in its title, summary or body: the title counts most, then the summary, then how
 * many body lines hold them; the best line gives the snippet and the part to open. At most `limit` articles.
 */
export function search(articles: HelpArticle[], query: string, limit = 30): SearchHit[] {
  const words = WORDS(query);
  if (!words.length) return [];
  const all = (t: string) => { const l = t.toLowerCase(); return words.every(w => l.includes(w)); };
  const some = (t: string) => { const l = t.toLowerCase(); return words.filter(w => l.includes(w)).length; };
  const hits: SearchHit[] = [];
  for (const a of articles) {
    const blocks = blocksOf(a);
    const lines = linesOf(blocks);
    const head = `${a.title} ${a.summary}`;
    const body = lines.map(l => l.text).join(' ');
    if (!all(`${head} ${body} ${a.section}`)) continue;
    let score = (all(a.title) ? 100 : some(a.title) * 20) + (all(a.summary) ? 30 : some(a.summary) * 6);
    let best: { part: string | null; text: string } | null = null;
    let bestN = 0;
    for (const l of lines) {
      const n = some(l.text);
      if (n) score += n;
      if (n > bestN) { best = l; bestN = n; }
    }
    const partTitle = best?.part ? (blocks.find(b => b.kind === 'h' && b.id === best!.part) as { spans: HelpSpan[] } | undefined)
      ?.spans.map(s => s.text).join('') ?? null : null;
    const useBody = best && !all(a.summary) && !all(a.title);
    hits.push({ article: a, part: useBody ? best!.part : null, partTitle: useBody ? partTitle : null, score,
      snippet: snippetOf(useBody ? best!.text : a.summary, words) });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, limit);
}
