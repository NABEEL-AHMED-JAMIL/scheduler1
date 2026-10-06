import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { routes } from '../../app.routes';
import { pageGuard } from '../../core/auth/auth.guard';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClientsApi } from '../integration/api-clients/api-clients.api';
import { ToastService } from '../../shared/ui/toast.service';
import { DEVELOPER_ROUTES } from './developer.routes';
import { DOCS, Guide, guideTitle } from './developer-docs';
import { DeveloperLayout } from './developer-layout';
import { DeveloperOverview } from './overview';
import { DeveloperReference } from './reference';
import { DeveloperGuide } from './guide';
import { DeveloperChangelog } from './changelog';

const SANDBOX = { tenantId: 2950, name: 'Northwind (sandbox)', code: 'NWSBX', status: 'Active', createdAt: '2026-10-06T09:00:00' };

function configure(admin: boolean, sandbox: () => unknown = () => of({ status: 'SUCCESS', message: '', data: SANDBOX })) {
  const api = { sandbox: vi.fn(sandbox) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(),
    provideRouter([{ path: 'integration/developer', children: DEVELOPER_ROUTES }], withComponentInputBinding()),
    { provide: ApiClientsApi, useValue: api },
    { provide: AuthService, useValue: { hasAtLeast: (role: string) => admin && role !== 'PLATFORM_ADMIN' } },
    { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } },
  ] });
  return api;
}

function overview(admin: boolean, sandbox?: () => unknown) {
  const api = configure(admin, sandbox);
  const fixture = TestBed.createComponent(DeveloperOverview);
  fixture.detectChanges();
  return { api, el: fixture.nativeElement as HTMLElement };
}

describe('MIG-336: the developer portal\'s routes and menu', () => {
  it('is one lazy route under Integration, guarded by its own page key', () => {
    const route = routes.find(r => r.children)!.children!.find(r => r.path === 'integration/developer')!;
    expect(route.title).toBe('Developer portal');
    expect(route.data?.['pageKey']).toBe('developer-portal');
    expect(route.canActivate).toContain(pageGuard);
    expect(route.loadChildren).toBeDefined();
  });

  it('has the overview, the reference, a guide by slug and the changelog inside one layout', () => {
    const [layout] = DEVELOPER_ROUTES;
    expect(layout.component).toBe(DeveloperLayout);
    expect(layout.children!.map(c => [c.path, typeof c.title === 'string' ? c.title : 'resolved', c.component])).toEqual([
      ['', 'Developer portal', DeveloperOverview],
      ['reference', 'API reference', DeveloperReference],
      ['guides/:slug', 'resolved', DeveloperGuide],
      ['changelog', 'API changelog', DeveloperChangelog],
    ]);
    expect(guideTitle('no-such-guide')).toBe('Guide');
  });

  it('lands each address on its page', async () => {
    configure(true);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/integration/developer/reference#op-createToken');
    expect(TestBed.inject(Router).url).toBe('/integration/developer/reference#op-createToken');
    expect(harness.routeNativeElement!.querySelector('[data-developer-portal]')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('#op-createToken')).not.toBeNull();
    await harness.navigateByUrl('/integration/developer/changelog');
    expect(harness.routeNativeElement!.querySelector('[data-changelog]')!.textContent).toContain('v1.0.0-draft');
  });

  it('lists the overview, the guides, the reference by tag, events, problems, the changelog and downloads on the left', () => {
    const labels = DeveloperLayout.links().map(l => l.label);
    expect(labels.slice(0, 1)).toEqual(['Overview']);
    for (const label of ['API reference', 'runs', 'webhooks', 'Event types', 'Problem types', 'Changelog', 'Downloads']) {
      expect(labels).toContain(label);
    }
    const events = DeveloperLayout.links().find(l => l.label === 'Event types')!;
    expect([events.route, events.fragment]).toEqual(['/integration/developer/reference', 'events']);
  });
});

