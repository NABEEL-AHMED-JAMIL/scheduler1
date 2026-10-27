import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { TaskInbox } from './task-inbox';
import { TaskCountService } from './task-count.service';
import { WorkflowsApi } from './workflows.api';

/**
 * ZT-S2: a person who makes requests starts one from My requests > New request -- a workflow they may start, a title and
 * what it is about -- through the task inbox, without the workflow designer's page.
 */
function screen() {
  const api = {
    mine: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    teams: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    done: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    requests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    request: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { id: 2101, title: 'Close October', state: 'Running', history: [], tasks: [] } })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
    startable: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [
      { key: 'month-end-close', name: 'Month-end close', currentVersion: 1 }, { key: 'write-off', name: 'Write-off', currentVersion: 2 }] })),
    newRequest: vi.fn(() => of({ status: 'SUCCESS', message: 'Started: Close October.', data: { id: 2101 } })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: WorkflowsApi, useValue: api },
      { provide: ToastService, useValue: toast },
      { provide: TaskCountService, useValue: { refresh: vi.fn(), count: signal(0), overdue: signal(0), mine: signal(0), teams: signal(0), done: signal(0), requests: signal(0) } },
      // A member: the inbox and My requests, not the workflow designer.
      { provide: AuthService, useValue: { canOpen: (k: string) => k !== 'workflow-designer', canOpenTab: () => true, user: signal({ appUserId: 1055, tenantId: 1013 }) } },
    ],
  });
  const fixture = TestBed.createComponent(TaskInbox);
  fixture.detectChanges();
  return { api, toast, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('My requests > New request (ZT-S2)', () => {
  it('offers New request on My requests to a member without the designer, and lists the workflows they may start', () => {
    const { api, fixture, screen: s, el } = screen();
    expect(el.querySelector('[data-test="new-request"]')).toBeNull();
    s.pick('requests');
    fixture.detectChanges();
    const button = el.querySelector('[data-test="new-request"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    fixture.detectChanges();
    expect(api.startable).toHaveBeenCalled();
    const options = Array.from(el.querySelectorAll('[data-test="new-request-workflow"] option')).map(o => o.textContent?.trim());
    expect(options).toEqual(['Month-end close', 'Write-off']);
  });

  it('starts the request with its title and fields (numbers as numbers), then opens it', () => {
    const { api, toast, fixture, screen: s } = screen();
    s.pick('requests');
    s.openNew();
    fixture.detectChanges();
    s.newKey.set('write-off');
    s.newTitle.set('Write off G-004');
    s.setNewField(0, 'name', 'amount');
    s.setNewField(0, 'value', '1250.50');
    s.addNewField();
    s.setNewField(1, 'name', 'guarantor');
    s.setNewField(1, 'value', 'G-004');
    s.submitNew();
    expect(api.newRequest).toHaveBeenCalledWith({ definitionKey: 'write-off', title: 'Write off G-004', subject: { amount: 1250.5, guarantor: 'G-004' } },
      expect.stringMatching(/^new-request-/));
    expect(toast.success).toHaveBeenCalledWith('Started: Close October.');
    expect(s.newOpen()).toBe(false);
    expect(api.request).toHaveBeenCalledWith(2101);
  });

  it('says so when there is no workflow to start', () => {
    const { api, fixture, screen: s, el } = screen();
    api.startable.mockReturnValueOnce(of({ status: 'SUCCESS', message: '', data: [] }));
    s.pick('requests');
    s.openNew();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="new-request-none"]')).not.toBeNull();
  });
});
