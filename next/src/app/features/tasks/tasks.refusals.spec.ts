import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Tasks } from './tasks';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';

/** The Tasks screen with every write refused (status ERROR, no message) and the confirm saying yes. */
function tasksRefusing(linkedAnswer: unknown = { status: 'ERROR', message: '' }) {
  const errors: unknown[] = [];
  const refusal = { status: 'ERROR', message: '' };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: {
        get: () => of({ status: 'SUCCESS', data: { taskName: 'Hurricanes ETL' } }),
        post: (url: string) => url.includes('fetchAllLinkJobsWithSourceTaskId') ? of(linkedAnswer) : of(refusal),
        put: () => of(refusal),
      } },
      { provide: ToastService, useValue: { success: vi.fn(), error: (m: unknown) => errors.push(m), info: vi.fn() } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: AuthService, useValue: { user: () => null, canManageTasks: () => true } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new Tasks());
  return { component, errors };
}

const TASK = { taskDetailId: 7714, taskName: 'Hurricanes ETL', taskStatus: 'Active', totalLinksJobs: 0 } as any;

describe('Tasks: refusals', () => {
  /** An empty message was toasted as-is: an empty red box (UI audit, A.5 §8). */
  it('says something when a Duplicate is refused without a message', () => {
    const { component, errors } = tasksRefusing();
    component.clone(TASK);
    expect(errors[0]).toBeTruthy();
  });

  it('says something when a Delete is refused without a message', async () => {
    const { component, errors } = tasksRefusing();
    await component.remove(TASK);
    expect(errors[0]).toBeTruthy();
  });

  /**
   * A refused read of "Jobs using this task" cleared the spinner and stored nothing, so the
   * drawer showed the heading over a blank. It now stores the empty list, which the template
   * reads as "Could not read the jobs for this task." -- as the HTTP-error branch already did.
   */
  it('settles the linked-jobs drawer when the read is refused', () => {
    const { component } = tasksRefusing();
    component.toggleRow({ ...TASK, totalLinksJobs: 2 });
    expect(component.linkedLoading()).toBeNull();
    expect(component.linkedJobs()[7714]).toEqual([]);
  });
});