describe('MIG-336: the overview', () => {
  it('says what the API is for, its address, and offers the downloads', () => {
    const { el } = overview(true);
    expect(el.querySelector('[data-api-purpose]')!.textContent).toContain('Auth: OAuth 2.0 client credentials');
    expect(el.querySelector('[data-base-url]')!.textContent).toContain(':9098/v1');
    const links = [...el.querySelectorAll('[data-downloads] a')].map(a => a.getAttribute('href'));
    expect(links).toEqual(['/developer/openapi-v1.yaml', '/developer/openapi-v1.json', '/developer/postman-collection-v1.json']);
  });

  it('shows an administrator their sandbox and where its test keys are made', () => {
    const { el, api } = overview(true);
    expect(api.sandbox).toHaveBeenCalledTimes(1);
    const card = el.querySelector('[data-sandbox-card]')!;
    expect(card.textContent).toContain('Your sandbox: Northwind (sandbox) (workspace 2950)');
    expect(card.querySelector('a[href="/integration/api-clients#sandbox"]')).not.toBeNull();
  });

  it('tells an administrator without one to ask the account team', () => {
    const { el } = overview(true, () => of({ status: 'SUCCESS', message: '', data: null }));
    expect(el.querySelector('[data-sandbox-card]')!.textContent).toContain('No sandbox yet: ask your account team to create one.');
  });

  it('says why when the sandbox cannot be read, and draws the rest', () => {
    const { el } = overview(true, () => throwError(() => ({ status: 503, error: { message: 'Identity is not answering.' } })));
    expect(el.querySelector('[data-sandbox-card] [role="alert"]')!.textContent).toContain('Identity is not answering.');
    expect(el.querySelector('[data-downloads]')).not.toBeNull();
  });

  it('sends a tenant user to their administrator, and asks Identity nothing', () => {
    const { el, api } = overview(false);
    expect(api.sandbox).not.toHaveBeenCalled();
    expect(el.querySelector('[data-sandbox-card]')!.textContent).toContain('Ask your workspace administrator for sandbox test keys.');
  });
});

describe('MIG-336: the API reference page', () => {
  function reference() {
    configure(true);
    const fixture = TestBed.createComponent(DeveloperReference);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('draws every operation by tag with its anchors, scopes, parameters and examples', () => {
    const { el } = reference();
    expect(el.querySelector('#tag-runs')).not.toBeNull();
    const start = el.querySelector('#op-startRun')!;
    expect(start.textContent).toContain('/v1/pipelines/{pipelineId}/runs');
    expect(start.querySelector('[data-access]')!.textContent).toContain('runs:write');
    expect(start.querySelector('[data-parameters]')!.textContent).toContain('Idempotency-Key');
    expect(start.querySelector('[data-request-body]')!.textContent).toContain('reference');
    expect(start.textContent).toContain('curl -X POST');
    expect(start.querySelector('[data-rate-limit-headers]')!.textContent).toContain('RateLimit-Policy');
    const signed = el.querySelector('#op-readFileContent')!;
    expect(signed.querySelector('[data-access]')!.textContent).toContain('No token: a signed link');
    expect(signed.querySelector('[data-rate-limit-headers]')).toBeNull();
    expect(el.querySelector('#schema-Run')).not.toBeNull();
    expect(el.querySelector('#event-run\\.completed')!.textContent).toContain('"type": "run.completed"');
    expect(el.querySelector('#problems')).not.toBeNull();
    expect(el.querySelector('[data-receiver]')!.textContent).toContain('Webhook-Signature');
  });

  it('filters the operations by path, summary or operationId', () => {
    const { fixture, page, el } = reference();
    page.filter.set('rotateWebhookSecret');
    fixture.detectChanges();
    expect([...el.querySelectorAll('[data-operation]')].map(o => o.getAttribute('data-operation'))).toEqual(['rotateWebhookSecret']);
    expect(el.textContent).toContain(`1 of ${page.total} operations match.`);
    page.filter.set('no such call at all');
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-operation]').length).toBe(0);
    expect(el.textContent).toContain('No operation matches');
  });
});

describe('MIG-336: a guide page', () => {
  const FIXTURES: Guide[] = [
    { slug: 'first', title: 'First', summary: 'The first.', markdown: '# First\n\nHello.\n\n```bash\na\n```\n```python\nb\n```' },
    { slug: 'second', title: 'Second', summary: '', markdown: '# Second\n\nAgain.' },
  ];
  const real = [...DOCS.guides];
  afterEach(() => DOCS.guides.splice(0, DOCS.guides.length, ...real));

  function guide(slug: string) {
    DOCS.guides.splice(0, DOCS.guides.length, ...FIXTURES);
    configure(true);
    const fixture = TestBed.createComponent(DeveloperGuide);
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws the guide under its title, without repeating it, with the next guide at the foot', () => {
    const el = guide('first');
    expect(el.querySelector('h1')!.textContent).toBe('First');
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('[data-code-group]')).not.toBeNull();
    expect(el.querySelector('[data-guide-previous]')).toBeNull();
    expect(el.querySelector('[data-guide-next]')!.getAttribute('href')).toBe('/integration/developer/guides/second');
    expect(guideTitle('first')).toBe('First');
  });

  it('links back from the last guide, and says so for a slug there is no guide for', () => {
    expect(guide('second').querySelector('[data-guide-previous]')!.getAttribute('href')).toBe('/integration/developer/guides/first');
    expect(guide('nope').querySelector('[data-guide-missing]')!.textContent).toContain('There is no guide called "nope".');
  });
});
