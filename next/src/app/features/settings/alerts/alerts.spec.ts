import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { AlertRulePanel } from './alert-rule-panel';
import { Alerts } from './alerts';
import { of } from 'rxjs';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { AlertRules } from './alert-rules';
import { Alert, AlertRule, PlannedDeploy, minutes, recommendedRules, ruleSentence } from './alerts.api';
import { PlatformHealthView, backgroundChecks, deployNote, errorRate, statusWord, unplannedRestarts } from '../../admin/reliability/platform-health';
import { notificationTarget, openableTarget } from '../../notifications/notification-links';

/** MIG-355: alerts and their rules -- the list, the open alerts with Resolve, the recommended rules, and the words. */

const RULES = `${API_BASE}/reliability.json/alerts/rules`;
const ALERTS = `${API_BASE}/reliability.json/alerts/incidents`;

const rule = (extra: Partial<AlertRule> = {}): AlertRule => ({
  id: 1001, kind: 'RUN_FAILED', name: 'A run failed', enabled: true, severity: 'WARNING', jobId: null, threshold: 1, windowMinutes: 60,
  factor: null, channels: { bell: true, email: true, webhook: false }, roles: ['TENANT_ADMIN'], teams: [77], quietHours: null, ...extra,
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
    expect(s.el.querySelector('[data-rule="1001"]')?.textContent).toContain('Administrators, 1 team');
    (s.el.querySelector('[data-resolve="5"]') as HTMLButtonElement).click();
    const resolve = s.http.expectOne(`${API_BASE}/reliability.json/alerts/incidents/resolve`);
    expect(resolve.request.body).toEqual({ id: 5 });
  });

  it('owner #6: says "Rules 6 of 50" in words -- the rules in use against the workspace\'s limit -- and groups the rules by kind', () => {
    const s = screen();
    const kinds = [{ kind: 'RUN_FAILED', label: 'Runs failed', threshold: 1, windowMinutes: 60, whatToDo: 'x', runbook: 'y' },
      { kind: 'RUN_SLOW', label: 'A run is slower than usual', threshold: 1, windowMinutes: 60, whatToDo: 'x', runbook: 'y' }];
    const rules = [rule({ id: 1, kind: 'RUN_SLOW', factor: 2 }), rule({ id: 2 }), rule({ id: 3, enabled: false }),
      rule({ id: 4, mutedUntil: new Date(Date.now() + 3_600_000).toISOString(), lastFiredAt: '2026-10-19T13:00:00Z', openAlerts: 2 })];
    s.http.expectOne(r => r.url === RULES).flush({ status: API_SUCCESS, message: '', data: { scope: 'workspace', rules, maxRules: 50, kinds } });
    s.http.expectOne(r => r.url === ALERTS).flush({ status: API_SUCCESS, message: '', data: [] });
    s.fixture.detectChanges();
    const count = s.el.querySelector('[data-test="rules-count"]')!;
    expect(count.textContent!.replace(/\s+/g, ' ').trim()).toBe('4 rules · up to 50 per workspace · 1 off · 1 muted');
    expect(count.getAttribute('title')).toContain('out of the most a workspace may have (50)');
    expect([...s.el.querySelectorAll('[data-kind]')].map(g => g.getAttribute('data-kind'))).toEqual(['RUN_FAILED', 'RUN_SLOW']);
    const muted = s.el.querySelector('[data-rule="4"]')!;
    expect(muted.querySelector('[data-test="rule-muted"]')).not.toBeNull();
    expect(muted.querySelector('[data-test="rule-last-fired"]')!.textContent).toContain('2 open');
    expect(s.el.querySelector('[data-rule="2"] [data-test="rule-last-fired"]')!.textContent!.trim()).toBe('never');
  });

  it('owner #6: mutes a rule for a while, and ends a mute', () => {
    const s = screen();
    answer(s, [rule()], []);
    const page = s.fixture.componentInstance;
    page.mute(rule(), 60);
    expect(s.http.expectOne(`${API_BASE}/reliability.json/alerts/rules/mute`).request.body).toEqual({ id: 1001, minutes: 60 });
    page.mute(rule(), 0);
    expect(s.http.expectOne(`${API_BASE}/reliability.json/alerts/rules/mute`).request.body).toEqual({ id: 1001, minutes: 0 });
  });

  it('refuses a new rule at the limit, saying why', () => {
    const s = screen();
    s.http.expectOne(r => r.url === RULES).flush({ status: API_SUCCESS, message: '', data: { scope: 'workspace',
      rules: Array.from({ length: 50 }, (_, i) => rule({ id: i + 1 })), maxRules: 50,
      kinds: [{ kind: 'RUN_FAILED', label: 'Runs failed', threshold: 1, windowMinutes: 60, whatToDo: 'x', runbook: 'y' }] } });
    s.http.expectOne(r => r.url === ALERTS).flush({ status: API_SUCCESS, message: '', data: [] });
    s.fixture.detectChanges();
    const add = s.el.querySelector<HTMLButtonElement>('[data-test="alerts-new-rule"]')!;
    expect(add.disabled).toBe(true);
    expect(add.title).toContain('the most it may have');
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
    expect(ruleSentence(rule({ kind: 'RETENTION' }))).toContain('retention class pauses');
    expect(ruleSentence(rule({ kind: 'DISK_LOW', threshold: 10 }))).toBe('The disk has under 10% free');
    expect(minutes(1440)).toBe('a day');
    expect(minutes(120)).toBe('2 hours');
  });

  it('keeps an alert link\'s query for the pages that read it, and still drops the old app\'s', () => {
    expect(notificationTarget('/runs/failed?pipeline=10')).toBe('/runs/failed?pipeline=10');
    expect(notificationTarget('/platform/service-health?service=media')).toBe('/platform/service-health?service=media');
    // An alert stored before owner #21 still opens the page, now Service health.
    expect(notificationTarget('/platform/reliability?service=media')).toBe('/platform/service-health?service=media');
    expect(notificationTarget('/platform/reliability')).toBe('/platform/service-health');
    expect(notificationTarget('/jobList?jobId=4')).toBe('/pipelines/schedules');
    expect(notificationTarget('/runs/failed?x=<script>')).toBe('/runs/failed');
    expect(openableTarget('/runs/failed?pipeline=10', key => key !== 'queue')).toBeNull();
    expect(openableTarget('/runs/failed?pipeline=10', () => true)).toBe('/runs/failed?pipeline=10');
  });

  it('says a service\'s status, restarts and error rate in words, with no history chart (owner #21)', () => {
    expect(statusWord('UNREACHABLE')).toEqual({ word: 'Not answering', tone: 'crit' });
    expect(statusWord(undefined).tone).toBe('muted');
    expect(errorRate({ service: 'media', status: 'UP', requestsPerMin: 200, errorsPerMin: 3, errorPct: 1.5 })).toEqual({ text: '1.5% · 3/min', bad: true });
    expect(errorRate({ service: 'media', status: 'UP', requestsPerMin: 200, errorsPerMin: 0, errorPct: 0 })).toEqual({ text: 'none', bad: false });
    expect(errorRate({ service: 'gateway', status: 'UP' })).toEqual({ text: '—', bad: false });
  });

  it('counts a planned deploy\'s restart apart, and says a deploy that failed or never finished on its row', () => {
    const ended: PlannedDeploy = { service: 'transcriber', start: '2026-10-13T13:30:00Z', end: '2026-10-13T13:31:10Z',
      expires: '2026-10-13T13:45:00Z', closes: '2026-10-13T13:31:10Z', state: 'ended', outcome: 'ok' };
    expect(deployNote({ service: 'transcriber', status: 'UP', lastDeploy: ended })).toBeNull();
    expect(deployNote({ service: 'transcriber', status: 'UP', lastDeploy: { ...ended, outcome: 'failed' } })).toEqual({ text: 'last deploy failed', tone: 'crit' });
    expect(deployNote({ service: 'process', status: 'UP', lastDeploy: { ...ended, end: null, state: 'expired', outcome: null } })!.tone).toBe('warn');
    expect(deployNote({ service: 'process', status: 'UP', lastDeploy: { ...ended, end: null, state: 'open', outcome: null } })!.text).toBe('deploying now');
    expect(deployNote({ service: 'process', status: 'UP' })).toBeNull();
    expect(unplannedRestarts({ service: 'transcriber', status: 'UP', restarts24h: 3, plannedRestarts24h: 2 })).toBe(1);
    expect(unplannedRestarts({ service: 'transcriber', status: 'UP', restarts24h: 1, plannedRestarts24h: 2 })).toBe(0);
  });

  it('lists the background checks as one table: Kafka as one row, billing reconciliation, no deploy list (owner 2026-10-19)', () => {
    const rows = backgroundChecks([
      { probe: 'kafka-lag:audit', readAt: '2026-10-19T20:00:00Z', ok: true, reading: 0, detail: null },
      { probe: 'kafka-lag:analytics', readAt: '2026-10-19T20:01:00Z', ok: false, reading: 1240, detail: null },
      { probe: 'billing-reconcile', readAt: '2026-10-19T19:46:00Z', ok: true, reading: null, detail: 'The month 2026-10 agrees.' },
    ]);
    expect(rows.map(r => r.name)).toEqual(['Kafka consumers', 'Billing reconciliation']);
    expect([rows[0].result, rows[0].tone, rows[0].readAt]).toEqual(['1 of 2 behind', 'crit', '2026-10-19T20:01:00Z']);
    expect(rows[0].detail).toBe('analytics 1,240 behind');
    expect(rows[1].result).toBe('Agrees');
    const empty = backgroundChecks([]);
    expect(empty.map(r => r.result)).toEqual(['Not read yet', 'Not read yet']);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlatformHealthView],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
        { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } }],
    });
    const fixture = TestBed.createComponent(PlatformHealthView);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url === `${API_BASE}/reliability.json/health`).flush({ status: API_SUCCESS, message: '',
      data: { services: [], probes: [{ probe: 'billing-reconcile', readAt: null, ok: false, reading: null, detail: 'Off by $0.02' }] } });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="planned-deploys"]')).toBeNull();
    expect(el.querySelectorAll('[data-test="background-checks"] tbody tr').length).toBe(2);
    expect(el.querySelector('[data-check="Billing reconciliation"]')!.textContent).toContain('Does not agree');
    expect(el.querySelector('[data-test="health-tiles"]')!.textContent).toContain('1 failing');
    clearInterval((fixture.componentInstance as unknown as { timer: ReturnType<typeof setInterval> }).timer);
  });
});

