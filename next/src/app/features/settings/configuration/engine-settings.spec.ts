import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { EngineSettings } from './engine-settings';
import { EngineSetting, fetchLimitError } from './configuration.models';

/**
 * MIG-167: Engine settings, the platform's own knobs. One of them is configuration
 * (QUEUE_FETCH_LIMIT); the other two are watermarks their crons write on every pass, and editing
 * one by hand is not configuration at all -- so the screen shows them and offers nothing more.
 */

const ENDPOINT = `${API_BASE}/setting.json/engineSettings`;

const SETTINGS: EngineSetting[] = [
  { key: 'QUEUE_FETCH_LIMIT', value: '100', description: 'Runs claimed per scheduler pass', editable: true,
    updatedAt: '2026-09-20T15:00:00Z', updatedByName: 'Pat Platform' },
  { key: 'SCHEDULER_LAST_RUN_TIME', value: '2026-09-24T17:00:00Z', editable: false },
  { key: 'AUDIT_LOG_SYNC_LAST_RUN_TIME', value: '2026-09-24T16:55:00Z', editable: false },
];

function screen() {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [EngineSettings],
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
  });
  const fixture = TestBed.createComponent(EngineSettings);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(r => r.url === ENDPOINT && r.method === 'GET').flush({ status: API_SUCCESS, message: '', data: SETTINGS });
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, http, toast };
}

const row = (el: HTMLElement, key: string) => el.querySelector(`[data-key="${key}"]`) as HTMLElement;

describe('Engine settings', () => {
  it('lists the fetch limit and both watermarks', () => {
    const { el } = screen();
    expect(row(el, 'QUEUE_FETCH_LIMIT').textContent).toContain('100');
    expect(row(el, 'SCHEDULER_LAST_RUN_TIME').textContent).toContain('2026-09-24T17:00:00Z');
    expect(row(el, 'AUDIT_LOG_SYNC_LAST_RUN_TIME')).not.toBeNull();
  });

  it('offers an edit for the fetch limit and never for a watermark', () => {
    const { el } = screen();
    expect(row(el, 'QUEUE_FETCH_LIMIT').querySelector('button[aria-label^="Edit"]')).not.toBeNull();
    for (const key of ['SCHEDULER_LAST_RUN_TIME', 'AUDIT_LOG_SYNC_LAST_RUN_TIME']) {
      expect(row(el, key).querySelectorAll('button, input').length, key).toBe(0);
      expect(row(el, key).textContent).toMatch(/written only by its cron/i);
    }
  });

  it('will not open a watermark for editing even when asked directly', () => {
    const { component } = screen();
    component.startEdit(SETTINGS[1]);
    expect(component.editing()).toBeNull();
    // Even a server that wrongly calls a watermark editable does not get one offered.
    component.startEdit({ ...SETTINGS[2], editable: true });
    expect(component.editing()).toBeNull();
  });

  it('refuses anything but a whole number from 1 to 1,000,000, without asking the server', () => {
    const { fixture, component, el, http } = screen();
    component.startEdit(SETTINGS[0]);
    fixture.detectChanges();
    for (const bad of ['abc', '0', '5,000', '1000001', '', ' 50', '-5', '12.5', '1e3']) {
      component.draft.set(bad);
      component.save();
      fixture.detectChanges();
      expect(component.draftError(), bad).not.toBe('');
      expect(el.querySelector('[role="alert"]')?.textContent, bad).toBeTruthy();
    }
    http.expectNone(r => r.method === 'PUT');
  });

  it('saves a valid limit and shows what the server stored', () => {
    const { fixture, component, el, http, toast } = screen();
    component.startEdit(SETTINGS[0]);
    component.draft.set('250');
    component.save();
    const req = http.expectOne(r => r.url === ENDPOINT && r.method === 'PUT');
    expect(req.request.body).toEqual({ key: 'QUEUE_FETCH_LIMIT', value: '250' });
    req.flush({ status: API_SUCCESS, message: 'Saved.', data: { ...SETTINGS[0], value: '250' } });
    fixture.detectChanges();
    expect(component.editing()).toBeNull();
    expect(row(el, 'QUEUE_FETCH_LIMIT').textContent).toContain('250');
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows the server\'s sentence when it refuses', () => {
    const { component, http, toast } = screen();
    component.startEdit(SETTINGS[0]);
    component.draft.set('500');
    component.save();
    http.expectOne(r => r.method === 'PUT').flush({ status: 'ERROR', message: 'QUEUE_FETCH_LIMIT must be 1 to 1000000.' });
    expect(toast.error).toHaveBeenCalledWith('QUEUE_FETCH_LIMIT must be 1 to 1000000.');
    expect(component.editing()).toBe('QUEUE_FETCH_LIMIT');
  });
});

describe('fetchLimitError', () => {
  it('accepts the bounds and refuses just past them', () => {
    expect(fetchLimitError('1')).toBeNull();
    expect(fetchLimitError('1000000')).toBeNull();
    expect(fetchLimitError('0')).not.toBeNull();
    expect(fetchLimitError('1000001')).not.toBeNull();
  });

  it('says why a formatted number is refused', () => {
    expect(fetchLimitError('5,000')).toMatch(/Digits only/);
  });
});
