import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';

/**
 * MIG-355: alert rules and alerts (Core, /reliability.json/alerts). A workspace administrator works on the workspace's
 * (failed runs, missed schedules, slow runs, reviews left waiting); a platform administrator on the platform's (a service
 * unhealthy or restarted, memory, Kafka lag, disk, billing reconciliation). Platform › Reliability's health view reads
 * /reliability.json/health.
 */
export type AlertScope = 'workspace' | 'platform';

export interface AlertKindInfo {
  kind: string;
  label: string;
  threshold: number;
  windowMinutes: number;
  whatToDo: string;
  runbook: string;
}

export interface AlertRule {
  id: number | null;
  scope?: AlertScope;
  kind: string;
  kindLabel?: string;
  name: string;
  enabled: boolean;
  severity: 'WARNING' | 'CRITICAL';
  jobId: number | null;
  threshold: number;
  windowMinutes: number;
  factor: number | null;
  channels: { bell: boolean; email: boolean; webhook: boolean };
  roles: string[];
  groups: number[];
  quietHours: { start: string; end: string; zone: string | null } | null;
  whatToDo?: string;
  runbook?: string;
}

export interface AlertRulesAnswer {
  scope: AlertScope;
  rules: AlertRule[];
  kinds: AlertKindInfo[];
  maxRules: number;
}

export interface Alert {
  id: number;
  scope: AlertScope;
  ruleId: number;
  kind: string;
  kindLabel: string;
  subject: string;
  state: 'OPEN' | 'RESOLVED';
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  detail: string | null;
  link: string | null;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  emailHeld: boolean;
  resolvedAt: string | null;
  resolvedHow: 'AUTO' | 'MANUAL' | null;
  whatToDo: string | null;
  runbook: string | null;
}

export interface ServiceSeries {
  at: string[];
  heapUsedMb: (number | null)[];
  requestsPerMin: (number | null)[];
  errorsPerMin: (number | null)[];
  meanMs: (number | null)[];
  cpuPct: (number | null)[];
  up: boolean[];
}

export interface ServiceHealth {
  service: string;
  status: string;
  source?: string;
  sampledAt?: string;
  responseMs?: number | null;
  heapUsedMb?: number | null;
  heapMaxMb?: number | null;
  heapAfterGcPct?: number | null;
  cpuPct?: number | null;
  threads?: number | null;
  startedAt?: string | null;
  requestsPerMin?: number | null;
  errorsPerMin?: number | null;
  errorPct?: number | null;
  meanMs?: number | null;
  restarts24h?: number;
  minutesNotUp24h?: number;
  series?: ServiceSeries;
}

export interface Probe { probe: string; readAt: string | null; ok: boolean; reading: number | null; detail: string | null; }

export interface PlatformHealth {
  asOf: string;
  bucketMinutes: number;
  services: ServiceHealth[];
  probes: Probe[];
  incidents: Alert[];
}

@Injectable({ providedIn: 'root' })
export class AlertsApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/reliability.json`;

  rules(): Observable<ApiResponse<AlertRulesAnswer>> {
    return this.http.get<ApiResponse<AlertRulesAnswer>>(`${this.base}/alerts/rules`);
  }

  save(rule: AlertRule): Observable<ApiResponse<AlertRule>> {
    return this.http.post<ApiResponse<AlertRule>>(`${this.base}/alerts/rules`, rule);
  }

  remove(id: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.base}/alerts/rules/delete`, { id });
  }

  alerts(state: 'open' | 'resolved' | 'all' = 'all', limit = 100): Observable<ApiResponse<Alert[]>> {
    return this.http.get<ApiResponse<Alert[]>>(`${this.base}/alerts/incidents`, { params: { state, limit } });
  }

  resolve(id: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${this.base}/alerts/incidents/resolve`, { id });
  }

  health(bucketMinutes = 15): Observable<ApiResponse<PlatformHealth>> {
    return this.http.get<ApiResponse<PlatformHealth>>(`${this.base}/health`, { params: { bucketMinutes } });
  }
}

/** The rules a workspace starts from: one press of "Add the recommended rules". */
export function recommendedRules(): AlertRule[] {
  const base = (kind: string, name: string, threshold: number, windowMinutes: number, severity: 'WARNING' | 'CRITICAL'): AlertRule => ({
    id: null, kind, name, enabled: true, severity, jobId: null, threshold, windowMinutes, factor: kind === 'RUN_SLOW' ? 2 : null,
    channels: { bell: true, email: false, webhook: false }, roles: ['TENANT_ADMIN'], groups: [], quietHours: null,
  });
  return [
    base('RUN_FAILED', 'A run failed', 1, 60, 'WARNING'),
    base('RUN_FAILED', 'Failures in a burst', 3, 15, 'CRITICAL'),
    base('SCHEDULE_MISSED', 'A schedule missed its slot', 1, 60, 'WARNING'),
    base('RUN_SLOW', 'A run is slower than usual', 1, 60, 'WARNING'),
    base('REVIEW_WAITING', 'A review is waiting too long', 1, 240, 'WARNING'),
  ];
}

/** What a rule watches, in a sentence. */
export function ruleSentence(rule: AlertRule): string {
  const w = minutes(rule.windowMinutes);
  switch (rule.kind) {
    case 'RUN_FAILED': return rule.threshold <= 1 ? `A run fails (cleared after ${w} without one, or a run that completes)`
      : `${rule.threshold} or more runs of a pipeline fail within ${w}`;
    case 'SCHEDULE_MISSED': return `A schedule's slot is skipped, missed or overdue within ${w}`;
    case 'RUN_SLOW': return `A run takes over ${rule.factor ?? 2}x its pipeline's usual (p95), checked over ${w}`;
    case 'REVIEW_WAITING': return `A review or approval waits longer than ${w}`;
    case 'SERVICE_UNHEALTHY': return `A service is not up for ${rule.threshold} ${rule.threshold === 1 ? 'minute' : 'minutes'} in a row`;
    case 'SERVICE_RESTARTED': return `A service restarted within ${w}`;
    case 'MEMORY_HIGH': return `A service's heap after garbage collection reaches ${rule.threshold}%`;
    case 'KAFKA_LAG': return `A Kafka consumer group is ${rule.threshold.toLocaleString('en-US')} or more messages behind`;
    case 'DISK_LOW': return `The disk has under ${rule.threshold}% free`;
    case 'BILLING_MISMATCH': return 'This month\'s billing reconciliation does not agree';
    default: return rule.kind;
  }
}

/** 60 as "an hour", 15 as "15 minutes". */
export function minutes(n: number): string {
  if (n % 1440 === 0) return n === 1440 ? 'a day' : `${n / 1440} days`;
  if (n % 60 === 0) return n === 60 ? 'an hour' : `${n / 60} hours`;
  return n === 1 ? 'a minute' : `${n} minutes`;
}
