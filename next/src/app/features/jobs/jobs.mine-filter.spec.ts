import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { Subject, of } from 'rxjs';
import { Jobs } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * A tenant user is sent their own jobs only (JobOwnership, owner decision 2026-09-24), so the list
 * offers "Only mine" to the people whose list holds other people's jobs: the admins.
 */
function jobsAs(isTenantAdmin: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: [] }), post: () => of({ status: 'SUCCESS', data: [] }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: signal(null), isTenantAdmin: signal(isTenantAdmin), canManageTasks: signal(isTenantAdmin) } },
      { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Jobs()) as unknown as { seesOthersJobs(): boolean };
}

describe('Jobs "Only mine"', () => {
  it('is offered to an admin, whose list holds everyone\'s jobs', () => {
    expect(jobsAs(true).seesOthersJobs()).toBe(true);
  });

  it('is not offered to a tenant user, whose list is already their own', () => {
    expect(jobsAs(false).seesOthersJobs()).toBe(false);
  });
});
