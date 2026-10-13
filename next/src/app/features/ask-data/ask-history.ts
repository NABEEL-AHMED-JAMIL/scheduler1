/**
 * UX final AD1: what Ask your data remembers for one viewer, in this browser -- their last few questions and the answers
 * they pinned to a dashboard from here. ai-service keeps no history of questions (the page's session list is gone when
 * it is left), so this lives in localStorage, keyed by workspace and person. Storage that is refused, full or holds
 * rubbish only means nothing is remembered: every read and write is guarded, and the page works without it.
 */

/** How many questions and pins are kept. */
export const HISTORY_MAX = 6;
/** A remembered question is cut to this many characters. */
const QUESTION_KEEP = 300;

export interface RecentQuestion {
  question: string;
  /** When it was asked, ISO. */
  at: string;
}

export interface PinnedAnswer {
  question: string;
  title: string;
  dashboardId: number;
  dashboardName: string;
  widgetId: number | null;
  at: string;
}

export interface AskHistory {
  questions: RecentQuestion[];
  pins: PinnedAnswer[];
}

export const EMPTY_HISTORY: AskHistory = { questions: [], pins: [] };

/**
 * Generic healthcare questions an empty first visit offers (they fill the box; the person edits and asks). They name no
 * customer's data: a workspace that has none of it gets "I can't find that in your data", which is the honest answer.
 */
export const EXAMPLE_QUESTIONS = [
  'How many readmissions were there each month?',
  'What is the average length of stay?',
  'What is the appointment no-show rate?',
  'Which lab results are flagged abnormal this week?',
];

/** The viewer's own key: one workspace, one person. Null without both (nothing is remembered then). */
export function historyKey(tenantId: number | null | undefined, appUserId: number | null | undefined): string | null {
  return tenantId && appUserId ? `etl.ask.history.${tenantId}.${appUserId}` : null;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** What is stored under `key`, keeping only well-formed entries. */
export function readHistory(key: string | null): AskHistory {
  if (!key) return EMPTY_HISTORY;
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return EMPTY_HISTORY;
  const r = raw as { questions?: unknown; pins?: unknown };
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .filter((q): q is RecentQuestion => !!q && isText(q.question) && isText(q.at))
    .map(q => ({ question: q.question, at: q.at }))
    .slice(0, HISTORY_MAX);
  const pins = (Array.isArray(r.pins) ? r.pins : [])
    .filter((p): p is PinnedAnswer => !!p && isText(p.title) && isText(p.dashboardName) && Number.isInteger(p.dashboardId) && isText(p.at))
    .map(p => ({ question: isText(p.question) ? p.question : '', title: p.title, dashboardId: p.dashboardId, dashboardName: p.dashboardName,
      widgetId: Number.isInteger(p.widgetId) ? p.widgetId : null, at: p.at }))
    .slice(0, HISTORY_MAX);
  return { questions, pins };
}

/** Keeps `history` under `key`; a refused storage only means it is not remembered. */
export function saveHistory(key: string | null, history: AskHistory): void {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(history)); } catch { /* not remembered */ }
}

/** Forgets everything remembered under `key`. */
export function clearHistory(key: string | null): void {
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* nothing to forget */ }
}

/** The question asked, newest first: asked again, it moves to the top rather than showing twice. */
export function withQuestion(history: AskHistory, question: string, at: Date = new Date()): AskHistory {
  const q = question.replace(/\s+/g, ' ').trim().slice(0, QUESTION_KEEP);
  if (!q) return history;
  const others = history.questions.filter(x => x.question.toLowerCase() !== q.toLowerCase());
  return { ...history, questions: [{ question: q, at: at.toISOString() }, ...others].slice(0, HISTORY_MAX) };
}

/** An answer pinned to a dashboard, newest first; the same tile pinned again is not listed twice. */
export function withPin(history: AskHistory, pin: Omit<PinnedAnswer, 'at'>, at: Date = new Date()): AskHistory {
  const others = history.pins.filter(p => !(pin.widgetId != null && p.widgetId === pin.widgetId));
  const kept: PinnedAnswer = { ...pin, question: pin.question.slice(0, QUESTION_KEEP), at: at.toISOString() };
  return { ...history, pins: [kept, ...others].slice(0, HISTORY_MAX) };
}
