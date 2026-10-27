import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, from, map, mergeMap, of, shareReplay, toArray } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { AlertRule, AlertsApi } from '../../settings/alerts/alerts.api';
import { ReportStudioApi } from '../../report-studio/report-studio.api';
import { StudioSettings } from '../../report-studio/report-studio.model';
import { WorkflowDetail, WorkflowSummary, WorkflowsApi } from '../../workflows/workflows.api';

/** What sends work to a team: a workflow's task or notice, a workflow's Approval step, an alert rule, Report Studio. */
export type TeamUseKind = 'workflow' | 'approval' | 'alert' | 'reports';

export interface TeamUse {
  kind: TeamUseKind;
  /** "Leave request › Manager approval", "Runs failed", "Report Studio reviewers". */
  label: string;
  link: string;
  queryParams?: Record<string, string>;
}

/**
 * Where each team is used, by team id, as far as the caller may read it: `known` lists the sources that answered (a member
 * who cannot open the workflow designer, or a non-administrator for alerts and Report Studio, gets fewer), so the page
 * never says "used nowhere" about what it could not look at.
 */
export interface TeamUsage {
  byTeam: Map<number, TeamUse[]>;
  known: TeamUseKind[];
  /** More workflow definitions than MAX_WORKFLOWS: the newest were read, so a workflow count may be short. */
  capped?: boolean;
}

export const USE_LABELS: Record<TeamUseKind, { one: string; many: string; title: string; icon: string }> = {
  workflow: { one: 'workflow', many: 'workflows', title: 'Workflow', icon: 'layers' },
  approval: { one: 'approval', many: 'approvals', title: 'Approval', icon: 'checkCircle' },
  alert: { one: 'alert', many: 'alerts', title: 'Alert', icon: 'bell' },
  reports: { one: 'Report Studio', many: 'Report Studio', title: 'Report Studio', icon: 'file' },
};

/**
 * The most workflow definitions read for the usage (four at a time), so a large workspace never makes the page slow: the
 * designer's list carries no steps, so each definition is one more call. Past it the panel says the count may be short.
 */
export const MAX_WORKFLOWS = 60;
/** How long one reading is reused when the page is opened again (Refresh reads again). */
export const USAGE_TTL_MS = 60_000;

function add(into: Map<number, TeamUse[]>, teamId: number, use: TeamUse): void {
  if (!Number.isFinite(teamId)) return;
  const list = into.get(teamId) ?? [];
  if (!list.some(u => u.kind === use.kind && u.label === use.label)) list.push(use);
  into.set(teamId, list);
}

/** Every { kind: 'team', value } anywhere under a step (its assignee, a notice's "to", ...), as team ids. */
function teamsIn(value: unknown, found: Set<number> = new Set()): Set<number> {
  if (Array.isArray(value)) value.forEach(v => teamsIn(v, found));
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o['kind'] === 'team' && o['value'] != null && o['value'] !== '') found.add(Number(o['value']));
    Object.values(o).forEach(v => teamsIn(v, found));
  }
  return found;
}

/** A workflow definition's current version's steps that go to a team: an Approval step is an approval, any other a task. */
export function workflowUses(detail: WorkflowDetail, into: Map<number, TeamUse[]> = new Map()): Map<number, TeamUse[]> {
  const version = detail.versions?.find(v => v.version === detail.currentVersion) ?? detail.versions?.[detail.versions.length - 1];
  if (!version) return into;
  let parsed: unknown;
  try {
    parsed = typeof version.steps === 'string' ? JSON.parse(version.steps) : version.steps;
  } catch {
    return into;
  }
  const steps = Array.isArray(parsed) ? parsed : (parsed as { steps?: unknown[] } | null)?.steps ?? [];
  const link = '/workflows/designer';
  const queryParams = { key: detail.key };
  for (const step of steps as Record<string, unknown>[]) {
    for (const teamId of teamsIn(step)) {
      if (step?.['type'] === 'approval') {
        add(into, teamId, { kind: 'approval', label: `${detail.name} › ${String(step['name'] || step['key'] || 'Approval')}`, link, queryParams });
      } else {
        add(into, teamId, { kind: 'workflow', label: detail.name, link, queryParams });
      }
    }
  }
  return into;
}

export function alertUses(rules: AlertRule[], into: Map<number, TeamUse[]> = new Map()): Map<number, TeamUse[]> {
  for (const rule of rules) for (const teamId of rule.teams ?? []) add(into, teamId, { kind: 'alert', label: rule.name, link: '/settings/alerts' });
  return into;
}

