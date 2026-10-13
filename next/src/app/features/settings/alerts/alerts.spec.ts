import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { AlertRules } from './alert-rules';
import { Alert, AlertRule, PlannedDeploy, ServiceHealth, minutes, recommendedRules, ruleSentence } from './alerts.api';
import { PLANNED_DEPLOYS, deployLength, healthOption, statusWord, unplannedRestarts } from '../../admin/reliability/platform-health';
import { notificationTarget, openableTarget } from '../../notifications/notification-links';

/** MIG-355: alerts and their rules -- the list, the open alerts with Resolve, the recommended rules, and the words. */

const RULES = `${API_BASE}/reliability.json/alerts/rules`;
const ALERTS = `${API_BASE}/reliability.json/alerts/incidents`;

const rule = (extra: Partial<AlertRule> = {}): AlertRule => ({
  id: 1001, kind: 'RUN_FAILED', name: 'A run failed', enabled: true, severity: 'WARNING', jobId: null, threshold: 1, windowMinutes: 60,
  factor: null, channels: { bell: true, email: true, webhook: false }, roles: ['TENANT_ADMIN'], groups: [77], quietHours: null, ...extra,
});

const alert = (extra: Partial<Alert> = {}): Alert => ({
  id: 5, scope: 'workspace', ruleId: 1001, kind: 'RUN_FAILED', kindLabel: 'Runs failed', subject: 'pipeline:10', state: 'OPEN',
  severity: 'CRITICAL', title: 'Claims intake failed', detail: 'Run 8001 failed: no column.', link: '/runs/failed?pipeline=10',
  occurrences: 3, firstSeenAt: '2026-10-13T13:00:00Z', lastSeenAt: '2026-10-13T13:03:00Z', emailHeld: false, resolvedAt: null,
  resolvedHow: null, whatToDo: 'Open Runs › Failed.', runbook: 'docs/runbooks/alerts.md#run-failed', ...extra,
});

function screen() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AlertRules],
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    ],
  });
  const fixture = TestBed.createComponent(AlertRules);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, http };
}

function answer(s: ReturnType<typeof screen>, rules: AlertRule[], alerts: Alert[]) {
  s.http.expectOne(r => r.url === RULES).flush({ status: API_SUCCESS, message: '', data: { scope: 'workspace', rules, maxRules: 50,
    kinds: [{ kind: 'RUN_FAILED', label: 'Runs failed', threshold: 1, windowMinutes: 60, whatToDo: 'x', runbook: 'y' }] } });
  s.http.expectOne(r => r.url === ALERTS).flush({ status: API_SUCCESS, message: '', data: alerts });
  s.fixture.detectChanges();
}

