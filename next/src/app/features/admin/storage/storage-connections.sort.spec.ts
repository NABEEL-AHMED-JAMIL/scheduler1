import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { StorageConnections } from './storage-connections';

/** Owner 2026-10-27: every column sorts (before the pager), and the tiles never read 0 before the list answers. */
const ROWS = [
  { storageConnectionId: 1, connectionName: 'Gamma', alias: 'g', provider: 'S3', status: 'Active', connectionStatus: 'SUCCESS', secretKeyConfigured: true },
  { storageConnectionId: 2, connectionName: 'alpha', alias: 'a', provider: 'FTP', status: 'Inactive', connectionStatus: 'FAILED' },
  { storageConnectionId: 3, connectionName: 'Beta', alias: 'b', provider: 'AZURE', status: 'Active' },
];

function screen(answer: () => Observable<unknown> = () => of({ status: 'SUCCESS', message: '', data: ROWS })) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: answer } },
    { provide: Dialog, useValue: {} },
    { provide: AuthService, useValue: { user: () => ({ appUserId: 1 }), isPlatformAdmin: () => false } },
  ] });
  const page = TestBed.runInInjectionContext(() => new StorageConnections());
  page.load();
  return page;
}

describe('Storage connections -- sorting', () => {
  it('keeps the server order until a heading is picked, then sorts by name both ways (case does not matter)', () => {
    const page = screen();
    expect(page.paged().map(c => c.storageConnectionId)).toEqual([1, 2, 3]);
    page.sort.toggle('name');
    expect(page.paged().map(c => c.connectionName)).toEqual(['alpha', 'Beta', 'Gamma']);
    page.sort.toggle('name');
    expect(page.paged().map(c => c.connectionName)).toEqual(['Gamma', 'Beta', 'alpha']);
  });

  it('sorts before the pager cuts a page', () => {
    const page = screen();
    page.setPageSize(2);
    page.sort.toggle('name');
    expect(page.paged().map(c => c.connectionName)).toEqual(['alpha', 'Beta']);
  });
});

describe('Storage connections -- loading, empty, error', () => {
  it('is loading, with the tiles as placeholders, until the list answers', () => {
    const page = screen(() => NEVER);
    expect(page.loading()).toBe(true);
    expect(page.loaded()).toBe(false);
    expect(page.error()).toBe('');
  });

  it('is empty once an empty list answers', () => {
    const page = screen(() => of({ status: 'SUCCESS', message: '', data: [] }));
    expect(page.loading()).toBe(false);
    expect(page.loaded()).toBe(true);
    expect(page.filtered()).toEqual([]);
  });

  it('says the list could not be read, in plain words', () => {
    const page = screen(() => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    expect(page.loading()).toBe(false);
    expect(page.loaded()).toBe(false);
    expect(page.error()).toBe('Could not load connections.');
  });
});
