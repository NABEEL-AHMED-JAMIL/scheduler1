import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { jobFeedDestination } from './job-events.service';

/**
 * ZT-M8 (owner 2026-10-21: the platform administrator's own sign-in never reads a workspace's data): /topic/jobs.all streamed
 * every workspace's run statuses to the platform administrator's own sign-in. A person joins their own workspace's feed;
 * a managed session (the workspace's TENANT_ADMIN token) that workspace's; the own sign-in none.
 */
function auth(role: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER' | null, tenantId: number | null) {
  return {
    isPlatformAdmin: signal(role === 'PLATFORM_ADMIN'),
    user: signal(role ? { appUserId: 4639, tenantId, accessToken: 't' } as any : null),
  } as any;
}

describe('the job feed a person joins (ZT-M8)', () => {
  it('a tenant user and a workspace admin join their own workspace\'s feed', () => {
    expect(jobFeedDestination(auth('TENANT_USER', 2960))).toBe('/topic/jobs.2960');
    expect(jobFeedDestination(auth('TENANT_ADMIN', 2960))).toBe('/topic/jobs.2960');
  });

  it('a managed session joins the workspace it works in', () => {
    expect(jobFeedDestination(auth('TENANT_ADMIN', 2962))).toBe('/topic/jobs.2962');
  });

  it('the platform administrator\'s own sign-in joins no feed, never the cross-tenant one', () => {
    expect(jobFeedDestination(auth('PLATFORM_ADMIN', null))).toBeNull();
  });

  it('nobody signed in joins nothing', () => {
    expect(jobFeedDestination(auth(null, null))).toBeNull();
  });
});
