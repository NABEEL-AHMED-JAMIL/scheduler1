import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { AccountSecurityApi, SignInFilter } from './account-security.api';
import { SignInHistory } from './sign-in-history';

/**
 * Owner 2026-10-27 ("add a sort on each table"): the sign-in history is sorted by Identity, so a column heading sends
 * sort/dir, reads from the first page again, and "Load older" goes on in that order. Newest first is the service's own
 * order: no sort is sent for it, before a choice or after going back to it.
 */
const ok = (data: unknown) => of({ status: 'SUCCESS', message: '', data });
const page = (ids: number[], total = 3) => ok({
  items: ids.map(id => ({ id, outcome: 'SUCCESS', method: 'PASSWORD', at: '2026-10-27 08:00:00', username: `p${id}@x.example` })),
  total, limit: 50, offset: 0,
});

function history(answer: (filter: SignInFilter) => Observable<unknown>) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  const calls: SignInFilter[] = [];
  const read = vi.fn((filter: SignInFilter) => { calls.push(filter); return answer(filter); });
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: AccountSecurityApi, useValue: { myHistory: read, workspaceHistory: read } },
    ],
  });
  const h = TestBed.runInInjectionContext(() => new SignInHistory());
  h.ngOnInit();
  return { h, calls };
}

describe('Sign-in history -- sorted on the server (owner 2026-10-27)', () => {
  it('sends no sort before a choice: newest first is the service\'s own order', () => {
    const { h, calls } = history(() => page([3, 2]));
    expect(calls).toHaveLength(1);
    expect(calls[0].sort).toBeUndefined();
    expect(calls[0].dir).toBeUndefined();
    expect(calls[0].offset).toBe(0);
    expect(h.sort.ariaSort('at')).toBe('descending');
  });

  it('a heading sends its column and direction, and reads from the first page again', () => {
    const { h, calls } = history(f => (f.sort ? page([1, 2]) : page([3, 2])));
    h.sort.toggle('outcome');
    expect(calls.at(-1)).toMatchObject({ sort: 'outcome', dir: 'asc', offset: 0, limit: 50 });
    expect(h.rows().map(r => r.id)).toEqual([1, 2]);
    h.sort.toggle('outcome');
    expect(calls.at(-1)).toMatchObject({ sort: 'outcome', dir: 'desc', offset: 0 });
    h.sort.toggle('ip');
    expect(calls.at(-1)).toMatchObject({ sort: 'ip', dir: 'asc', offset: 0 });
  });

  it('When flips to oldest first, and back to newest first sends no sort again', () => {
    const { h, calls } = history(() => page([3, 2]));
    h.sort.toggle('at');
    expect(calls.at(-1)).toMatchObject({ sort: 'at', dir: 'asc', offset: 0 });
    h.sort.toggle('at');
    expect(calls.at(-1)?.sort).toBeUndefined();
    expect(h.sort.ariaSort('at')).toBe('descending');
  });

  it('Load older goes on in the order picked, from the rows already shown', () => {
    const { h, calls } = history(f => (f.offset ? page([3]) : page([1, 2])));
    h.sort.toggle('username');
    h.loadOlder();
    expect(calls.at(-1)).toMatchObject({ sort: 'username', dir: 'asc', offset: 2 });
    expect(h.rows().map(r => r.id)).toEqual([1, 2, 3]);
    expect(h.hasMore()).toBe(false);
  });

  it('keeps the filters with the sort', () => {
    const { h, calls } = history(() => page([1]));
    h.setOutcome('FAILURE');
    h.sort.toggle('method');
    expect(calls.at(-1)).toMatchObject({ outcome: 'FAILURE', sort: 'method', dir: 'asc', offset: 0 });
  });

  it('a reply for the order before is dropped when a newer one was asked for', () => {
    const answers: ((v: unknown) => void)[] = [];
    const { h } = history(() => new Observable(sub => { answers.push(v => { sub.next(v); sub.complete(); }); }));
    h.sort.toggle('outcome');
    // The second read (outcome) answers first, then the first (newest first) answers late.
    answers[1]({ status: 'SUCCESS', message: '', data: { items: [{ id: 9, outcome: 'FAILURE', method: 'MFA', at: '' }], total: 1, limit: 50, offset: 0 } });
    answers[0]({ status: 'SUCCESS', message: '', data: { items: [{ id: 1, outcome: 'SUCCESS', method: 'MFA', at: '' }], total: 1, limit: 50, offset: 0 } });
    expect(h.rows().map(r => r.id)).toEqual([9]);
  });
});
