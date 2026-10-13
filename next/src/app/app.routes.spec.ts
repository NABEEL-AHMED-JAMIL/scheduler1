import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { pageGuard, roleGuard } from './core/auth/auth.guard';
import { HUBS } from './core/nav/nav-tree';
import { toFirstTab } from './core/nav/nav-access';

/** The console's routes are one flat child list under the shell, plus the public ones. */
function flatten(rs: any[], prefix = ''): { path: string; route: any }[] {
  const out: { path: string; route: any }[] = [];
  for (const route of rs) {
    const path = `${prefix}/${route.path ?? ''}`;
    out.push({ path, route });
    if (route.children) out.push(...flatten(route.children, path));
  }
  return out;
}

const find = (path: string) => flatten(routes).find(entry => entry.route.path === path)?.route;
const page = (path: string) => flatten(routes).find(entry => entry.route.path === path && !entry.route.redirectTo)?.route;

describe('storage routes', () => {
  /*
   * The object browser is the frontend half of the storage guards: which bucket and key a
   * caller may reach is decided per request on the server, so the route can only name the
   * floor StorageBrowserRestApi names. What that buys is the case authGuard cannot see -- a
   * stored session whose token carries no readable role is signed in as far as authGuard is
   * concerned, and would otherwise land on a page that is nothing but refused storage calls.
   */
  it('guards /objects at the floor the storage API asks for', () => {
    const objects = find('data/files');
    expect(objects?.data?.minRole).toBe('TENANT_USER');
    expect(objects?.canActivate).toContain(roleGuard);
  });
});

/**
 * MIG-167: the generic Lookups screen was retired for typed ones. Its old addresses must still
 * land somewhere -- a bookmark, a docs link -- and the typed screens must carry the role the
 * server asks for: tenant administrator for a workspace's own entries, platform administrator
 * for the engine's.
 */
describe('configuration routes', () => {
  it('sends the old Lookups addresses to Configuration values', () => {
    expect(find('configuration/lookup')?.redirectTo).toBe('settings/values');
    expect(find('settings/lookup')?.redirectTo).toBe('settings/values');
    expect(find('configuration/lookup')?.loadComponent).toBeUndefined();
  });

  it('lands an old Lookups link on Configuration values in a real router', async () => {
    @Component({ template: 'values' })
    class ValuesStub {}
    const redirects = [find('configuration/lookup'), find('settings/lookup')];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([...redirects, { path: 'settings/values', component: ValuesStub }])],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/configuration/lookup');
    expect(TestBed.inject(Router).url).toBe('/settings/values');
    await harness.navigateByUrl('/settings/lookup');
    expect(TestBed.inject(Router).url).toBe('/settings/values');
  });

  it('guards each typed screen at the role its endpoints ask for', () => {
    for (const path of ['settings/values', 'settings/home-pages', 'settings/task-groups']) {
      expect(find(path)?.data?.minRole, path).toBe('TENANT_ADMIN');
      expect(find(path)?.canActivate, path).toContain(roleGuard);
    }
    expect(find('platform/engine')?.data?.minRole).toBe('PLATFORM_ADMIN');
    expect(find('platform/engine')?.canActivate).toContain(roleGuard);
  });

  it('tells the one references screen which kind each route is', () => {
    expect(find('settings/home-pages')?.data?.kind).toBe('HOME_PAGE');
    expect(find('settings/task-groups')?.data?.kind).toBe('TASK_GROUP');
  });
});

/**
 * MIG-254: Administration › Data policies. ai-service reads the policy for any member (TENANT_USER) and saves it for a
 * workspace administrator, under /aiPrompt.json -- which the gateway gates on the Prompts page. So the route asks for
 * that page and no role: a member holding Prompts reads the policy (the page hides every control), a member without
 * it is refused as the gateway would refuse them.
 */
describe('data policy route', () => {
  it('opens Data policies to whoever holds the Prompts page', () => {
    const policies = find('administration/data-policies');
    expect(policies?.title).toBe('Data policies');
    expect(policies?.data?.pageKey).toBe('ai-prompts');
    expect(policies?.data?.minRole).toBeUndefined();
    expect(policies?.canActivate).toContain(pageGuard);
  });
});

/**
 * Tab hubs (owner 2026-10-12): "think about security and roles for tabs". A hub's tab is shown by the menu tree's rules
 * (nav-tree.ts) and opened by its route's guard; the two say the same thing, so the strip never offers a tab that
 * answers 403, and typing the address of a tab the strip hides gives the 403 page -- never an empty tab. Grouping grants
 * nothing: every tab keeps its own route, page key and least role.
 */
describe('tab hubs: every tab is its own guarded route', () => {
  const tabs = HUBS.flatMap(hub => hub.tabs.map(tab => ({ hub, tab })));
  /** The one tab whose route is deliberately wider than the tab: a member holding Prompts reads Data policies from the
   * AI Assistant (MIG-254); the Administration hub still shows it to administrators only. */
  const WIDER_ROUTE = new Set(['/administration/data-policies']);

  it('has a lazy page with its own address for every tab, and one tab per address', () => {
    const paths = tabs.map(t => t.tab.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const { tab } of tabs) {
      const route = page(tab.path.slice(1));
      expect(route, tab.path).toBeDefined();
      expect(!!route.loadComponent || !!route.loadChildren, tab.path).toBe(true);
    }
  });

  for (const { hub, tab } of tabs) {
    it(`${hub.label} › ${tab.label} (${tab.path}): the route asks what the tab asks`, () => {
      const route = page(tab.path.slice(1));
      const guards: unknown[] = route.canActivate ?? [];
      const keys: string[] = route.data?.pageKeys ?? (route.data?.pageKey ? [route.data.pageKey] : []);
      const tabKeys: string[] = tab.pageKeys ?? (tab.pageKey ? [tab.pageKey] : []);
      const role = tab.platformOnly ? 'PLATFORM_ADMIN' : tab.adminOnly ? 'TENANT_ADMIN' : undefined;
      if (WIDER_ROUTE.has(tab.path)) {
        expect(route.data?.pageKey).toBe('ai-prompts');
        expect(guards).toContain(pageGuard);
        return;
      }
      expect(keys.sort()).toEqual(tabKeys.sort());
      if (keys.length) expect(guards).toContain(pageGuard);
      // The route's floor is the tab's: TENANT_USER is every signed-in member, no floor at all as far as a tab goes.
      const floor = route.data?.minRole === 'TENANT_USER' ? undefined : route.data?.minRole;
      expect(floor).toBe(role);
      if (role) expect(guards).toContain(roleGuard);
    });
  }

  it('sends each hub\'s own address to its first open tab, through the guarded redirect', () => {
    for (const hub of HUBS) {
      const route = find(hub.path.slice(1));
      expect(route?.redirectTo, hub.path).toBe(toFirstTab);
      expect(route?.pathMatch, hub.path).toBe('full');
    }
  });
});