describe('ZT-A12 follow-up: Settings › Alerts on the platform administrator\'s own sign-in', () => {
  function panel(user: { tenantId: number | null } | null, platform: boolean) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AlertRulePanel],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { isPlatformAdmin: () => platform, user: () => user } },
        { provide: DialogRef, useValue: { close: () => {} } },
        { provide: DIALOG_DATA, useValue: { scope: 'workspace', rule: null,
          kinds: [{ kind: 'RUN_FAILED', label: 'Runs failed', threshold: 1, windowMinutes: 60, whatToDo: 'x', runbook: 'y' }] } },
      ],
    });
    const fixture = TestBed.createComponent(AlertRulePanel);
    fixture.detectChanges();
    return TestBed.inject(HttpTestingController);
  }

  it('the rule panel reads no schedules and no teams (the rules are the platform\'s own)', () => {
    const http = panel({ tenantId: null }, true);
    expect(http.match(r => r.url.includes('/sourceJob.json/listSourceJob'))).toEqual([]);
    expect(http.match(r => r.url.includes('/appUser.json/teams/'))).toEqual([]);
  });

  it('a workspace administrator (and a managed session) still picks a schedule and teams', () => {
    const http = panel({ tenantId: 2924 }, false);
    expect(http.match(r => r.url.includes('/sourceJob.json/listSourceJob')).length).toBe(1);
    expect(http.match(r => r.url.includes('/appUser.json/teams/list')).length).toBe(1);
  });

  it('the page itself asks for the platform\'s rules on the own sign-in', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Alerts],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { isPlatformAdmin: () => true, user: () => ({ tenantId: null }), canOpen: () => true } }],
    });
    const fixture = TestBed.createComponent(Alerts);
    expect(fixture.componentInstance.scope()).toBe('platform');
  });
});
