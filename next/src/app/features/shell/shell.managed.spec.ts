import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { useMemoryStorage } from '../../shared/testing/memory-storage';
import { Visit, menuOf, restoreClock, visit } from '../../characterisation/harness';
import { AuthService, PLATFORM_SESSION_KEY } from '../../core/auth/auth.service';

/** MIG-254: what the shell adds for the managed service -- the staff session's bar, and the menu's new pages. */
const bar = (v: Visit) => v.root.querySelector('[data-managed-session]') as HTMLElement | null;
const said = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function openAdministration(v: Visit): Promise<string[]> {
  const button = v.root.querySelector('[data-nav-menu="Administration"] > button') as HTMLElement;
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
    expect(said(bar(v))).toContain('Managed session: Claude Demo — every change is audited');
    const exit = Array.from(bar(v)!.querySelectorAll('button')).find(b => said(b) === 'Exit');
    expect(exit).toBeTruthy();
    const auth = TestBed.inject(AuthService);
    let exited = false;
    auth.exitManagedSession = () => { exited = true; };
    exit!.click();
    expect(exited).toBe(true);
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

  it('a platform administrator finds the managed service in Administration', async () => {
    const v = await visit('/dashboard', 'PLATFORM_ADMIN', null);
    const menu = (await menuOf(v)).filter(e => e.startsWith('Administration'));
    expect(menu.some(e => e.includes('Managed service') && e.endsWith('-> /administration/managed-service'))).toBe(true);
    expect(menu.some(e => e.includes('Staff activity') && e.endsWith('-> /administration/staff-activity'))).toBe(true);
    expect(menu.some(e => e.includes('Work in a workspace') && e.endsWith('-> /administration/work-in-workspace'))).toBe(true);
    expect(menu.some(e => e.includes("Our team's activity"))).toBe(false);
  });

  it('a MANAGED workspace\'s administrator finds our team\'s activity, with no request to decide it', async () => {
    const v = await visit('/dashboard', 'TENANT_ADMIN', null, {}, { mgmt: 'MANAGED' });
    const made = await openAdministration(v);
    expect(made.some(r => r.includes('/managedService.json/actions'))).toBe(false);
    const menu = (await menuOf(v)).filter(e => e.startsWith('Administration'));
    expect(menu.some(e => e.includes("Our team's activity") && e.endsWith('-> /administration/team-activity'))).toBe(true);
    expect(menu.some(e => e.includes('Managed service'))).toBe(false);
  });

  it('a SELF workspace\'s administrator sees it only once our team has done something there', async () => {
    const answers = { 'GET /managedService.json/actions': { status: 'SUCCESS', message: '', data: [{ id: 3 }], paging: {} } };
    const v = await visit('/dashboard', 'TENANT_ADMIN', null, answers);
    const made = await openAdministration(v);
    expect(made).toContain('GET /managedService.json/actions?limit=1');
    const menu = (await menuOf(v)).filter(e => e.startsWith('Administration'));
    expect(menu.some(e => e.includes("Our team's activity"))).toBe(true);
  });

  it('and not when there is nothing, asking once', async () => {
    const v = await visit('/dashboard', 'TENANT_ADMIN', null);
    const first = await openAdministration(v);
    const second = await openAdministration(v);
    expect(first.filter(r => r.includes('/managedService.json/actions'))).toHaveLength(1);
    expect(second.filter(r => r.includes('/managedService.json/actions'))).toHaveLength(0);
    const menu = (await menuOf(v)).filter(e => e.startsWith('Administration'));
    expect(menu.some(e => e.includes("Our team's activity"))).toBe(false);
  });
});
