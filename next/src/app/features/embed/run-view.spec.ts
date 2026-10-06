import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CUSTOMER_API_BASE } from '../../core/api/api.config';
import { EmbedRunView, EmbedRunViewPage, accentOf, durationLabel, refusalOf, statusLabel, themeOf } from './run-view';

/**
 * MIG-335, the embeddable run view at /embed/runs/:token: the link's token alone reads one run (no credentials, no session),
 * which the page shows read-only -- status, times, steps, made files with a download each, the review -- themed by the
 * portal's ?theme and ?accent; a refused link is one plain sentence and nothing else.
 */
const VIEW: EmbedRunView = {
  id: '9100', pipelineId: '5100', pipelineName: 'Invoice intake', status: 'completed', reference: 'po-7',
  createdAt: '2026-10-06T14:00:00Z', startedAt: '2026-10-06T14:00:05Z', endedAt: '2026-10-06T14:01:05Z', message: 'Job completed.',
  attempt: 1,
  steps: [
    { key: 'read', name: 'Read the intake', task: 'read_file', status: 'completed', rowsIn: 10, rowsOut: 10, startedAt: '2026-10-06T14:00:05Z',
      endedAt: '2026-10-06T14:00:06Z', durationMs: 1200, message: null },
    { key: 'keep', name: 'Keep it', task: 'save_file', status: 'completed', rowsIn: 10, rowsOut: 9, startedAt: '2026-10-06T14:00:06Z',
      endedAt: '2026-10-06T14:01:05Z', durationMs: 59000, message: null },
  ],
  files: [
    { id: '01JRESULT00000000000000000', name: 'result.csv', role: 'result', contentType: 'text/csv', bytes: 2048, expired: false,
      download: { url: '/v1/files/01JRESULT00000000000000000/content?token=abc.def', expiresAt: '2099-01-01T00:00:00Z' } },
    { id: '01JOLD0000000000000000000A', name: 'old.csv', role: 'result', contentType: 'text/csv', bytes: 10, expired: true, download: null },
  ],
  review: { status: 'pending', required: ['customer'], decidedAt: null, decisions: [] },
  viewExpiresAt: '2099-01-01T00:00:00Z',
  refreshSeconds: null,
};

function answer(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as unknown as Response;
}

async function render(opts: { status?: number; body?: unknown; theme?: string; accent?: string } = {}) {
  const fetch = vi.fn(() => Promise.resolve(answer(opts.status ?? 200, opts.body ?? VIEW)));
  vi.stubGlobal('fetch', fetch);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(EmbedRunViewPage);
  fixture.componentRef.setInput('token', 'tok.sig');
  if (opts.theme !== undefined) fixture.componentRef.setInput('theme', opts.theme);
  if (opts.accent !== undefined) fixture.componentRef.setInput('accent', opts.accent);
  fixture.detectChanges();
  // The read is a fetch and its JSON: a few turns of the microtask queue, with or without fake timers.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  fixture.detectChanges();
  return { fetch, fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Embedded run view (view link)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove('dark');
  });

  it('reads the run by the link\'s token alone, with no credentials and no cache', async () => {
    const { fetch } = await render();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${CUSTOMER_API_BASE}/embed/runs/tok.sig`);
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('shows the run, its steps in order, its files with a download each, and its review, read-only', async () => {
    const { el, page } = await render();
    expect(el.querySelector('h1')?.textContent).toContain('Invoice intake');
    expect(el.querySelector('[data-run-status]')?.textContent).toContain('Completed');
    expect(Array.from(el.querySelectorAll('[data-step]')).map(s => s.getAttribute('data-step'))).toEqual(['read', 'keep']);
    const download = el.querySelector<HTMLAnchorElement>('[data-file="01JRESULT00000000000000000"] a');
    expect(download?.getAttribute('href')).toBe(page.href(VIEW.files[0]));
    expect(download?.getAttribute('href')).toMatch(/:9098\/v1\/files\/01JRESULT00000000000000000\/content\?token=abc\.def$/);
    expect(el.querySelector('[data-file="01JOLD0000000000000000000A"]')?.textContent).toContain('No longer kept');
    expect(el.querySelector('[data-review]')?.textContent).toContain('Waiting for a decision');
    expect(el.querySelectorAll('button').length).toBe(0);
    expect(el.textContent).not.toContain('2026-10-06T');
    expect(el.querySelector('[data-expires]')?.textContent).toContain('This view closes at');
  });

  it('a refused link is one plain sentence and nothing of the run', async () => {
    const expired = await render({ status: 410, body: { type: '/problems/link-expired', status: 410 } });
    expect(expired.el.querySelector('[data-refused] h1')?.textContent).toContain('expired');
    expect(expired.el.querySelector('[data-run]')).toBeNull();
    const invalid = await render({ status: 404, body: { type: 'about:blank', status: 404, detail: 'No such view.' } });
    expect(invalid.el.querySelector('[data-refused] h1')?.textContent).toContain('not valid');
    expect(invalid.el.textContent).not.toContain('No such view');
    const down = await render({ status: 503, body: {} });
    expect(down.el.querySelector('[data-refused] button')?.textContent).toContain('Try again');
  });

  it('takes the portal\'s theme and a hex accent, and nothing else, for this page only', async () => {
    const { fixture } = await render({ theme: 'dark', accent: '0B6BCB' });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).style.getPropertyValue('--embed-accent')).toBe('#0b6bcb');
    expect(accentOf('red;background:url(x)')).toBeNull();
    expect(accentOf('#abc')).toBe('#abc');
    expect(accentOf(undefined)).toBeNull();
    expect(themeOf('LIGHT', true)).toBe('light');
    expect(themeOf('purple', true)).toBe('dark');
    expect(themeOf(undefined, false)).toBe('light');
  });

  it('a run still moving is read again', async () => {
    vi.useFakeTimers();
    try {
      const { fetch } = await render({ body: { ...VIEW, status: 'running', refreshSeconds: 10 } });
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('words', () => {
    expect(statusLabel('queued')).toBe('Queue');
    expect(statusLabel('interrupted')).toBe('Interrupt');
    expect(statusLabel('not_a_word')).toBe('not_a_word');
    expect(durationLabel(1200)).toBe('1.2 s');
    expect(durationLabel(125_000)).toBe('2 min 5 s');
    expect(durationLabel(null)).toBe('');
    expect(refusalOf(410, '/problems/link-ended').title).toContain('no longer works');
  });
});
