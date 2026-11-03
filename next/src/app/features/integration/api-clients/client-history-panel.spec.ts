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
      { provide: ApiClientsApi, useValue: { history, sensitiveAccess: vi.fn(() => of({ status: 'SUCCESS', data: [] })) } },
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
      { provide: ApiClientsApi, useValue: { history: vi.fn(answer), sensitiveAccess: vi.fn(() => of({ status: 'SUCCESS', data: [] })) } },
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

/** MIG-456: a grant and a revoke read as words with their reason, and the client's sensitive file downloads are listed. */
describe('ClientHistoryPanel -- files:sensitive', () => {
  function render(sandbox: boolean, tenantId?: number) {
    const history = vi.fn(() => of({ status: 'SUCCESS', data: [
      { id: 5, action: 'SENSITIVE_FILES_GRANTED', changes: { sensitiveFilesReason: { from: null, to: 'The portal shows signed reports' } },
        changedBy: 7, changedAt: '2026-11-03T12:00:00' },
    ] }));
    const sensitiveAccess = vi.fn(() => of({ status: 'SUCCESS', data: [
      { action: 'download', fileId: '01JMADE0000000000000000000', runId: 9100, fileName: 'signed.pdf', outcome: 'served', status: 200,
        reason: 'files:sensitive', at: '2026-11-03T12:05:00' },
      { action: 'download', fileId: '01JMADE0000000000000000000', runId: 9100, fileName: 'signed.pdf', outcome: 'refused', status: 403,
        reason: 'files:sensitive not held', at: '2026-11-03T12:06:00' },
    ] }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ClientHistoryPanel], providers: [
      { provide: ApiClientsApi, useValue: { history, sensitiveAccess } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { client: { clientId: 'cl_x', name: 'Referral portal' }, sandbox, names: { 7: 'you' }, tenantId } },
    ] });
    const fixture = TestBed.createComponent(ClientHistoryPanel);
    fixture.detectChanges();
    return { text: (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' '), sensitiveAccess };
  }

  it('says who allowed sensitive files and why, and lists each download, served or refused', () => {
    const { text, sensitiveAccess } = render(false);
    expect(text).toContain('Sensitive files allowed');
    expect(text.replace(/\s+/g, '')).toContain('Whysensitivefiles:none→Theportalshowssignedreports');
    expect(sensitiveAccess).toHaveBeenCalledWith('cl_x');
    expect(text).toContain('Sensitive file downloads');
    const tight = text.replace(/\s+/g, '');
    expect(tight).toContain('Downloadedsigned.pdf·run#9100');
    expect(tight).toContain('Refusedsigned.pdf');
    expect(text).toContain('the client did not hold files:sensitive');
  });

  it('reads no downloads for a sandbox test key or a platform administrator outside the workspace', () => {
    expect(render(true).sensitiveAccess).not.toHaveBeenCalled();
    expect(render(false, 1006).sensitiveAccess).not.toHaveBeenCalled();
  });
});