describe('Alerts', () => {
  it('lists the open alerts with what to do and Resolve, and the rules with how and to whom they tell', () => {
    const s = screen();
    answer(s, [rule()], [alert(), alert({ id: 6, state: 'RESOLVED', resolvedAt: '2026-10-13T14:00:00Z', resolvedHow: 'AUTO' })]);
    const open = s.el.querySelector('[data-alert="5"]')!;
    expect(open.textContent).toContain('Claims intake failed');
    expect(open.textContent).toContain('seen 3 times');
    expect(open.textContent).toContain('What to do');
    expect(s.el.querySelector('[data-alert="6"]')?.textContent).toContain('cleared by itself');
    expect(s.el.querySelector('[data-rule="1001"]')?.textContent).toContain('Mail');
    expect(s.el.querySelector('[data-rule="1001"]')?.textContent).toContain('Administrators, 1 group');
    (s.el.querySelector('[data-resolve="5"]') as HTMLButtonElement).click();
    const resolve = s.http.expectOne(`${API_BASE}/reliability.json/alerts/incidents/resolve`);
    expect(resolve.request.body).toEqual({ id: 5 });
  });

  it('offers the recommended rules to a workspace with none, and saves each', () => {
    const s = screen();
    answer(s, [], []);
    (s.el.querySelector('[data-test="alerts-recommended"]') as HTMLButtonElement).click();
    const saves = s.http.match(r => r.url === RULES && r.method === 'POST');
    expect(saves.map(r => r.request.body.kind)).toEqual(['RUN_FAILED', 'RUN_FAILED', 'SCHEDULE_MISSED', 'RUN_SLOW', 'REVIEW_WAITING']);
    expect(recommendedRules().every(r => r.roles.includes('TENANT_ADMIN') && r.channels.bell)).toBe(true);
  });

  it('says what a rule watches in a sentence', () => {
    expect(ruleSentence(rule({ threshold: 3, windowMinutes: 15 }))).toBe('3 or more runs of a pipeline fail within 15 minutes');
    expect(ruleSentence(rule({ kind: 'RUN_SLOW', factor: 2.5 }))).toContain('2.5x');
    expect(ruleSentence(rule({ kind: 'DISK_LOW', threshold: 10 }))).toBe('The disk has under 10% free');
    expect(minutes(1440)).toBe('a day');
    expect(minutes(120)).toBe('2 hours');
  });

  it('keeps an alert link\'s query for the pages that read it, and still drops the old app\'s', () => {
    expect(notificationTarget('/runs/failed?pipeline=10')).toBe('/runs/failed?pipeline=10');
    expect(notificationTarget('/platform/reliability?service=media')).toBe('/platform/reliability?service=media');
    expect(notificationTarget('/jobList?jobId=4')).toBe('/pipelines/schedules');
    expect(notificationTarget('/runs/failed?x=<script>')).toBe('/runs/failed');
    expect(openableTarget('/runs/failed?pipeline=10', key => key !== 'queue')).toBeNull();
    expect(openableTarget('/runs/failed?pipeline=10', () => true)).toBe('/runs/failed?pipeline=10');
  });

  it('draws a service\'s status in words and its day as one line a service', () => {
    expect(statusWord('UNREACHABLE')).toEqual({ word: 'Not answering', tone: 'crit' });
    expect(statusWord(undefined).tone).toBe('muted');
    const option = healthOption([
      { service: 'media', status: 'UP', series: { at: ['2026-10-13T13:00:00Z'], heapUsedMb: [900], requestsPerMin: [4], errorsPerMin: [0],
        meanMs: [12], cpuPct: [3], up: [true] } },
      { service: 'gateway', status: 'UP' },
    ], 'heapUsedMb', ['#111'], '#222', '#333', '2026-10-13T14:00:00Z') as { series: { name: string; data: unknown[]; showSymbol: boolean }[];
      xAxis: { min: number; max: number } };
    expect(option.series.map(s => s.name)).toEqual(['media']);
    expect(option.series[0].showSymbol).toBe(true);
    expect(option.xAxis.max - option.xAxis.min).toBe(86_400_000);
    expect(option.series[0].data).toEqual([['2026-10-13T13:00:00Z', 900]]);
  });

  it('marks each planned deploy on the day, and counts its restart apart', () => {
    const deploys: PlannedDeploy[] = [
      { service: 'transcriber', start: '2026-10-13T13:30:00Z', end: '2026-10-13T13:31:10Z', expires: '2026-10-13T13:45:00Z',
        closes: '2026-10-13T13:31:10Z', state: 'ended', outcome: 'ok' },
      { service: 'process', start: '2026-10-13T12:00:00Z', end: null, expires: '2026-10-13T12:15:00Z', closes: '2026-10-13T12:15:00Z',
        state: 'expired', outcome: null },
    ];
    const media: ServiceHealth = { service: 'media', status: 'UP', series: { at: ['2026-10-13T13:00:00Z'], heapUsedMb: [900], requestsPerMin: [4],
      errorsPerMin: [0], meanMs: [12], cpuPct: [3], up: [true] } };
    const option = healthOption([media], 'heapUsedMb', ['#111'], '#222', '#333', '2026-10-13T14:00:00Z', deploys) as {
      series: { name: string; markLine?: { data: { xAxis: string }[] }; markArea?: { data: { xAxis: string }[][] } }[] };
    expect(option.series.map(s => s.name)).toEqual(['media', PLANNED_DEPLOYS]);
    expect(option.series[1].markLine!.data.map(d => d.xAxis)).toEqual(['2026-10-13T13:30:00Z', '2026-10-13T12:00:00Z']);
    expect(option.series[1].markArea!.data[1].map(d => d.xAxis)).toEqual(['2026-10-13T12:00:00Z', '2026-10-13T12:15:00Z']);
    const none = healthOption([media], 'heapUsedMb', ['#111'], '#222', '#333', '2026-10-13T14:00:00Z') as { series: unknown[] };
    expect(none.series.length).toBe(1);
    expect(deployLength(deploys[0])).toBe('70 s');
    expect(deployLength(deploys[1])).toBe('15 min');
    expect(deployLength({ ...deploys[0], state: 'open', end: null })).toBe('running');
    expect(unplannedRestarts({ service: 'transcriber', status: 'UP', restarts24h: 3, plannedRestarts24h: 2 })).toBe(1);
    expect(unplannedRestarts({ service: 'transcriber', status: 'UP', restarts24h: 1, plannedRestarts24h: 2 })).toBe(0);
  });
});
