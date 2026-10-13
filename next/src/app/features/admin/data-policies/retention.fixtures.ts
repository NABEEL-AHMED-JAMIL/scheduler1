import { RetentionView } from './retention.model';

/** MIG-354: a workspace's retention as Core answers it, for the screen tests. */
export const RETENTION_VIEW: RetentionView = {
  tenantId: 2924,
  enabled: true,
  updatedAt: '2026-10-13T15:00:00Z',
  updatedBy: 4639,
  platform: { auditFloorDays: 2190, maxSharePct: 20 },
  classes: [
    { dataClass: 'RUN_OUTPUTS', label: 'Run outputs and datasets', covers: 'The datasets and files each run made.', owner: 'core', configurable: true,
      holds: 'workspace, pipeline, run', keepDays: 90, minDays: null, confirmedCount: null, confirmedAt: null,
      last: { dataClass: 'RUN_OUTPUTS', state: 'DONE', keepDays: 90, cutoff: '2026-07-15T08:40:00Z', eligible: 3, total: 40, deleted: 3, bytes: 3072,
        oldest: null, note: 'Removed 3 item(s) older than 90 day(s).', finishedAt: '2026-10-13T08:41:00Z' } },
    { dataClass: 'RUN_LOGS', label: 'Run logs', covers: 'Each run\'s log lines.', owner: 'core', configurable: true, holds: 'workspace, pipeline, run',
      keepDays: 30, minDays: null, confirmedCount: null, confirmedAt: null,
      last: { dataClass: 'RUN_LOGS', state: 'PAUSED', keepDays: 30, cutoff: '2026-09-13T08:40:00Z', eligible: 30, total: 40, deleted: 0, bytes: 0,
        oldest: null, note: '30 of 40 item(s) would go, more than 20% in one pass.', finishedAt: '2026-10-13T08:41:00Z' } },
    { dataClass: 'NOTIFICATIONS', label: 'Notifications', covers: 'Bell notices, read or not.', owner: 'notifications', configurable: true,
      holds: 'workspace', keepDays: null, minDays: null, confirmedCount: null, confirmedAt: null, last: null },
    { dataClass: 'ANALYTICS', label: 'Analytics copies and cache', covers: 'Bounded by the platform.', owner: 'none', configurable: false,
      holds: 'workspace', keepDays: null, minDays: null, confirmedCount: null, confirmedAt: null, last: null },
    { dataClass: 'AUDIT', label: 'Audit records', covers: 'File downloads and this policy\'s own history.', owner: 'core', configurable: true,
      holds: 'workspace', keepDays: 2190, minDays: 2190, confirmedCount: null, confirmedAt: null, last: null },
  ],
  holds: [
    { id: 1001, scope: 'PIPELINE', jobId: 3001, runId: null, reason: 'Records request 12', placedBy: 4639, placedAt: '2026-10-13T14:00:00Z', active: true,
      releasedBy: null, releasedAt: null, releaseReason: null },
    { id: 1000, scope: 'WORKSPACE', jobId: null, runId: null, reason: 'Old hold', placedBy: 4639, placedAt: '2026-10-12T14:00:00Z', active: false,
      releasedBy: 4639, releasedAt: '2026-10-12T15:00:00Z', releaseReason: 'Closed' },
  ],
  lastPass: { passId: 1004, startedHow: 'SCHEDULE', state: 'DONE', startedBy: null, startedAt: '2026-10-13T08:40:00Z', finishedAt: '2026-10-13T08:41:00Z',
    deleted: 3, bytes: 3072, note: 'removed 3 item(s).' },
  running: false,
};
