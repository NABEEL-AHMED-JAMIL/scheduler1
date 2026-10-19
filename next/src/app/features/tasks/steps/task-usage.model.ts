/**
 * Owner #16 and #17 (2026-10-19): the Task Registry's platform controls, their audit, and the usage counts -- Core's
 * pipeline.json/steps/tasks/{platformState,history,usage,pipelines,runs} -- as the console reads them.
 */

/** A platform administrator's control over one task in one workspace. */
export type TaskControlState = 'default' | 'enabled' | 'disabled' | 'blocked';

/** One change of a task's control in a workspace (task_registry_audit), newest first. */
export interface TaskChange {
  code: string;
  action: 'enable' | 'disable' | 'default' | 'block' | string;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  by?: number | null;
  byName?: string | null;
  byRole?: string | null;
  at?: string | null;
}

/** One count: a step task's (code) or a Legacy row's (pipelineKey). */
export interface UsageCount { code?: string; pipelineKey?: number; pipelines: number; runs: number; }

export interface TaskUsage {
  /** The first of this month (America/Chicago), as an instant: what "runs" counts from. */
  since: string;
  /** yyyy-MM. */
  month: string;
  tenantId?: number | null;
  tasks: UsageCount[];
  legacy: UsageCount[];
}

/** Which row a list is for: a step task, or a Legacy row's registry pipeline. */
export type UsageOf = { code: string } | { pipelineKey: number };

export interface UsagePipeline {
  taskDetailId: number;
  taskName: string;
  pipelineId: string;
  tenantId: number;
  status?: string | null;
  /** The steps that run the task (a step task's list only). */
  steps: string[];
  runsThisMonth: number;
}

export interface UsageRun {
  jobQueueId: number;
  jobId: number;
  jobName?: string | null;
  taskDetailId: number;
  taskName?: string | null;
  jobStatus: string;
  tenantId: number;
  at?: string | null;
  endTime?: string | null;
}

export interface UsageRuns { since: string; total: number; pipelines: number; runs: UsageRun[]; }

export function usageParams(of: UsageOf, tenantId?: number | null): Record<string, string | number> {
  const params: Record<string, string | number> = 'code' in of ? { code: of.code } : { pipelineKey: of.pipelineKey };
  if (tenantId) params['tenantId'] = tenantId;
  return params;
}

/** The counts by row id, as the registry's rows are keyed: a task's code, or legacy:<pipelineKey>. */
export function usageById(usage: TaskUsage | null): Map<string, UsageCount> {
  const out = new Map<string, UsageCount>();
  for (const c of usage?.tasks ?? []) if (c.code) out.set(c.code, c);
  for (const c of usage?.legacy ?? []) if (c.pipelineKey != null) out.set(`legacy:${c.pipelineKey}`, c);
  return out;
}

/** "switched on", "blocked", ...: an audit line's verb. */
export function changeWords(c: TaskChange): string {
  switch (c.action) {
    case 'block': return 'blocked';
    case 'enable': return 'switched on';
    case 'disable': return 'switched off';
    case 'default': return 'put back to its default';
    default: return c.action;
  }
}
