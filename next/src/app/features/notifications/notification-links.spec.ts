import { describe, it, expect } from 'vitest';
import { notificationTarget } from './notification-links';

describe('notificationTarget', () => {
  it('rewrites a route stored by the old app', () => {
    expect(notificationTarget('/jobList')).toBe('/jobs');
    expect(notificationTarget('/taskList')).toBe('/tasks');
    expect(notificationTarget('/objectBrowser')).toBe('/objects');
    expect(notificationTarget('/users')).toBe('/admin/users');
    expect(notificationTarget('/tenants')).toBe('/admin/tenants');
  });

  // The stored links carry a query string the old app understood and this one has no route
  // for, so the lookup ignores it and so does the navigation.
  it('matches on the path alone and drops the query string', () => {
    expect(notificationTarget('/jobList?jobId=42')).toBe('/jobs');
    expect(notificationTarget('/reports?from=today')).toBe('/reports');
  });

  it('passes an unmapped absolute path straight through', () => {
    expect(notificationTarget('/queue')).toBe('/queue');
  });

  // Nothing to open is a row that does not navigate, rather than one that navigates nowhere.
  it('returns null for a missing, blank or non-absolute link', () => {
    expect(notificationTarget(undefined)).toBeNull();
    expect(notificationTarget(null)).toBeNull();
    expect(notificationTarget('   ')).toBeNull();
    expect(notificationTarget('https://example.com/jobs')).toBeNull();
  });
});
