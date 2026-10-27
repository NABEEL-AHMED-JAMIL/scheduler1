import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { useMemoryStorage } from '../../shared/testing/memory-storage';
import { Visit, hubTabsOf, menuOf, restoreClock, visit } from '../../characterisation/harness';
import { AuthService, PLATFORM_SESSION_KEY } from '../../core/auth/auth.service';

/** MIG-254: what the shell adds for the managed service -- the staff session's bar, and the menu's new pages. */
const bar = (v: Visit) => v.root.querySelector('[data-managed-session]') as HTMLElement | null;
const said = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function openAdministration(v: Visit): Promise<string[]> {
  const group = Array.from(v.root.querySelectorAll('[data-nav-menu]'))
    .find(el => el.getAttribute('data-nav-menu') === 'Administration & billing')!;
  const button = group.querySelector(':scope > button') as HTMLElement;
  button.click();
  const made = await v.settle();
  button.click();
  await v.settle();
  return made;
}

describe('MIG-254: the shell and the managed service', () => {
  useMemoryStorage();
  afterEach(() => { restoreClock(); localStorage.removeItem(PLATFORM_SESSION_KEY); });

  it('a staff session shows whose workspace it is, that it is audited, and a way out', async () => {
    localStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify({ username: 'sam', accessToken: 'p', refreshToken: 'r' }));
    const v = await visit('/dashboard', 'TENANT_ADMIN', null, {}, { mgmt: 'MANAGED', msvc: true });
    // The harness's session names its workspace "Claude Demo", as the openSession answer would.
    expect(said(bar(v))).toContain('Managed session: Claude Demo — every change and every data read is recorded');
    const exit = Array.from(bar(v)!.querySelectorAll('button')).find(b => said(b) === 'Exit');
    expect(exit).toBeTruthy();
    const auth = TestBed.inject(AuthService);
    let exited = false;
    auth.exitManagedSession = () => { exited = true; };
    exit!.click();
    expect(exited).toBe(true);
  });

  /**
   * ZT-M18 (live: "Managed session: workspace 1009"): a session held without its workspace's name asks Identity for the
   * name of the session's own workspace, once, and the bar names it; it never shows the workspace's id.
   */
  it('a staff session held without its workspace\'s name asks Identity for it and names it', async () => {
    localStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify({ username: 'sam', accessToken: 'p', refreshToken: 'r' }));
    const answers = { 'GET /managedService.json/thisSession': { status: 'SUCCESS', message: '',
      data: { tenantId: 2924, tenantName: 'Zanium AI', managementMode: 'SELF' } } };
    const v = await visit('/dashboard', 'TENANT_ADMIN', null, answers, { msvc: true }, { tenantName: null });
    await v.settle();
    expect(v.surface.requests.filter(r => r.startsWith('GET /managedService.json/thisSession'))).toHaveLength(1);
    expect(said(bar(v))).toContain('Managed session: Zanium AI — every change and every data read is recorded');
    expect(said(bar(v))).not.toContain('2924');
    expect(TestBed.inject(AuthService).user()?.tenantName).toBe('Zanium AI');
  });

  it('a session that has its name asks for none', async () => {
    const v = await visit('/dashboard', 'TENANT_ADMIN', null, {}, { mgmt: 'MANAGED', msvc: true });
    expect(v.surface.requests.some(r => r.includes('/managedService.json/thisSession'))).toBe(false);
  });

  it('a staff session\'s account menu offers Exit instead of a profile it cannot read', async () => {
    const v = await visit('/dashboard', 'TENANT_ADMIN', null, {}, { mgmt: 'MANAGED', msvc: true });
    (v.root.querySelector('[data-nav-menu="__user"] > button') as HTMLElement).click();
    await v.settle();
    const menu = said(v.root.querySelector('[data-nav-menu="__user"]'));
    expect(menu).toContain('Exit managed session');
    expect(menu).not.toContain('Your profile');
  });

  it('no bar for anyone else', async () => {
    for (const [role, claims] of [['TENANT_ADMIN', {}], ['TENANT_ADMIN', { mgmt: 'MANAGED' }], ['PLATFORM_ADMIN', {}]] as const) {
      const v = await visit('/dashboard', role, null, {}, claims);
      expect(bar(v), `${role} ${JSON.stringify(claims)}`).toBeNull();
      restoreClock();
    }
  });

  // UX review 2026-10-12 (A10, PL2): the platform's pages are one group of their own -- since the tab hubs, one Platform
  // entry whose tabs they are.
  it('a platform administrator finds the managed service under Platform', async () => {
    const v = await visit('/platform/workspaces', 'PLATFORM_ADMIN', null);
    expect(await menuOf(v)).toContain('Platform -> /platform');
    const tabs = hubTabsOf(v);
    expect(tabs).toContain('Managed service -> /platform/managed-service');
    expect(tabs).toContain('Staff activity -> /platform/staff-activity');
    // Owner #20: Work in a workspace is no page of its own; its action is on Workspaces.
    expect(tabs.some(t => t.includes('work-in-workspace'))).toBe(false);
    expect(tabs).toContain('Service health -> /platform/service-health');
    // Our team's activity is a workspace administrator's view; the platform administrator has Staff activity.
    restoreClock();
    const admin = await visit('/administration/users', 'PLATFORM_ADMIN', null);
    expect(hubTabsOf(admin).some(t => t.startsWith('Activity'))).toBe(false);
  });

  it('a MANAGED workspace\'s administrator finds our team\'s activity, with no request to decide it', async () => {
    const v = await visit('/administration/users', 'TENANT_ADMIN', null, {}, { mgmt: 'MANAGED' });
    const made = await openAdministration(v);
    expect(made.some(r => r.includes('/managedService.json/actions'))).toBe(false);
    expect(v.surface.requests.some(r => r.includes('/managedService.json/actions'))).toBe(false);
    expect(hubTabsOf(v)).toContain('Activity -> /administration/team-activity');
    expect((await menuOf(v)).some(e => e.includes('Platform'))).toBe(false);
  });

  it('a SELF workspace\'s administrator sees it only once our team has done something there', async () => {
    const answers = { 'GET /managedService.json/actions': { status: 'SUCCESS', message: '', data: [{ id: 3 }], paging: {} } };
    const v = await visit('/administration/users', 'TENANT_ADMIN', null, answers);
    expect(v.surface.requests).toContain('GET /managedService.json/actions?limit=1');
    expect(hubTabsOf(v)).toContain('Activity -> /administration/team-activity');
  });

  it('and not when there is nothing, asking once', async () => {
    const v = await visit('/administration/users', 'TENANT_ADMIN', null);
    const made = [...v.surface.requests, ...await openAdministration(v), ...await openAdministration(v)];
    expect(made.filter(r => r.includes('/managedService.json/actions'))).toHaveLength(1);
    expect(hubTabsOf(v).some(t => t.startsWith('Activity'))).toBe(false);
  });
});
