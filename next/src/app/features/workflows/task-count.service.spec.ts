import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { UnreadCountService } from '../../core/notifications/unread-count.service';
import { TaskCountService } from './task-count.service';
import { WorkflowsApi } from './workflows.api';

/** The Task inbox badge: read for a member of a workspace; never asked for by a platform administrator outside one. */
function make(user: unknown) {
  const api = { count: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { total: 4, overdue: 1 } })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: WorkflowsApi, useValue: api },
      { provide: AuthService, useValue: { user: signal(user), canOpen: () => true } },
      { provide: UnreadCountService, useValue: { count: signal(0) } },
    ],
  });
  return { api, service: TestBed.inject(TaskCountService) };
}

describe('Task count', () => {
  it('counts a workspace member\'s open tasks', () => {
    const { api, service } = make({ appUserId: 4537, tenantId: 2924 });
    service.refresh();
    expect(api.count).toHaveBeenCalled();
    expect(service.count()).toBe(4);
    expect(service.overdue()).toBe(1);
  });

  it('asks nothing for a platform administrator with no workspace (it answered 400 on every page)', () => {
    const { api, service } = make({ appUserId: 1000, role: 'PLATFORM_ADMIN' });
    service.refresh();
    expect(api.count).not.toHaveBeenCalled();
    expect(service.count()).toBe(0);
  });
});
