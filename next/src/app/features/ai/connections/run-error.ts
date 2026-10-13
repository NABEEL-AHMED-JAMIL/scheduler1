/**
 * UX final MC1: a model run's stored error as a sentence a person can read.
 *
 * ai-service keeps what the provider answered, as it answered it -- often `HTTP 400: {"error":"{\"error\":\"model
 * 'llava:13b' not found\"}"}`: a status, then JSON whose message is itself JSON, sometimes twice. Recent runs printed
 * that and cut it. This peels the status and every JSON layer down to the first message it finds (`error`, `message`,
 * `detail`, `error_description`, or an `error` object's `message`), and falls back to what the status means. The raw
 * text stays available (the row's title and its "Details").
 */
export interface RunError {
  /** One readable sentence. */
  text: string;
  /** The stored error, unchanged, when it says more than `text`. */
  raw: string | null;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'The provider refused the request as invalid',
  401: 'The provider refused the key: it is missing or wrong',
  403: 'The provider refused access with this key',
  404: 'The provider did not find what was asked for (the model or the address)',
  408: 'The provider took too long to answer',
  413: 'The request was too large for the provider',
  429: 'The provider is limiting requests: too many, or the quota is used up',
  500: 'The provider failed while answering',
  502: 'The provider could not be reached through its gateway',
  503: 'The provider is unavailable right now',
  504: 'The provider took too long to answer',
};

/** One-word reasons ai-service stores on its own, said in words. */
const PLAIN: Record<string, string> = {
  timeout: 'The model did not answer in time',
  timedout: 'The model did not answer in time',
  cancelled: 'The run was stopped before the model answered',
  canceled: 'The run was stopped before the model answered',
};

const MESSAGE_KEYS = ['error', 'message', 'detail', 'error_description', 'reason', 'title'];

/** The first message inside a parsed JSON value; null when there is none. */
function messageIn(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === 'string') return peel(value, depth + 1);
  if (Array.isArray(value)) {
    for (const item of value) { const m = messageIn(item, depth + 1); if (m) return m; }
    return null;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of MESSAGE_KEYS) { const m = messageIn(o[key], depth + 1); if (m) return m; }
  }
  return null;
}

/** A string that may be JSON (or JSON-quoted) peeled to its message; plain text is returned as it is. */
function peel(text: string, depth = 0): string | null {
  const t = text.trim();
  if (!t) return null;
  if (depth > 6) return t;
  if (/^[{["]/.test(t)) {
    try { return messageIn(JSON.parse(t), depth + 1) ?? null; } catch { /* not JSON after all: the text as it is */ }
  }
  return t;
}

const sentence = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim();
  const capital = one.charAt(0).toUpperCase() + one.slice(1);
  return /[.!?]$/.test(capital) ? capital : capital + '.';
};

/** A message pulled out of JSON that was cut short (a stored error is capped): the last quoted error/message text. */
function salvage(text: string): string | null {
  const found = [...text.matchAll(/\\?"(?:error|message|detail)\\?"\s*:\s*\\?"([^"\\]{2,})/g)].map(m => m[1].trim()).filter(Boolean);
  return found.length ? found[found.length - 1] : null;
}

export function readableRunError(raw: string | null | undefined): RunError | null {
  const stored = (raw ?? '').trim();
  if (!stored) return null;
  const http = /^HTTP\s+(\d{3})\b\s*:?\s*([\s\S]*)$/i.exec(stored);
  const status = http ? Number(http[1]) : null;
  const body = (http ? http[2] : stored).trim();
  let message = peel(body);
  if (message && /^[{[]/.test(message)) message = salvage(message);
  if (message && PLAIN[message.toLowerCase().replace(/[\s_-]+/g, '')]) message = PLAIN[message.toLowerCase().replace(/[\s_-]+/g, '')];
  const meaning = status ? (STATUS_TEXT[status] ?? (status >= 500 ? 'The provider failed while answering' : 'The provider refused the request')) : null;
  const text = sentence(status
    ? `${message ?? meaning} (HTTP ${status})`
    : message ?? 'The run failed, and the provider gave no reason');
  const same = (a: string) => a.replace(/[.\s]+$/, '').toLowerCase();
  return { text, raw: same(text) === same(stored) ? null : stored };
}