export function reportUses(settings: StudioSettings | null, into: Map<number, TeamUse[]> = new Map()): Map<number, TeamUse[]> {
  const reviewers = settings?.approvals?.reviewers;
  const publishers = settings?.publishing?.publishers;
  if (reviewers?.kind === 'team') add(into, Number(reviewers.value), { kind: 'reports', label: 'Report Studio reviewers', link: '/reports/settings' });
  if (publishers?.kind === 'team') add(into, Number(publishers.value), { kind: 'reports', label: 'Report Studio publishers', link: '/reports/settings' });
  return into;
}

/** "2 workflows · 1 approval · 1 alert · Report Studio", in that order; '' when nothing. */
export function usageSummary(uses: TeamUse[] | undefined): { kind: TeamUseKind; text: string; count: number }[] {
  const kinds: TeamUseKind[] = ['workflow', 'approval', 'alert', 'reports'];
  return kinds.map(kind => {
    const count = (uses ?? []).filter(u => u.kind === kind).length;
    const words = USE_LABELS[kind];
    return { kind, count, text: kind === 'reports' ? words.one : `${count} ${count === 1 ? words.one : words.many}` };
  }).filter(s => s.count > 0);
}

/**
 * Reads where teams are used from what the caller may open (UX2, 2026-10-26): no new endpoint -- the workflow designer's
 * definitions (workflow-designer page), the workspace's alert rules and Report Studio's settings (an administrator's).
 * A source that refuses or fails is left out of `known`.
 */
@Injectable({ providedIn: 'root' })
export class TeamUsageReader {
  private readonly auth = inject(AuthService);
  private readonly workflows = inject(WorkflowsApi);
  private readonly alerts = inject(AlertsApi);
  private readonly reports = inject(ReportStudioApi);

  private cached: { at: number; usage$: Observable<TeamUsage> } | null = null;

  /** Reused for a minute (the page opened again, a tab switched back); `fresh` reads again (Refresh). */
  read(fresh = false): Observable<TeamUsage> {
    if (!fresh && this.cached && Date.now() - this.cached.at < USAGE_TTL_MS) return this.cached.usage$;
    const usage$ = this.readNow().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.cached = { at: Date.now(), usage$ };
    return usage$;
  }

  private readNow(): Observable<TeamUsage> {
    const admin = this.auth.isTenantAdmin();
    const canDesign = admin || this.auth.canOpen('workflow-designer');
    const none = of(null);
    let capped = false;
    const workflows$: Observable<WorkflowDetail[] | null> = canDesign ? this.workflows.list().pipe(
      mergeMap(r => {
        if (r.status !== API_SUCCESS) return of(null);
        const live = (r.data ?? []).filter((w: WorkflowSummary) => w.status !== 'Archived');
        capped = live.length > MAX_WORKFLOWS;
        const list = live.slice(0, MAX_WORKFLOWS);
        if (!list.length) return of([] as WorkflowDetail[]);
        return from(list).pipe(
          mergeMap(w => this.workflows.fetch(w.key).pipe(map(d => (d.status === API_SUCCESS ? d.data ?? null : null)), catchError(() => of(null))), 4),
          toArray(),
          map(all => all.filter((d): d is WorkflowDetail => !!d)),
        );
      }),
      catchError(() => of(null)),
    ) : none;
    const alerts$: Observable<AlertRule[] | null> = admin
      ? this.alerts.rules().pipe(map(r => (r.status === API_SUCCESS ? r.data?.rules ?? [] : null)), catchError(() => of(null))) : none;
    const reports$: Observable<StudioSettings | null | undefined> = admin
      ? this.reports.settings().pipe(catchError(() => of(undefined))) : of(undefined);
    return forkJoin({ workflows: workflows$, alerts: alerts$, reports: reports$ }).pipe(map(({ workflows, alerts, reports }) => {
      const byTeam = new Map<number, TeamUse[]>();
      const known: TeamUseKind[] = [];
      if (workflows) {
        workflows.forEach(d => workflowUses(d, byTeam));
        known.push('workflow', 'approval');
      }
      if (alerts) {
        alertUses(alerts, byTeam);
        known.push('alert');
      }
      if (reports) {
        reportUses(reports, byTeam);
        known.push('reports');
      }
      return { byTeam, known, capped };
    }));
  }
}
