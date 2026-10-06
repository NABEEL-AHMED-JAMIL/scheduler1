import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { NotifyDialog } from './notify-dialog';
import { NOTIFY_OPTIONS } from './notify-summary';
import { ToastService } from '../../shared/ui/toast.service';

/**
 * The row's email dialog said "When it completes / fails / a run is skipped" while the edit form
 * said "The job completes / fails / A run is skipped" -- and notify-summary.ts records that the
 * wording should be the edit form's (UI audit, Low). One label set, used by both.
 */
describe('email notification labels', () => {
  it('are the edit form\'s wording', () => {
    expect(NOTIFY_OPTIONS.map(o => [o.control, o.label])).toEqual([
      ['completeJob', 'The job completes'],
      ['failJob', 'The job fails'],
      ['skipJob', 'A run is skipped'],
    ]);
  });

  it('are what the row dialog offers', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: DialogRef, useValue: { close: () => {} } },
      { provide: DIALOG_DATA, useValue: { jobId: 1, jobName: 'x' } },
      { provide: HttpClient, useValue: {} },
      { provide: ToastService, useValue: {} },
    ] });
    const dialog = TestBed.runInInjectionContext(() => new NotifyDialog());
    expect(dialog.options.map(o => [o.key, o.label])).toEqual(NOTIFY_OPTIONS.map(o => [o.control, o.label]));
  });
});
