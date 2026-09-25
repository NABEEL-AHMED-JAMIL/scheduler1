import { describe, it, expect, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Connections } from './connections';
import { ModelConnection } from '../ai-providers';

/**
 * Kafka (?profileId=) and the configuration screens keep the selection in the address, so a
 * connection can be linked to and survives a reload. Model connections did not: every reload
 * landed back on the default.
 */
const ROWS: ModelConnection[] = [
  { connectionId: 1, name: 'Default', provider: 'OpenAI', defaultModel: 'gpt', isDefault: true, status: 'Active' } as ModelConnection,
  { connectionId: 2, name: 'Claude', provider: 'Anthropic', defaultModel: 'claude', status: 'Active' } as ModelConnection,
];

function screenAt(connection: string | null) {
  const navigate = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: ROWS }) } },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, user: signal({ appUserId: 1 }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => k === 'connection' ? connection : null } } } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Connections());
  screen.ngOnInit();
  TestBed.tick();
  return { screen, navigate };
}

describe('Model connections -- the selection lives in the address', () => {
  it('opens on the connection the link names', () => {
    const { screen } = screenAt('2');
    expect(screen.selectedId()).toBe(2);
  });

  it('falls back to the default when the link names nothing it knows', () => {
    const { screen } = screenAt('99');
    expect(screen.selectedId()).toBe(1);
  });

  it('writes the picked connection to ?connection=', () => {
    const { screen, navigate } = screenAt(null);
    screen.select(ROWS[1]);
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { connection: 2 }, queryParamsHandling: 'merge', replaceUrl: true,
    }));
  });
});
