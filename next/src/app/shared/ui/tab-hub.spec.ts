import { describe, it, expect, afterEach } from 'vitest';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Route, Router, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { anonymousOnly } from '../../core/auth/auth.guard';
import { crumbsFor, tabAt } from '../../core/nav/nav-tree';
import { useMemoryStorage } from '../testing/memory-storage';
import { TabHub } from './tab-hub';

/**
 * Tab hubs (owner 2026-10-12): "group a lot of stuff ... but also think about security and roles for tabs". The strip
 * shows the tabs the reader may open -- none, one (the page alone, no strip) or many -- the hub's own address opens the
 * first of them, and a tab the strip hides answers its address with the 403 page, old addresses included.
 */

type Role = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

/** A stored session, read by AuthService when it is built: a role, and a tenant user's access-profile pages. */
function signIn(role: Role, pageKeys: string[] | null = null): void {
  const claims = btoa(JSON.stringify({ sub: 'r@example.com', appUserId: 9, userRole: role }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  localStorage.setItem('etl_auth_user', JSON.stringify({
    username: 'r@example.com', userRole: role, appUserId: 9,
    accessToken: `header.${claims}.unsigned`, refreshToken: 'r', pageKeys,
  }));
}

@Component({ template: 'page' })
class PageStub {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class ShellStub {}

/** The real route table, guards and redirects included, with every page a stub: what is under test is who lands where. */
function guardedAddresses(list: Route[]): Route[] {
  return list
    .filter(r => !(r.canMatch ?? []).includes(anonymousOnly))
    .filter(r => r.path !== 'login')
    .map(r => {
      const copy: Route = { ...r };
      if (r.loadComponent || r.loadChildren) { delete copy.loadComponent; delete copy.loadChildren; copy.component = PageStub; }
      if (r.component) copy.component = r.children ? ShellStub : PageStub;
      if (r.children) copy.children = guardedAddresses(r.children);
      return copy;
    });
}

async function land(url: string, role: Role, pageKeys: string[] | null = null): Promise<string> {
  signIn(role, pageKeys);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter(guardedAddresses(routes)), provideHttpClient(), provideHttpClientTesting()],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return TestBed.inject(Router).url;
}

/** The strip at an address, as "label (open)" per tab; [] when it shows nothing. */
function strip(url: string, role: Role, pageKeys: string[] | null = null): string[] {
  signIn(role, pageKeys);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(TabHub);
  fixture.componentRef.setInput('url', url);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return Array.from(el.querySelectorAll('[data-test="tab-hub"] a')).map(a => {
    const label = a.textContent!.replace(/\s+/g, ' ').trim();
    expect(a.getAttribute('href'), label).toBe(a.getAttribute('data-tab'));
    return a.getAttribute('aria-current') === 'page' ? `${label} (open)` : label;
  });
}

describe('tab hubs: the strip lists the tabs the reader may open', () => {
  useMemoryStorage();
  afterEach(() => localStorage.removeItem('etl_auth_user'));

  it('many: a workspace administrator sees every Connections tab, the open one marked as the current page', () => {
    expect(strip('/connections/storage', 'TENANT_ADMIN')).toEqual([
      'Connectors', 'Storage (open)', 'Databases', 'API collections', 'Sources', 'Data contracts',
    ]);
  });

  it('many, filtered by page keys: a member holding Sources only sees its three tabs, never Storage', () => {
    expect(strip('/connections/sources', 'TENANT_USER', ['sources'])).toEqual(['Databases', 'Sources (open)', 'Data contracts']);
  });

  it('many, filtered by role: Platform\'s tabs are a platform administrator\'s', () => {
    expect(strip('/platform/workspaces', 'PLATFORM_ADMIN')).toHaveLength(9);
    expect(strip('/platform/workspaces', 'TENANT_ADMIN')).toEqual([]);
  });

  it('one: the page alone, with no strip (Run analytics for a member holding only it)', () => {
    expect(strip('/runs/analytics', 'TENANT_USER', ['reports'])).toEqual([]);
  });

  it('none: no strip at all', () => {
    expect(strip('/runs/latest', 'TENANT_USER', [])).toEqual([]);
  });

  it('Latest shows for whoever holds Schedules or Runs by date; By date for Runs by date only', () => {
    expect(strip('/runs/latest', 'TENANT_USER', ['jobs', 'reports'])).toEqual(['Latest (open)', 'Analytics']);
    // MIG-355: Runs › Failed is the Queue's too.
    expect(strip('/runs/by-date', 'TENANT_USER', ['queue', 'reports'])).toEqual(['Latest', 'By date (open)', 'Analytics', 'Failed']);
  });

  it('a page the reader may open that is not one of their tabs shows no strip around it (Data policies for a member)', () => {
    expect(strip('/administration/data-policies', 'TENANT_USER', ['ai-prompts'])).toEqual([]);
    expect(strip('/administration/data-policies', 'TENANT_ADMIN')).toContain('Data policies (open)');
  });

  it('a detail page beneath a tab shows no strip', () => {
    expect(tabAt('/connections/api-collections/12')).toBeUndefined();
    expect(strip('/connections/api-collections/12', 'TENANT_ADMIN')).toEqual([]);
    expect(strip('/pipelines/7/edit', 'TENANT_ADMIN')).toEqual([]);
  });
});

describe('tab hubs: a hub\'s address opens its first open tab, and the 403 page when there is none', () => {
  useMemoryStorage();
  afterEach(() => localStorage.removeItem('etl_auth_user'));

  it('the first tab the reader may open, in the hub\'s order', async () => {
    expect(await land('/connections', 'TENANT_ADMIN')).toBe('/connections/connectors');
    expect(await land('/connections', 'TENANT_USER', ['sources'])).toBe('/connections/databases');
    expect(await land('/runs', 'TENANT_USER', ['reports'])).toBe('/runs/analytics');
    expect(await land('/platform', 'PLATFORM_ADMIN')).toBe('/platform/workspaces');
    expect(await land('/settings', 'TENANT_USER', ['ai-prompts'])).toBe('/settings/tools');
  });

  it('carries the query string to the tab', async () => {
    expect(await land('/runs?jobStatus=Failed', 'TENANT_ADMIN')).toBe('/runs/latest?jobStatus=Failed');
  });

  it('none: the 403 page, naming the hub\'s first page so the reader can ask for it', async () => {
    expect(await land('/connections', 'TENANT_USER', [])).toBe('/unauthorized?page=connector-hub&title=Connections');
    // A hub of administrators' pages is a role refusal: there is no page to ask for.
    expect(await land('/billing', 'TENANT_USER', null)).toBe('/unauthorized');
    expect(await land('/platform', 'TENANT_ADMIN')).toBe('/unauthorized');
  });
});

describe('tab hubs: a hidden tab\'s address gives the 403 page, never an empty tab', () => {
  useMemoryStorage();
  afterEach(() => localStorage.removeItem('etl_auth_user'));

  it('typed directly', async () => {
    expect(await land('/connections/storage', 'TENANT_USER', null)).toBe('/unauthorized');
    expect(await land('/runs/analytics', 'TENANT_USER', ['jobs'])).toBe('/unauthorized?page=reports&title=Run%20analytics');
    expect(await land('/runs/by-date', 'TENANT_USER', ['jobs'])).toBe('/unauthorized?page=queue&title=Runs%20by%20date');
    expect(await land('/settings/kafka', 'TENANT_USER', null)).toBe('/unauthorized');
    expect(await land('/platform/rate-cards', 'TENANT_ADMIN')).toBe('/unauthorized');
    expect(await land('/developers/portal', 'TENANT_USER', null)).toBe('/unauthorized?page=developer-portal&title=Developer%20portal');
  });

  it('through an old address: the redirect lands on the tab, whose own guard refuses', async () => {
    expect(await land('/integration/connectors/storage', 'TENANT_USER', null)).toBe('/unauthorized');
    expect(await land('/pipelines/run-analytics', 'TENANT_USER', ['jobs'])).toBe('/unauthorized?page=reports&title=Run%20analytics');
    expect(await land('/administration/tenants', 'TENANT_ADMIN')).toBe('/unauthorized');
    expect(await land('/configuration/kafka', 'TENANT_USER', null)).toBe('/unauthorized');
  });

  it('and opens for whoever holds it', async () => {
    expect(await land('/integration/connectors/storage', 'TENANT_ADMIN')).toBe('/connections/storage');
    expect(await land('/pipelines/run-analytics', 'TENANT_USER', ['reports'])).toBe('/runs/analytics');
    expect(await land('/administration/data-policies', 'TENANT_USER', ['ai-prompts'])).toBe('/administration/data-policies');
  });
});

describe('tab hubs: the breadcrumb reads group › hub › tab', () => {
  it('on a tab: the hub links to its address, the tab is the last step', () => {
    expect(crumbsFor('/connections/storage', 'Connections')).toEqual([
      { label: 'Get data in' }, { label: 'Connections', link: '/connections' }, { label: 'Storage' },
    ]);
    expect(crumbsFor('/settings/kafka', 'Kafka & Topics')).toEqual([
      { label: 'Administration & billing' }, { label: 'Settings', link: '/settings' }, { label: 'Kafka & Topics' },
    ]);
  });

  it('a top-level hub has no group', () => {
    expect(crumbsFor('/platform/rate-cards', 'Rate cards')).toEqual([
      { label: 'Platform', link: '/platform' }, { label: 'Rate cards' },
    ]);
  });

  it('a detail beneath a tab: hub › tab › the object', () => {
    expect(crumbsFor('/connections/api-collections/12', 'Patients API')).toEqual([
      { label: 'Get data in' }, { label: 'Connections', link: '/connections' },
      { label: 'API collections', link: '/connections/api-collections' }, { label: 'Patients API' },
    ]);
    expect(crumbsFor('/pipelines/schedules/4/edit', 'Nightly claims')).toEqual([
      { label: 'Build' }, { label: 'Pipelines', link: '/pipelines' },
      { label: 'Schedules & triggers', link: '/pipelines/schedules' }, { label: 'Nightly claims' },
    ]);
  });

  it('a page in a hub but under no tab: hub › the page', () => {
    expect(crumbsFor('/pipelines/7/edit', 'Brain tumour grading')).toEqual([
      { label: 'Build' }, { label: 'Pipelines', link: '/pipelines' }, { label: 'Brain tumour grading' },
    ]);
  });

  it('an entry of its own keeps group › entry', () => {
    expect(crumbsFor('/workflows/inbox', 'Review inbox')).toEqual([{ label: 'Run & review' }, { label: 'Review inbox' }]);
    expect(crumbsFor('/documents/review', 'Document review')).toEqual([{ label: 'Run & review' }, { label: 'Document review' }]);
    expect(crumbsFor('/data/analytics/dashboards', 'Dashboards')).toEqual([{ label: 'See results' }, { label: 'Dashboards' }]);
  });
});
