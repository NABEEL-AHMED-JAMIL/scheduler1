import { describe, it, expect, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ConnectionActivity, Connections } from './connections';
import { ModelConnection } from '../ai-providers';

/**
 * Kafka (?profileId=) and the configuration screens keep the selection in the address, so a
 * connection can be linked to and survives a reload. Model connections did not: every reload
 * landed back on the default.
 */
const ROWS: ModelConnection[] = [
  { connectionId: 1, name: 'Default', provider: 'OpenAI', defaultModel: 'gpt', isDefault: true, status: 'Active' } as ModelConnection,
  { connectionId: 2, name: 'Claude', provider: 'Anthropic', defaultModel: 'claude', status: 'Active' } as ModelConnection,
];

const ACTIVITY: ConnectionActivity = {
  connectionId: 1,
  days: [
    { day: '2026-09-29', ok: 0, failed: 0, tokens: 0 },
    { day: '2026-09-30', ok: 3, failed: 1, tokens: 1200 },
  ],
  recent: [{ runId: 9002, at: '2026-09-30T10:00:00', kind: 'run', promptId: 8001, promptName: 'Summarise claim', status: 'failed',
    latencyMs: 2400, tokensIn: 10, tokensOut: 5, error: 'model not found' }],
  prompts: [{ promptId: 8001, name: 'Summarise claim', status: 'Active' }],
};

function screenAt(connection: string | null) {
  const navigate = vi.fn();
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: (url: string, options?: { params?: { connectionId?: number } }) => {
        asked.push(url + (options?.params?.connectionId != null ? '?' + options.params.connectionId : ''));
        return of({ status: 'SUCCESS', message: '', data: url.endsWith('/activity') ? ACTIVITY : url.endsWith('/history') ? [] : ROWS });
      } } },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, user: signal({ appUserId: 1 }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => k === 'connection' ? connection : null } } } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Connections());
  screen.ngOnInit();
  TestBed.tick();
  return { screen, navigate, asked };
}

describe('Model connections -- the selection lives in the address', () => {
  it('opens on the connection the link names', () => {
    const { screen } = screenAt('2');
    expect(screen.selectedId()).toBe(2);
  });

  it('falls back to the default when the link names nothing it knows', () => {
    const { screen } = screenAt('99');
    expect(screen.selectedId()).toBe(1);
  });

  it('writes the picked connection to ?connection=', () => {
    const { screen, navigate } = screenAt(null);
    screen.select(ROWS[1]);
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { connection: 2 }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
  });
});

describe('Model connections -- one pane at a time below 1024 px (review 2026-10-07, M17)', () => {
  it('opens on the list; picking a connection opens it, and Back to list goes back', () => {
    const { screen } = screenAt(null);
    expect(screen.selectedId()).toBe(1);                // the pane still has one to show from 1024 px
    expect(screen.pane()).toBe('list');
    screen.select(ROWS[1]);
    expect(screen.pane()).toBe('detail');
    screen.pane.set('list');
    expect(screen.selectedId()).toBe(2);
  });

  it('opens on the connection a link names', () => {
    expect(screenAt('2').screen.pane()).toBe('detail');
  });
});

describe('Model connections -- what the selected connection has been doing', () => {
  it('reads the picked connection\'s activity and draws each day as succeeded and failed', () => {
    const { screen, asked } = screenAt(null);
    expect(asked.some(a => a.endsWith('/aiConnection.json/activity?1'))).toBe(true);
    expect(screen.activityRuns()).toBe(4);
    const today = screen.activityBars()[1];
    expect(today.value).toBe(4);
    expect(today.segments?.map(s => [s.label, s.value])).toEqual([['Succeeded', 3], ['Failed', 1]]);
  });

  it('reads again when another connection is picked', () => {
    const { screen, asked } = screenAt(null);
    screen.select(ROWS[1]);
    TestBed.tick();
    expect(asked.filter(a => a.includes('/activity?2'))).toHaveLength(1);
  });

  it('says a run\'s time in seconds, or milliseconds under one', () => {
    const { screen } = screenAt(null);
    expect(screen.latency(2400)).toBe('2.4 sec');
    expect(screen.latency(380)).toBe('380 ms');
    expect(screen.latency(null)).toBe('—');
  });

  it('names what ran when a run has no prompt of its own', () => {
    const { screen } = screenAt(null);
    expect(screen.kindLabel('document')).toBe('Document Intelligence');
    expect(screen.kindLabel('ask')).toBe('Ask your data');
    expect(screen.kindLabel('something-new')).toBe('something-new');
  });
});

