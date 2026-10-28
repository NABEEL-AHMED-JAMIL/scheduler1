import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { EngineSettings } from './engine-settings';
import { EngineDial, EngineSettingsAnswer, dialValueError } from './configuration.models';

/**
 * Owner #24 (2026-10-19): Engine settings, the engine's allow-listed limits. Each shows its value, default, range and when a
 * change takes effect; a value outside the range is refused before it is sent (and by the server); Reset asks first and puts
 * the default back; a workspace gets its own value only where the setting allows one; every change is in the history. The
 * two cron watermarks are shown and never edited.
 */

const ENDPOINT = `${API_BASE}/setting.json/engineSettings`;

const dial = (over: Partial<EngineDial>): EngineDial => ({
  key: 'QUEUE_FETCH_LIMIT', label: 'Runs claimed per dispatch pass', description: 'How many queued runs one pass claims.',
  unit: 'runs', min: 1, max: 1_000_000, defaultValue: 1000, defaultFrom: 'built-in', value: 5000, atDefault: false,
  perWorkspace: false, takesEffect: 'At the next dispatch pass (within seconds).', updatedAt: '2026-10-19T15:00:00Z',
  updatedByName: 'QA platform administrator', overrides: [], ...over,
});

const ANSWER: EngineSettingsAnswer = {
  settings: [
    dial({}),
    dial({ key: 'RUN_MEMORY_MB', label: 'Memory budget per run', unit: 'MB', min: 16, max: 4096, defaultValue: 128, value: 128,
      defaultFrom: 'process.pipeline.run-memory-mb', atDefault: true, perWorkspace: true, takesEffect: 'At the next run.',
      updatedAt: null, updatedByName: null, overrides: [{ tenantId: 2960, value: 512 }] }),
  ],
  watermarks: [
    { key: 'SCHEDULER_LAST_RUN_TIME', value: '2026-09-24T17:00:00Z', editable: false },
    { key: 'AUDIT_LOG_SYNC_LAST_RUN_TIME', value: '2026-09-24T16:55:00Z', editable: false },
  ],
  cacheSeconds: 30,
};

function screen(answers: boolean[] = []) {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const opened: unknown[] = [];
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none: the sort remembers its choice there */ }
  TestBed.configureTestingModule({
    imports: [EngineSettings],
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, isManagedSession: () => false } },
      { provide: Dialog, useValue: { open: (_c: unknown, config: unknown) => { opened.push(config); return { closed: of(answers.shift()) }; } } }],
  });
  const fixture = TestBed.createComponent(EngineSettings);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(r => r.url === ENDPOINT && r.method === 'GET').flush({ status: API_SUCCESS, message: '', data: ANSWER });
  http.expectOne(r => r.url === `${ENDPOINT}/history`).flush({ status: API_SUCCESS, message: '', data: [
    { id: 1001, key: 'QUEUE_FETCH_LIMIT', label: 'Runs claimed per dispatch pass', tenantId: null, action: 'SET', oldValue: null,
      newValue: '5000', changedByName: 'QA platform administrator', changedAt: '2026-10-19T15:00:00Z' }] });
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, http, toast, opened };
}

const row = (el: HTMLElement, key: string) => el.querySelector(`[data-key="${key}"]`) as HTMLElement;

