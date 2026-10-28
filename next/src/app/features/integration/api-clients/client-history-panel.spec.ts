import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ClientHistoryPanel } from './client-history-panel';
import { ApiClientsApi } from './api-clients.api';

/** Owner #25: an API client's history -- each change, who and when, each field from what to what; never a secret. */
describe('ClientHistoryPanel', () => {
  it('lists the changes newest first with the fields that moved', () => {
    const history = vi.fn(() => of({ status: 'SUCCESS', data: [
      { id: 3, action: 'REVOKED', changes: {}, changedBy: 7, changedAt: '2026-10-19T18:00:00' },
      { id: 2, action: 'UPDATED', changes: { scopes: { from: ['runs:read'], to: ['runs:read', 'runs:write'] }, ipAllowlist: { from: [], to: ['203.0.113.0/24'] } },
        changedBy: 8, changedAt: '2026-10-19T17:00:00' },
    ] }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ClientHistoryPanel], providers: [
      { provide: ApiClientsApi, useValue: { history } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { client: { clientId: 'cl_x', name: 'Referral portal' }, sandbox: false, names: { 7: 'you' } } },
    ] });
    const fixture = TestBed.createComponent(ClientHistoryPanel);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
    expect(history).toHaveBeenCalledWith('cl_x', false, undefined);
    expect(text).toContain('Revoked');
    expect(text).toContain('· you');
    expect(text).toContain('person #8');
    const tight = text.replace(/\s+/g, '');
    expect(tight).toContain('Scopes:runs:read→runs:read,runs:write');
    expect(tight).toContain('IPallowlist:none→203.0.113.0/24');
  });
});

describe('ClientHistoryPanel -- loading, empty, error (owner 2026-10-27)', () => {
  function panel(answer: () => Observable<unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: ApiClientsApi, useValue: { history: vi.fn(answer) } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { client: { clientId: 'cl_x', name: 'Referral portal' }, sandbox: false, names: {} } },
    ] });
    return TestBed.runInInjectionContext(() => new ClientHistoryPanel());
  }

  it('is loading until the history answers', () => {
    const p = panel(() => NEVER);
    expect(p.loading()).toBe(true);
    expect(p.state.pending()).toBe(true);
  });

  it('is empty once an empty history answers', () => {
    const p = panel(() => of({ status: 'SUCCESS', data: [] }));
    expect(p.state.pending()).toBe(false);
    expect(p.rows()).toEqual([]);
  });

  it('says the history could not be read, in plain words', () => {
    const p = panel(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(p.loading()).toBe(false);
    expect(p.error()).toBe('The history could not be read.');
  });
});
