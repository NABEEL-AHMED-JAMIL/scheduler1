import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AlertsApi } from '../../settings/alerts/alerts.api';
import { PlatformHealthView } from './platform-health';

/** Owner 2026-10-27: Service health's services sort by every column, and its tiles never read "0 of 0 / All OK" before a sample. */
const SERVICES = [
  { service: 'core', status: 'UP', startedAt: '2026-10-27T08:00:00Z', restarts24h: 1, errorPct: 0.4, errorsPerMin: 1, requestsPerMin: 250 },
  { service: 'billing', status: 'DOWN', startedAt: '2026-10-26T08:00:00Z', restarts24h: 4, errorPct: null },
  { service: 'ai', status: 'UP', startedAt: '2026-10-27T09:00:00Z', restarts24h: 0, errorPct: 0 },
];

function view(answer: () => Observable<unknown>) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({ providers: [{ provide: AlertsApi, useValue: { health: answer } }] });
  const health = TestBed.runInInjectionContext(() => new PlatformHealthView());
  health.load();
  return health;
}
const ANSWERED = () => of({ status: 'SUCCESS', message: '', data: { services: SERVICES, probes: [] } });

describe('Service health -- sorting', () => {
  it('keeps the server order until a heading is picked, then sorts by name both ways', () => {
    const health = view(ANSWERED);
    expect(health.sortedServices().map(s => s.service)).toEqual(['core', 'billing', 'ai']);
    health.sort.toggle('service');
    expect(health.sortedServices().map(s => s.service)).toEqual(['ai', 'billing', 'core']);
    health.sort.toggle('service');
    expect(health.sortedServices().map(s => s.service)).toEqual(['core', 'billing', 'ai']);
  });

  it('sorts restarts as numbers, the most first, and puts a problem status first', () => {
    const health = view(ANSWERED);
    health.sort.toggle('restarts');
    expect(health.sortedServices().map(s => s.restarts24h)).toEqual([4, 1, 0]);
    health.sort.toggle('status');
    expect(health.sortedServices()[0].service).toBe('billing');
  });
});

describe('Service health -- loading, empty, error', () => {
  it('is loading, with the tiles as placeholders, until the first sample answers', () => {
    const health = view(() => NEVER);
    expect(health.loading()).toBe(true);
    expect(health.tilesLoading()).toBe(true);
    expect(health.tilesFailed()).toBe(false);
  });

  it('is empty (no sample yet) once an empty answer comes', () => {
    const health = view(() => of({ status: 'SUCCESS', message: '', data: { services: [], probes: [] } }));
    expect(health.loading()).toBe(false);
    expect(health.tilesLoading()).toBe(false);
    expect(health.sortedServices()).toEqual([]);
  });

  it('says the health could not be read, in plain words, and the tiles are not available', () => {
    const health = view(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    expect(health.loading()).toBe(false);
    expect(health.error()).toBe('The platform\'s health could not be read.');
    expect(health.tilesFailed()).toBe(true);
  });
});
