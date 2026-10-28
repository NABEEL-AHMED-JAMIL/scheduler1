import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Prompts } from './prompts';

/**
 * Arriving from Model connections ("N run on it") narrows the list to one connection. Nothing
 * on the toolbar said so -- only the count and a Clear button -- so the list looked short for
 * no reason. The filter now has a label the toolbar can show and remove.
 */
const LISTED = () => of({ status: 'SUCCESS', message: '', data: [
  { promptId: 1, name: 'Summarise', connectionId: 4, connectionName: 'Claude · prod', variables: [], runCount: 3, status: 'Active' },
  { promptId: 2, name: 'Classify', connectionId: 5, connectionName: 'OpenAI', variables: [], runCount: 12, status: 'Inactive' },
] });

function screenAt(connection: string | null, answer: () => Observable<unknown> = LISTED) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: answer } },
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

describe('Prompts -- sorting (owner 2026-10-27)', () => {
  it('keeps the API order until a heading is picked, then sorts by it both ways', () => {
    const screen = screenAt(null);
    expect(screen.sorted().map(p => p.name)).toEqual(['Summarise', 'Classify']);
    screen.sort.toggle('name');
    expect(screen.sorted().map(p => p.name)).toEqual(['Classify', 'Summarise']);
    screen.sort.toggle('name');
    expect(screen.sorted().map(p => p.name)).toEqual(['Summarise', 'Classify']);
  });

  it('sorts the run counts as numbers, the most first', () => {
    const screen = screenAt(null);
    screen.sort.toggle('runs');
    expect(screen.sorted().map(p => p.runCount)).toEqual([12, 3]);
  });
});

describe('Prompts -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, not empty, until the list answers', () => {
    const screen = screenAt(null, () => NEVER);
    expect(screen.loading()).toBe(true);
    expect(screen.state.pending()).toBe(true);
    expect(screen.error()).toBe('');
  });

  it('is empty once an empty list answers', () => {
    const screen = screenAt(null, () => of({ status: 'SUCCESS', message: '', data: [] }));
    expect(screen.loading()).toBe(false);
    expect(screen.state.pending()).toBe(false);
    expect(screen.sorted()).toEqual([]);
  });

  it('says the list could not be read, in plain words, when the read fails', () => {
    const screen = screenAt(null, () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    expect(screen.loading()).toBe(false);
    expect(screen.error()).toBe('The prompts could not be read.');
  });
});
