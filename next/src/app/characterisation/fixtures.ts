import { TestRequest } from '@angular/common/http/testing';
import { LIVE } from './fixtures.live';

/**
 * What the characterisation visits are answered with.
 *
 * fixtures.live.ts holds answers captured from the running platform on 2026-09-28 as workspace
 * A's administrator (the same person api-check/characterisation.tsv calls TA), cut to two rows
 * per list and with every credential-like, e-mail and address field replaced -- so the screens
 * render real shapes with real field names. An endpoint without a capture gets an empty SUCCESS
 * envelope, which is itself what a new workspace sees.
 */

export interface Reply {
  body: unknown;
  error?: number;
}

const EMPTY_LIST = { status: 'SUCCESS', message: 'OK', data: [] };

export function keyOf(req: TestRequest): string {
  const path = req.request.url.replace(/^.*\/api\/v1/, '');
  return `${req.request.method} ${path}`;
}

export function fixtureFor(req: TestRequest, answers: Record<string, unknown>): Reply {
  const key = keyOf(req);
  const type = req.request.responseType;
  if (type === 'blob') {
    return { body: new Blob(['id,name\n1,a\n'], { type: 'text/csv' }) };
  }
  if (type === 'text') {
    return { body: 'id,name\n1,a\n' };
  }
  if (type === 'arraybuffer') {
    return { body: new ArrayBuffer(8) };
  }
  if (key in answers) {
    const a = answers[key] as any;
    return a && typeof a === 'object' && '__error' in a ? { body: a.body, error: a.__error } : { body: a };
  }
  const params = req.request.params.keys().sort().map(k => `${k}=${req.request.params.get(k)}`).join('&');
  if (params && `${key}?${params}` in LIVE) return { body: structuredClone(LIVE[`${key}?${params}`]) };
  if (key in LIVE) return { body: structuredClone(LIVE[key]) };
  return { body: structuredClone(EMPTY_LIST) };
}