describe('Model connections -- a failed run says why in words (UX final MC1)', () => {
  it('turns the stored error into a sentence, keeping the raw text for Details', () => {
    const { screen } = screenAt(null);
    expect(screen.runError(ACTIVITY.recent[0].error)).toEqual({ text: 'Model not found.', raw: null });
    expect(screen.runError('HTTP 400: {"error":"{\\"error\\":\\"model not found\\"}"}')!.text).toBe('Model not found (HTTP 400).');
  });

  it('draws it wrapped with its icon, never cut, and the raw text under Details', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/ai/connections/connections.html`, 'utf8');
    const block = html.slice(html.indexOf('data-test="run-error"') - 200, html.indexOf('data-test="run-error-details"') + 400);
    expect(block).toContain('runError(r.error)');
    expect(block).not.toContain('truncate');
    expect(block).toContain('<details');
    expect(html).not.toContain('{{ r.error }}');
  });
});

describe('Model connections -- Active / Inactive and the chips (owner items #12, #13)', () => {
  function withPut(confirmed: boolean) {
    const puts: { url: string; params: Record<string, unknown> }[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: {
          get: (url: string) => of({ status: 'SUCCESS', message: '', data: url.endsWith('/activity') ? ACTIVITY : url.endsWith('/history') ? [] : ROWS }),
          put: (url: string, _body: unknown, options: { params: Record<string, unknown> }) => {
            puts.push({ url, params: options.params });
            return of({ status: 'SUCCESS', message: 'Done.' });
          },
        } },
        { provide: Dialog, useValue: { open: () => ({ closed: of(confirmed) }) } },
        { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
        { provide: AuthService, useValue: { isPlatformAdmin: () => false, user: signal({ appUserId: 1 }), builderLocked: () => false } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    const screen = TestBed.runInInjectionContext(() => new Connections());
    screen.ngOnInit();
    TestBed.tick();
    return { screen, puts };
  }

  it('makes a connection inactive only after the person confirms, and active again at once', async () => {
    const declined = withPut(false);
    await declined.screen.setActive(ROWS[0], false);
    expect(declined.puts).toEqual([]);

    const { screen, puts } = withPut(true);
    await screen.setActive(ROWS[0], false);
    expect(puts).toEqual([{ url: expect.stringContaining('/aiConnection.json/setActive'), params: { connectionId: 1, active: false } }]);
    await screen.setActive({ ...ROWS[0], status: 'Inactive' }, true);
    expect(puts[1].params).toEqual({ connectionId: 1, active: true });
  });

  it('gives each provider its own chip and says the status in a chip of its own', () => {
    const { screen } = withPut(true);
    expect(screen.providerChip(ROWS[0])).toBe('pill pill-prov-openai');
    expect(screen.providerChip(ROWS[1])).toBe('pill pill-prov-anthropic');
    expect(screen.providerChip({ ...ROWS[1], provider: 'Ollama' })).toBe('pill pill-prov-ollama');
    expect(screen.providerChip({ ...ROWS[1], provider: 'Something new' })).toBe('pill pill-prov-compat');
    expect(screen.statusChip(ROWS[0])).toEqual({ cls: 'pill pill-ok', label: 'Active', icon: 'check' });
    expect(screen.statusChip({ ...ROWS[0], status: 'Inactive' })).toEqual({ cls: 'pill pill-warn', label: 'Inactive', icon: 'pause' });
  });
});
