import { describe, it, expect, afterEach } from 'vitest';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Route, Router, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { anonymousOnly } from '../../../core/auth/auth.guard';
import { crumbsFor, tabAt } from '../../../core/nav/nav-tree';
import { useMemoryStorage } from '../../../shared/testing/memory-storage';
import { DocumentsIntake } from './intake';
import { INTAKE_SECTIONS } from './intake-sections';

/**
 * Owner 2026-10-20 (§0.1): Documents › Intake is one tab for Upload, Email-in and File drop. The tab shows to whoever holds
 * either page; each section keeps its own page key and guard; the tab's address opens the first section the reader may
 * open, and an old bookmark lands on its section with its query.
 */

type Role = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

function signIn(role: Role, pageKeys: string[] | null = null, tenantId: number | null = 2960): void {
  const claims = btoa(JSON.stringify({ sub: 'r@example.com', appUserId: 9, userRole: role }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  localStorage.setItem('etl_auth_user', JSON.stringify({
    username: 'r@example.com', userRole: role, appUserId: 9, tenantId,
    accessToken: `header.${claims}.unsigned`, refreshToken: 'r', pageKeys,
  }));
}

@Component({ template: 'page' })
class PageStub {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class OutletStub {}

/** The real route table, guards and redirects included, with every page a stub that keeps its outlet. */
function guardedAddresses(list: Route[]): Route[] {
  return list
    .filter(r => !(r.canMatch ?? []).includes(anonymousOnly))
    .filter(r => r.path !== 'login')
    .map(r => {
      const copy: Route = { ...r };
      if (r.loadComponent || r.loadChildren) { delete copy.loadComponent; delete copy.loadChildren; copy.component = r.children ? OutletStub : PageStub; }
      if (r.component) copy.component = r.children ? OutletStub : PageStub;
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

describe('Documents › Intake: one tab, three guarded sections', () => {
  useMemoryStorage();
  afterEach(() => localStorage.clear());

  it('opens the first section the reader may open, with the query', async () => {
    expect(await land('/documents/intake', 'TENANT_ADMIN')).toBe('/documents/intake/upload');
    expect(await land('/documents/intake?from=home', 'TENANT_USER', ['document-intelligence'])).toBe('/documents/intake/upload?from=home');
    // A member holding only Browse files' page: the file drop is theirs, Document Intelligence's sections are not.
    expect(await land('/documents/intake', 'TENANT_USER', ['objects'])).toBe('/documents/intake/file-drop');
  });

  it('refuses a section the reader does not hold, and the whole tab to someone holding neither page', async () => {
    expect(await land('/documents/intake/upload', 'TENANT_USER', ['objects'])).toMatch(/^\/unauthorized\?page=document-intelligence/);
    expect(await land('/documents/intake/file-drop', 'TENANT_USER', ['document-intelligence'])).toMatch(/^\/unauthorized\?page=objects/);
    expect(await land('/documents/intake', 'TENANT_USER', ['jobs'])).toMatch(/^\/unauthorized/);
  });

  it('lands an old bookmark on its section, keeping the query', async () => {
    expect(await land('/documents/file-drop?upload=1', 'TENANT_ADMIN')).toBe('/documents/intake/file-drop?upload=1');
    expect(await land('/documents/email-in', 'TENANT_ADMIN')).toBe('/documents/intake/email-in');
    expect(await land('/documents/inbox', 'TENANT_ADMIN')).toBe('/documents/intake/file-drop');
    expect(await land('/documents/datasets?type=7', 'TENANT_ADMIN')).toBe('/documents/approved-data?type=7');
  });

  it('is the Documents hub\'s Intake tab at every section, and its breadcrumb', () => {
    for (const s of INTAKE_SECTIONS) {
      expect(tabAt(s.path)?.tab.label, s.path).toBe('Intake');
      expect(crumbsFor(s.path, s.label).map(c => c.label)).toEqual(['Get data in', 'Documents', 'Intake']);
    }
    expect(tabAt('/documents/approved-data')?.tab.label).toBe('Approved data');
  });

  it('shows the sections the reader may open, and says what the open one does', async () => {
    signIn('TENANT_USER', ['objects', 'document-intelligence']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideRouter([
        { path: 'documents/intake', component: DocumentsIntake, children: [
          { path: 'upload', component: PageStub }, { path: 'email-in', component: PageStub }, { path: 'file-drop', component: PageStub },
        ] },
      ])],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/documents/intake/file-drop');
    const strip = (harness.fixture.nativeElement as HTMLElement).querySelector('[data-test="intake-sections"]')!;
    expect([...strip.querySelectorAll('a')].map(a => a.textContent!.trim())).toEqual(['Upload', 'Email-in', 'File drop']);
    expect(strip.querySelector('[aria-current="page"]')!.getAttribute('data-section')).toBe('file-drop');
    expect((harness.fixture.nativeElement as HTMLElement).querySelector('[data-test="intake-what"]')!.textContent).toContain('starts every schedule');

    signIn('TENANT_USER', ['objects']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideRouter([
        { path: 'documents/intake', component: DocumentsIntake, children: [{ path: 'file-drop', component: PageStub }] },
      ])],
    });
    const alone = await RouterTestingHarness.create();
    await alone.navigateByUrl('/documents/intake/file-drop');
    expect((alone.fixture.nativeElement as HTMLElement).querySelector('[data-test="intake-sections"]'), 'one section: no strip').toBeNull();
  });
});
