import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { TenantRequests } from './tenant-requests';

/**
 * Owner 2026-10-27: Workspace requests sort with the shared column sort (newest first as before, Status by urgency)
 * and the tiles wait for the list instead of showing 0 waiting while it loads.
 */
const REQUESTS = [
  { tenantRequestId: 1, organisationName: 'Cedar Clinic', contactName: 'Bo', contactEmail: 'bo@cedar.test', status: 'Approved', dateCreated: '2026-10-20 09:00:00' },
  { tenantRequestId: 2, organisationName: 'Aspen Care', contactName: 'Al', contactEmail: 'al@aspen.test', status: 'Pending', dateCreated: '2026-10-26 09:00:00' },
  { tenantRequestId: 3, organisationName: 'Birch Health', contactName: 'Cy', contactEmail: 'cy@birch.test', status: 'Rejected', dateCreated: '2026-10-22 09:00:00' },
];

function screen(answer: () => Observable<unknown> = () => of({ status: 'SUCCESS', message: '', data: REQUESTS })) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: vi.fn(answer), post: vi.fn() } },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new TenantRequests());
  page.ngOnInit();
  return page;
}

describe('Workspace requests -- sorting (owner 2026-10-27)', () => {
  it('opens newest first, as it did', () => {
    expect(screen().sorted().map(r => r.tenantRequestId)).toEqual([2, 3, 1]);
  });

  it('sorts by organisation both ways', () => {
    const page = screen();
    page.sort.toggle('organisationName');
    expect(page.sorted().map(r => r.organisationName)).toEqual(['Aspen Care', 'Birch Health', 'Cedar Clinic']);
    page.sort.toggle('organisationName');
    expect(page.sorted().map(r => r.organisationName)).toEqual(['Cedar Clinic', 'Birch Health', 'Aspen Care']);
  });

  it('sorts Status by urgency, waiting first', () => {
    const page = screen();
    page.sort.toggle('status');
    expect(page.sorted().map(r => r.status)).toEqual(['Pending', 'Approved', 'Rejected']);
  });

  it('pages the sorted rows', () => {
    const page = screen();
    page.sort.toggle('organisationName');
    expect(page.paged().map(r => r.tenantRequestId)).toEqual([2, 3, 1]);
  });
});

describe('Workspace requests -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, not "0 waiting", until the list answers', () => {
    const page = screen(() => NEVER);
    expect(page.loading()).toBe(true);
    expect(page.state.pending()).toBe(true);
  });

  it('is empty once an empty list answers', () => {
    const page = screen(() => of({ status: 'SUCCESS', message: '', data: [] }));
    expect(page.state.pending()).toBe(false);
    expect(page.summary().total).toBe(0);
  });

  it('says the list could not be read, in plain words', () => {
    const page = screen(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    expect(page.loading()).toBe(false);
    expect(page.error()).toBe('The workspace requests could not be read.');
  });
});
