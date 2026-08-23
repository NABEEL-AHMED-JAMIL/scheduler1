import { describe, it, expect } from 'vitest';
import { jobActionRequest, JobAction } from './job-actions';

describe('jobActionRequest', () => {
  // The bug: a jobId sent as a query parameter with a null body. Spring rejects that with
  // 400 "Required request body is missing" for every one of these endpoints.
  it.each<[JobAction, 'POST' | 'PUT', string]>([
    ['run', 'POST', 'runSourceJob'],
    ['skip', 'POST', 'skipNextSourceJob'],
    ['toggle', 'PUT', 'toggleSourceJobStatus'],
    ['delete', 'PUT', 'deleteSourceJob'],
  ])('sends %s as %s with the id in the body', (action, method, path) => {
    const request = jobActionRequest(action, 1248);
    expect(request.method).toBe(method);
    expect(request.url).toContain(`/sourceJob.json/${path}`);
    expect(request.body).toEqual({ jobId: 1248 });
  });

  it('never puts the id in the query string', () => {
    for (const action of ['run', 'skip', 'toggle', 'delete'] as JobAction[]) {
      expect(jobActionRequest(action, 7).url).not.toContain('jobId=');
    }
  });

  it('sends the id as a number, since the DTO field is a Long', () => {
    expect(typeof jobActionRequest('run', 1248).body.jobId).toBe('number');
  });
});
