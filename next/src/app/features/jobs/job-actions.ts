import { API_BASE } from '../../core/api/api.config';

export type JobAction = 'run' | 'skip' | 'toggle' | 'delete';

/**
 * Every one of these endpoints takes a SourceJobDto in the body. Called the way the rest of
 * the app calls things -- a query parameter and a null body -- Spring answers
 * "Required request body is missing" with a 400, which is how run, skip, activate,
 * deactivate and delete all came to be inert on the jobs screen at once.
 *
 * Keeping the four in one table means the shape is stated once and can be asserted in a test,
 * rather than being re-decided at each call site.
 */
const ACTIONS: Record<JobAction, { method: 'POST' | 'PUT'; path: string }> = {
  run:    { method: 'POST', path: 'runSourceJob' },
  skip:   { method: 'POST', path: 'skipNextSourceJob' },
  toggle: { method: 'PUT',  path: 'toggleSourceJobStatus' },
  delete: { method: 'PUT',  path: 'deleteSourceJob' },
};

export interface JobActionRequest {
  method: 'POST' | 'PUT';
  url: string;
  body: { jobId: number };
}

export function jobActionRequest(action: JobAction, jobId: number): JobActionRequest {
  const { method, path } = ACTIONS[action];
  return { method, url: `${API_BASE}/sourceJob.json/${path}`, body: { jobId } };
}