describe('Engine settings (owner #24)', () => {
  it('lists each limit with its value, default, range and when it takes effect, and the watermarks read-only', () => {
    const { el } = screen();
    const fetch = row(el, 'QUEUE_FETCH_LIMIT');
    expect(fetch.textContent).toContain('5,000');
    expect(fetch.textContent).toContain('1,000');
    expect(fetch.textContent).toContain('1–1,000,000');
    expect(fetch.textContent).toContain('At the next dispatch pass');
    expect(fetch.textContent).toContain('Platform only');
    expect(row(el, 'RUN_MEMORY_MB').textContent).toContain('At default');
    expect(row(el, 'RUN_MEMORY_MB').textContent).toContain('1 with their own');
    const watermark = row(el, 'SCHEDULER_LAST_RUN_TIME');
    expect(watermark.textContent).toContain('24 Sep 2026');
    expect(watermark.querySelector('button, input')).toBeNull();
    expect(el.querySelector('[data-change="1001"]')!.textContent).toContain('QA platform administrator');
  });

  it('refuses a value outside the range before anything is sent', () => {
    const { component, http, fixture } = screen();
    const fetch = component.settings()[0];
    component.toggle(fetch);
    component.draft.set('5,000');
    fixture.detectChanges();
    expect(component.draftError()).toContain('Digits only');
    component.save(fetch);
    component.draft.set('0');
    expect(component.draftError()).toContain('1 to 1,000,000 runs');
    component.save(fetch);
    http.expectNone(r => r.method === 'PUT');
  });

  it('saves a value inside the range and takes the server\'s answer', () => {
    const { component, http, toast } = screen();
    const fetch = component.settings()[0];
    component.toggle(fetch);
    component.draft.set('250');
    component.save(fetch);
    const put = http.expectOne(r => r.url === ENDPOINT && r.method === 'PUT');
    expect(put.request.body).toEqual({ key: 'QUEUE_FETCH_LIMIT', value: '250' });
    put.flush({ status: API_SUCCESS, message: 'Runs claimed per dispatch pass is now 250 runs.', data: dial({ value: 250 }) });
    http.expectOne(r => r.url === `${ENDPOINT}/history`).flush({ status: API_SUCCESS, data: [] });
    expect(component.settings()[0].value).toBe(250);
    expect(toast.success).toHaveBeenCalledWith('Runs claimed per dispatch pass is now 250 runs.');
  });

  it('gives a workspace its own value only where the setting allows one', () => {
    const { component, http, el, fixture } = screen();
    component.toggle(component.settings()[0]);
    fixture.detectChanges();
    expect(el.querySelector('[data-test="engine-overrides"]')).toBeNull();
    const memory = component.settings()[1];
    component.toggle(memory);
    fixture.detectChanges();
    expect(el.querySelector('[data-override="2960"]')).not.toBeNull();
    component.ownWorkspace.set('2961');
    component.ownDraft.set('256');
    component.saveOwn(memory);
    expect(http.expectOne(r => r.method === 'PUT').request.body).toEqual({ key: 'RUN_MEMORY_MB', value: '256', tenantId: 2961 });
  });

  it('asks before a reset, and resets nothing when the question is declined', async () => {
    const declined = screen([false]);
    await declined.component.reset(declined.component.settings()[0]);
    declined.http.expectNone(r => r.url === `${ENDPOINT}/reset`);

    const { component, http, opened } = screen([true]);
    await component.reset(component.settings()[1], 2960);
    expect(opened.length).toBe(1);
    expect(http.expectOne(r => r.url === `${ENDPOINT}/reset`).request.body).toEqual({ key: 'RUN_MEMORY_MB', tenantId: 2960 });
  });

  it('words every range problem with the setting\'s own unit', () => {
    const memory = { min: 16, max: 4096, unit: 'MB' };
    expect(dialValueError(memory, '')).toBe('Enter a whole number from 16 to 4,096 MB.');
    expect(dialValueError(memory, '12.5')).toBe('Digits only: no commas, spaces, signs or decimals.');
    expect(dialValueError(memory, '8')).toBe('Enter a whole number from 16 to 4,096 MB.');
    expect(dialValueError(memory, '512')).toBeNull();
  });
});

describe('Engine settings -- sorting, loading, empty, error (owner 2026-10-27)', () => {
  function bare() {
    TestBed.resetTestingModule();
    try { localStorage.clear(); } catch { /* none */ }
    TestBed.configureTestingModule({
      imports: [EngineSettings],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
        { provide: AuthService, useValue: { isPlatformAdmin: () => false, isManagedSession: () => false } },
        { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } }],
    });
    const fixture = TestBed.createComponent(EngineSettings);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
  }

  it('sorts the changes by a heading, both ways', () => {
    const { component } = screen();
    component.history.set([
      { id: 1, key: 'A', label: 'Beta', tenantId: null, action: 'SET', oldValue: '5', newValue: '10', changedByName: 'X', changedAt: '2026-10-01T10:00:00Z' },
      { id: 2, key: 'B', label: 'Alpha', tenantId: null, action: 'SET', oldValue: '50', newValue: '9', changedByName: 'Y', changedAt: '2026-10-02T10:00:00Z' },
    ]);
    component.historySort.toggle('setting');
    expect(component.sortedHistory().map(h => h.label)).toEqual(['Alpha', 'Beta']);
    component.historySort.toggle('setting');
    expect(component.sortedHistory().map(h => h.label)).toEqual(['Beta', 'Alpha']);
    component.historySort.toggle('to');
    expect(component.sortedHistory().map(h => h.newValue)).toEqual(['10', '9']);
  });

  it('is loading, with the tiles waiting and no "No change yet", until the reads answer', () => {
    const { component, el } = bare();
    expect(component.state.pending()).toBe(true);
    expect(component.historyState.pending()).toBe(true);
    expect(el.textContent).not.toContain('No change yet');
    expect(el.textContent).not.toContain('No engine setting');
  });

  it('says the history is empty once it answers empty', () => {
    const { component, fixture, el, http } = bare();
    http.expectOne(r => r.url === ENDPOINT && r.method === 'GET').flush({ status: API_SUCCESS, message: '', data: ANSWER });
    http.expectOne(r => r.url === `${ENDPOINT}/history`).flush({ status: API_SUCCESS, message: '', data: [] });
    fixture.detectChanges();
    expect(component.historyState.pending()).toBe(false);
    expect(el.querySelector('[data-test="engine-history"]')!.textContent).toContain('No change yet');
  });

  it('a failed history says so with Try again instead of "No change yet"; a failed settings read says why', () => {
    const { component, fixture, el, http } = bare();
    http.expectOne(r => r.url === ENDPOINT && r.method === 'GET').flush('Internal Server Error', { status: 500, statusText: 'Server Error' });
    http.expectOne(r => r.url === `${ENDPOINT}/history`).flush('Internal Server Error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('The engine settings could not be read.');
    expect(component.historyState.error()).toBe('The changes could not be read.');
    expect(el.querySelector('[data-test="engine-error"] app-load-error')).not.toBeNull();
  });
});
