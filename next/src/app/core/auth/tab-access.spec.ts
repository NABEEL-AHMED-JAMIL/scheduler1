import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { accessManagerGuard, pageGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AccessDelegation } from './access-delegation';
import { NavViewer, passes } from '../nav/nav-tree';

/** F3 (MIG-400): a page's tabs granted apart, and the access delegate's Page access. */

/** AuthService.canOpenTab's rule over a key list, as identity sends it (page keys, then a restricted page's tab keys). */
function service(keys: string[] | null, admin = false): AuthService {
  const auth = Object.create(AuthService.prototype) as AuthService;
  (auth as any).hasAtLeast = (role: string) => admin && role !== 'PLATFORM_ADMIN';
  (auth as any).currentUser = () => (keys === null ? { pageKeys: null } : { pageKeys: keys });
  return auth;
}

describe('canOpenTab', () => {
  it('opens every tab of a page held with none of its tab keys, as before tabs', () => {
    const auth = service(['sources', 'queue']);
    expect(auth.canOpenTab('sources', 'sources:contracts')).toBe(true);
    expect(auth.canOpenTab('sources', 'sources:databases')).toBe(true);
  });

  it('opens only the named tabs of a restricted page, and nothing of a page not held', () => {
    const auth = service(['sources', 'sources:contracts']);
    expect(auth.canOpenTab('sources', 'sources:contracts')).toBe(true);
    expect(auth.canOpenTab('sources', 'sources:databases')).toBe(false);
    expect(auth.canOpenTab('queue', 'queue:failed')).toBe(false);
  });

  it('opens everything to an administrator and to a session with no list', () => {
    expect(service(['sources:contracts'], true).canOpenTab('sources', 'sources:databases')).toBe(true);
    expect(service(null).canOpenTab('queue', 'queue:failed')).toBe(true);
  });
});

describe('the menu and the guard', () => {
  const viewer = (keys: string[], delegate = false): NavViewer => {
    const auth = service(keys);
    return { canOpen: k => auth.canOpen(k), canOpenTab: (p, t) => auth.canOpenTab(p, t), isAdmin: false, isPlatform: false, showTeam: false,
      isDelegate: delegate };
  };

  it('shows a tab the person may open and hides its closed sibling', () => {
    const v = viewer(['jobs', 'jobs:schedules']);
    expect(passes({ pageKey: 'jobs', tabKey: 'jobs:schedules' }, v)).toBe(true);
    expect(passes({ pageKey: 'jobs', tabKey: 'jobs:backfills' }, v)).toBe(false);
  });

  it('offers Page access to an access delegate and to no other member', () => {
    const gate = { adminOnly: true, delegateOk: true };
    expect(passes(gate, viewer([], true))).toBe(true);
    expect(passes(gate, viewer([], false))).toBe(false);
    expect(passes({ adminOnly: true }, viewer([], true))).toBe(false);
  });

  function guard(fn: any, keys: string[], data: any, delegation: unknown = null, admin = false) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: service(keys, admin) },
        { provide: AccessDelegation, useValue: { load: vi.fn(() => of(delegation)) } },
        { provide: Router, useValue: { createUrlTree: (c: any[], q?: any) => ({ toString: () => c.join('/') + (q?.queryParams?.page ? '?' + q.queryParams.page : '') }) as UrlTree } },
      ],
    });
    return TestBed.runInInjectionContext(() => fn({ data, url: [], routeConfig: { title: 'Backfills' } } as any, {} as any));
  }

  it('refuses a closed tab\'s route and lets an open one through', () => {
    expect(String(guard(pageGuard, ['jobs', 'jobs:schedules'], { pageKey: 'jobs', tabKey: 'jobs:backfills' }))).toContain('/unauthorized');
    expect(guard(pageGuard, ['jobs', 'jobs:schedules'], { pageKey: 'jobs', tabKey: 'jobs:schedules' })).toBe(true);
    expect(guard(pageGuard, ['jobs'], { pageKey: 'jobs', tabKey: 'jobs:backfills' })).toBe(true);
  });

  it('lets an administrator or an access delegate onto Page access, and sends any other member away', () => {
    expect(guard(accessManagerGuard, [], {}, null, true)).toBe(true);
    let seen: unknown;
    guard(accessManagerGuard, [], {}, { delegateId: 1 }).subscribe((r: unknown) => (seen = r));
    expect(seen).toBe(true);
    guard(accessManagerGuard, [], {}, null).subscribe((r: unknown) => (seen = r));
    expect(String(seen)).toBe('/unauthorized');
  });
});
