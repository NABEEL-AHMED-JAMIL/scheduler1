/**
 * Telling "that record does not exist" apart from "that could not be read right now". The first
 * cannot be fixed by trying again, so a page says it in plain words and offers a way back instead
 * of a Try again that only fails the same way.
 */

/** Whether a route id can name a record at all: ids are whole numbers. */
export function isRecordId(value: string | number | null | undefined): boolean {
  return /^\d+$/.test(String(value ?? '').trim());
}

/**
 * The server answers an id it has no record of with 200, status ERROR and a sentence such as
 * "SourceTask not found with 999999." -- the same envelope as a real refusal, so it is told apart
 * by its words. Those sentences are checked word for word by the backend's own tests, so they are
 * stable. A 400 or 404 says the same thing.
 */
export function isMissingRecord(reply: unknown): boolean {
  if (!reply || typeof reply !== 'object') return false;
  const { status, message } = reply as { status?: unknown; message?: unknown };
  if (status === 400 || status === 404) return true;
  return status === 'ERROR' && typeof message === 'string'
    && /\bnot found with\b|\bis not valid\.$/i.test(message);
}
