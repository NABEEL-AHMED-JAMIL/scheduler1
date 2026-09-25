import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Prompts } from './prompts';

/**
 * Arriving from Model connections ("N run on it") narrows the list to one connection. Nothing
 * on the toolbar said so -- only the count and a Clear button -- so the list looked short for
 * no reason. The filter now has a label the toolbar can show and remove.
 */
function screenAt(connection: string | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: [
        { promptId: 1, name: 'Summarise', connectionId: 4, connectionName: 'Claude · prod', variables: [] },
        { promptId: 2, name: 'Classify', connectionId: 5, connectionName: 'OpenAI', variables: [] },
      ] }) } },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: AuthService, useValue: { canManageAgents: () => true, isPlatformAdmin: () => false, user: signal({ appUserId: 1 }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => k === 'connection' ? connection : null } } } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Prompts());
  screen.ngOnInit();
  return screen;
}

describe('Prompts -- the connection filter says what it is', () => {
  it('names the connection the link narrowed to', () => {
    const screen = screenAt('4');
    expect(screen.filtered().map(p => p.promptId)).toEqual([1]);
    expect(screen.connectionFilterLabel()).toBe('Claude · prod');
  });

  it('falls back to the id for a connection no listed prompt names', () => {
    expect(screenAt('9').connectionFilterLabel()).toBe('Connection 9');
  });

  it('is nothing without the filter', () => {
    expect(screenAt(null).connectionFilterLabel()).toBe('');
  });
});
