import { describe, it, expect } from 'vitest';
import { notificationTarget, openableTarget, pageKeyForPath } from './notification-links';

describe('notificationTarget', () => {
  it('rewrites a route stored by the old app', () => {
    expect(notificationTarget('/jobList')).toBe('/pipelines/schedules');
    expect(notificationTarget('/taskList')).toBe('/pipelines');
    expect(notificationTarget('/objectBrowser')).toBe('/documents/files');
    expect(notificationTarget('/users')).toBe('/administration/users');
    expect(notificationTarget('/tenants')).toBe('/administration/tenants');
  });

  // The stored links carry a query string the old app understood and this one has no route
  // for, so the lookup ignores it and so does the navigation.
  it('matches on the path alone and drops the query string', () => {
    expect(notificationTarget('/jobList?jobId=42')).toBe('/pipelines/schedules');
    expect(notificationTarget('/operations/reports?from=today')).toBe('/operations/reports');
  });

  it('passes an unmapped absolute path straight through', () => {
    expect(notificationTarget('/operations/queue')).toBe('/operations/queue');
  });

  // Nothing to open is a row that does not navigate, rather than one that navigates nowhere.
  it('returns null for a missing, blank or non-absolute link', () => {
    expect(notificationTarget(undefined)).toBeNull();
    expect(notificationTarget(null)).toBeNull();
    expect(notificationTarget('   ')).toBeNull();
    expect(notificationTarget('https://example.com/jobs')).toBeNull();
  });
});

/**
 * A tenant user whose access profile leaves out a page was still offered notification links to
 * it, and the click ended on the unauthorized page. A link is only offered when it can be opened.
 */
describe('openableTarget', () => {
  const only = (...keys: string[]) => (key: string) => keys.includes(key);

  it('knows which page a path belongs to, the more specific path first', () => {
    expect(pageKeyForPath('/operations/jobs/42/history')).toBe('jobs');
    expect(pageKeyForPath('/objects/analytics/dashboards/7')).toBe('analytics-dashboards');
    expect(pageKeyForPath('/objects/analytics')).toBe('analytics');
    expect(pageKeyForPath('/operations/jobsearch')).toBeNull();
    expect(pageKeyForPath('/profile')).toBeNull();
  });

  // MIG-246: today's addresses, and a schedule or a run under /pipelines/ is not the Pipelines list.
  it('knows the pages at their MIG-246 addresses', () => {
    expect(pageKeyForPath('/pipelines/schedules/42/executions')).toBe('jobs');
    expect(pageKeyForPath('/pipelines/schedules/42/runs/7/logs')).toBe('jobs');
    expect(pageKeyForPath('/pipelines/executions')).toBe('jobs');
    expect(pageKeyForPath('/pipelines/queue')).toBe('queue');
    expect(pageKeyForPath('/pipelines/run-analytics')).toBe('reports');
    expect(pageKeyForPath('/pipelines')).toBe('tasks');
    expect(pageKeyForPath('/pipelines/1854/edit')).toBe('tasks');
    expect(pageKeyForPath('/documents/files')).toBe('objects');
    expect(pageKeyForPath('/data/analytics/dashboards')).toBe('analytics-dashboards');
    expect(pageKeyForPath('/ai/prompts')).toBe('ai-prompts');
    expect(pageKeyForPath('/integration/api-collections')).toBe('api-collections');
  });

  it('drops a link to a page the profile withholds, and keeps the rest', () => {
    expect(openableTarget('/jobList', only('queue'))).toBeNull();
    expect(openableTarget('/operations/queue', only('queue'))).toBe('/operations/queue');
    // Not a page a profile governs: the link stays.
    expect(openableTarget('/profile', only())).toBe('/profile');
  });
});
