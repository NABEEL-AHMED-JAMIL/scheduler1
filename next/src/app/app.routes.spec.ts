import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { pageGuard, roleGuard } from './core/auth/auth.guard';

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

describe('storage routes', () => {
  /*
   * The object browser is the frontend half of the storage guards: which bucket and key a
   * caller may reach is decided per request on the server, so the route can only name the
   * floor StorageBrowserRestApi names. What that buys is the case authGuard cannot see -- a
   * stored session whose token carries no readable role is signed in as far as authGuard is
   * concerned, and would otherwise land on a page that is nothing but refused storage calls.
   */
  it('guards /objects at the floor the storage API asks for', () => {
    const objects = find('documents/files');
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
    expect(find('configuration/lookup')?.redirectTo).toBe('configuration/values');
    expect(find('settings/lookup')?.redirectTo).toBe('configuration/values');
    expect(find('configuration/lookup')?.loadComponent).toBeUndefined();
  });

  it('lands an old Lookups link on Configuration values in a real router', async () => {
    @Component({ template: 'values' })
    class ValuesStub {}
    const redirects = [find('configuration/lookup'), find('settings/lookup')];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([...redirects, { path: 'configuration/values', component: ValuesStub }])],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/configuration/lookup');
    expect(TestBed.inject(Router).url).toBe('/configuration/values');
    await harness.navigateByUrl('/settings/lookup');
    expect(TestBed.inject(Router).url).toBe('/configuration/values');
  });

  it('guards each typed screen at the role its endpoints ask for', () => {
    for (const path of ['configuration/values', 'configuration/home-pages', 'configuration/task-groups']) {
      expect(find(path)?.data?.minRole, path).toBe('TENANT_ADMIN');
      expect(find(path)?.canActivate, path).toContain(roleGuard);
    }
    expect(find('configuration/engine')?.data?.minRole).toBe('PLATFORM_ADMIN');
    expect(find('configuration/engine')?.canActivate).toContain(roleGuard);
  });

  it('tells the one references screen which kind each route is', () => {
    expect(find('configuration/home-pages')?.data?.kind).toBe('HOME_PAGE');
    expect(find('configuration/task-groups')?.data?.kind).toBe('TASK_GROUP');
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
