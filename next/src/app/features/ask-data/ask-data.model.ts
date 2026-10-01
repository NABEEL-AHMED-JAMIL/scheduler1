/**
 * Ask your data (Wave 5, Data > Ask your data, page key ask-data): what ai-service's /askData.json answers, and the pure
 * pieces of the page -- an answer cut into text and citations, and the words for a refusal.
 */

/** One source an answer was given, numbered as the answer cites it. */
export interface AskSourceRef {
  n: number;
  kind: 'document' | 'run-output' | 'form';
  title: string;
  /** A console route that opens it. */
  link: string;
  excerpt: string;
  /** False when the answer cited nothing and every source it was given is listed. */
  cited: boolean;
}

export interface Searched {
  documents?: number;
  runOutputs?: number;
  /** MIG-283: a question answered by a query read one dataset. */
  datasets?: number;
  /** MIG-279: forms whose submissions were read (absent from an older ai-service). */
  forms?: number;
}

/** MIG-283: the query a question about numbers was answered with -- always shown with its answer. */
export interface AskQuery {
  sql: string;
  dataset: { datasetId: number; name: string; connection: string; path: string };
  columns: string[];
  rows: (string | null)[][];
  rowCount: number;
  truncated: boolean;
  /** A bar chart of one label column and one number column, when the rows make one. */
  chart: { type: 'bar'; label: string; value: string } | null;
}

export interface AskAnswer {
  question: string;
  /** "query" when a query answered it (MIG-283); absent for an answer from documents. */
  kind?: 'query';
  query?: AskQuery;
  answer: string;
  notFound: boolean;
  sources: AskSourceRef[];
  model: string | null;
  connection: string | null;
  runId: number | null;
  latencyMs: number;
  searched: Searched;
  warnings: string[];
}

export interface AskSuggestions {
  suggestions: string[];
  searched: Searched;
  warnings: string[];
}

/** One question of this session and where it stands. */
export interface AskTurn {
  id: number;
  question: string;
  state: 'asking' | 'answered' | 'failed';
  answer?: AskAnswer;
  error?: string;
}

/** A piece of an answer: plain text, or a citation of source n. */
export type Segment = { text: string; cite?: undefined } | { cite: number; text?: undefined };

export const QUESTION_MAX = 500;

/** The answer as text and citations ([1], [2][3]); a number the answer was not given stays text. */
export function segments(answer: string, known: ReadonlySet<number>): Segment[] {
  const out: Segment[] = [];
  const pattern = /\[(\d{1,3})]/g;
  let last = 0;
  for (const m of answer.matchAll(pattern)) {
    const n = Number(m[1]);
    if (!known.has(n)) continue;
    if (m.index! > last) out.push({ text: answer.slice(last, m.index) });
    out.push({ cite: n });
    last = m.index! + m[0].length;
  }
  if (last < answer.length) out.push({ text: answer.slice(last) });
  return out;
}

/** "3 documents and 4 pipeline results" (and "2 forms") -- what a question is answered from. */
export function searchedText(s: Searched | null | undefined): string {
  if (!s) return '';
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (s.datasets && s.documents == null) return part(s.datasets, 'dataset', 'datasets');
  const parts = [part(s.documents ?? 0, 'document', 'documents'), part(s.runOutputs ?? 0, 'pipeline result', 'pipeline results')];
  if (s.forms) parts.push(part(s.forms, 'form', 'forms'));
  return parts.length === 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The server's words when it said no (the envelope's message), else a plain sentence for the status. */
export function refusalText(status: number, message: string | null | undefined): string {
  if (message && message.trim()) return message.trim();
  if (status === 0) return 'Ask your data could not be reached. Check your connection and try again.';
  if (status === 403) return 'Ask your data is not part of your access. Ask your workspace admin.';
  if (status === 429) return 'Too many questions at once. Wait a moment and ask again.';
  if (status === 504 || status === 408) return 'The answer took too long. Try a shorter or more specific question.';
  return 'The question could not be answered. Try again.';
}

/** The query's chart as bars: its label column against its number column, in the order the query gave. */
export function chartItems(q: AskQuery | null | undefined): { name: string; value: number }[] {
  if (!q?.chart) return [];
  const label = q.columns.indexOf(q.chart.label);
  const value = q.columns.indexOf(q.chart.value);
  if (label < 0 || value < 0) return [];
  return q.rows.map(r => ({ name: r[label] ?? '—', value: Number(r[value]) })).filter(i => Number.isFinite(i.value));
}

/** The query's rows as CSV (RFC 4180 quoting), header first. */
export function csvOf(q: AskQuery): string {
  const cell = (v: string | null) => {
    const text = v ?? '';
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [q.columns.map(cell).join(','), ...q.rows.map(r => r.map(cell).join(','))].join('\r\n') + '\r\n';
}
