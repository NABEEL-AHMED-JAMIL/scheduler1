import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { MANAGED_WRITE_REFUSAL } from './auth.models';
import { ToastService } from '../../shared/ui/toast.service';

function send(status: number, message: string): { toasts: string[]; failed: unknown } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { accessToken: 't' } }] });
  let failed: unknown = null;
  const next = (req: HttpRequest<unknown>) =>
    throwError(() => new HttpErrorResponse({ status, url: req.url, error: { status: 'ERROR', message } }));
  TestBed.runInInjectionContext(() => authInterceptor(new HttpRequest('POST', '/api/v1/sourceTask.json/addSourceTask', {}), next as any))
    .subscribe({ error: e => { failed = e; } });
  return { toasts: TestBed.inject(ToastService).toasts().map(t => t.message), failed };
}

describe('MIG-254: a builder write refused because the workspace is managed', () => {
  it('shows the server\'s words, whatever the screen does with the error', () => {
    const { toasts, failed } = send(403, MANAGED_WRITE_REFUSAL);
    expect(toasts).toEqual([MANAGED_WRITE_REFUSAL]);
    // Still an error for the screen that made the call: its own handling runs as before.
    expect((failed as HttpErrorResponse).status).toBe(403);
  });

  it('leaves any other 403 to the screen', () => {
    expect(send(403, 'Access denied').toasts).toEqual([]);
  });
});
