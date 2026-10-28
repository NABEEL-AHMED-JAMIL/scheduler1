import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { Tenants } from './tenants';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BillingApi } from '../../billing/billing.service';

/**
 * Owner 2026-10-27: Platform > Workspaces on the shared column sort (by name A to Z until a heading is picked, as before)
 * and tiles that wait for the answer instead of reading 0 and $0.00.
 */
const ROWS = [
  { tenantId: 1, tenantName: 'riverside', tenantCode: 'r', status: 'Active', userCount: 3, sourceTaskCount: 2, sourceJobCount: 1 },
  { tenantId: 2, tenantName: 'Acme', tenantCode: 'a', status: 'Suspended', userCount: 10, sourceTaskCount: 0, sourceJobCount: 0 },
  { tenantId: 3, tenantName: 'Meridian', tenantCode: 'm', status: 'Active', userCount: 1, sourceTaskCount: 5, sourceJobCount: 3 },
];

function screen(list: () => Observable<unknown> = () => of({ status: 'SUCCESS', data: ROWS }),
                figures: () => Observable<unknown> = () => of({ status: 'SUCCESS', data: { month: '2026-10', workspaces: [] } })) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: (url: string) => (url.includes('listTenants') ? list() : of({ status: 'SUCCESS', data: [] })) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: () => ({ appUserId: 1 }), isPlatformAdmin: () => true, isManagedSession: () => false } },
      { provide: BillingApi, useValue: { workspaceFigures: figures } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new Tenants());
  page.ngOnInit();
  return page;
}

describe('Workspaces -- sorting', () => {
  it('starts by name A to Z, then sorts by users both ways', () => {
    const page = screen();
    expect(page.paged().map(t => t.tenantName)).toEqual(['Acme', 'Meridian', 'riverside']);
    page.sort.toggle('userCount');
    expect(page.paged().map(t => t.userCount)).toEqual([10, 3, 1]);
    page.sort.toggle('userCount');
    expect(page.paged().map(t => t.userCount)).toEqual([1, 3, 10]);
  });

  it('flips the cards\' order with the direction button, whichever way it sorts', () => {
    const page = screen();
    page.sort.toggle('userCount');
    page.flipSort();
    expect(page.sort.key()).toBe('userCount');
    expect(page.sort.direction()).toBe('asc');
    page.flipSort();
    expect(page.sort.key()).toBe('userCount');
    expect(page.sort.direction()).toBe('desc');
  });
});

describe('Workspaces -- loading, empty, error', () => {
  it('is loading, with tile placeholders (no $0.00), until the list and billing answer', () => {
    const page = screen(() => NEVER, () => NEVER);
    expect(page.loading()).toBe(true);
    expect(page.tilesLoading()).toBe(true);
    expect(page.figuresLoading()).toBe(true);
  });

  it('is empty once an empty list answers', () => {
    const page = screen(() => of({ status: 'SUCCESS', data: [] }));
    expect(page.loading()).toBe(false);
    expect(page.tilesLoading()).toBe(false);
    expect(page.paged()).toEqual([]);
  });

  it('says the list could not be read, in plain words, and the tiles are not available', () => {
    const page = screen(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    expect(page.loading()).toBe(false);
    expect(page.error()).toBe('Tenants could not be loaded.');
    expect(page.tilesFailed()).toBe(true);
  });
});
