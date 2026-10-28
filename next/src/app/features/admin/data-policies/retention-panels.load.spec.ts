import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { RetentionApi } from './retention.api';
import { RetentionPlatformPanel } from './retention-platform-panel';
import { RetentionHistoryPanel } from './retention-history-panel';
import { RetentionHoldPanel } from './retention-hold-panel';

/**
 * Owner 2026-10-27 ("data load show blank page some place so i need a loader on each component"): the retention side
 * panels say they are loading, say when a read failed (and can try again), and never spin for ever.
 */
function withApi<T>(api: Partial<Record<keyof RetentionApi, () => Observable<unknown>>>, make: () => T): T {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: RetentionApi, useValue: api },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { tenantId: null } },
    ],
  });
  return TestBed.runInInjectionContext(make);
}
const FAILED = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

describe('Platform minimums panel -- loading, error', () => {
  it('is loading, with no error, until the minimums answer', () => {
    const panel = withApi({ platform: () => NEVER }, () => new RetentionPlatformPanel());
    panel.ngOnInit();
    expect(panel.loaded()).toBe(false);
    expect(panel.loadError()).toBe('');
  });

  it('says a failed read in plain words instead of spinning, and reads again on Try again', () => {
    let answer: () => Observable<unknown> = FAILED;
    const panel = withApi({ platform: () => answer() }, () => new RetentionPlatformPanel());
    panel.ngOnInit();
    expect(panel.loadError()).toBe('The platform minimums could not be read.');
    expect(panel.loaded()).toBe(false);
    answer = () => of({ status: 'SUCCESS', message: '', data: { auditFloorDays: 2190, maxSharePct: 20 } });
    panel.load();
    expect(panel.loadError()).toBe('');
    expect(panel.loaded()).toBe(true);
    expect(panel.floor()).toBe('2190');
  });
});

describe('Retention history panel -- loading, empty, error', () => {
  it('is loading until both reads answer', () => {
    const panel = withApi({ passes: () => NEVER, audit: () => NEVER }, () => new RetentionHistoryPanel());
    panel.ngOnInit();
    expect(panel.loaded()).toBe(false);
    expect(panel.error()).toBe('');
  });

  it('is empty once both answer with nothing', () => {
    const empty = () => of({ status: 'SUCCESS', message: '', data: [] });
    const panel = withApi({ passes: empty, audit: empty }, () => new RetentionHistoryPanel());
    panel.ngOnInit();
    expect(panel.loaded()).toBe(true);
    expect(panel.passes()).toEqual([]);
  });

  it('says a failed read in plain words', () => {
    const panel = withApi({ passes: FAILED, audit: () => of({ status: 'SUCCESS', message: '', data: [] }) }, () => new RetentionHistoryPanel());
    panel.ngOnInit();
    expect(panel.loaded()).toBe(false);
    expect(panel.error()).toBe('The history could not be read.');
  });
});

describe('Place a hold panel -- the pipeline list', () => {
  it('is loading until the pipelines answer', () => {
    const panel = withApi({ pipelines: () => NEVER }, () => new RetentionHoldPanel());
    panel.ngOnInit();
    expect(panel.pipelinesState.loading()).toBe(true);
    expect(panel.pipelinesState.pending()).toBe(true);
  });

  it('knows there is none once an empty list answers', () => {
    const panel = withApi({ pipelines: () => of({ status: 'SUCCESS', message: '', data: [] }) }, () => new RetentionHoldPanel());
    panel.ngOnInit();
    expect(panel.pipelinesState.loaded()).toBe(true);
    expect(panel.pipelines()).toEqual([]);
  });

  it('says the list could not be read, instead of an empty list', () => {
    const panel = withApi({ pipelines: FAILED }, () => new RetentionHoldPanel());
    panel.ngOnInit();
    expect(panel.pipelinesState.loading()).toBe(false);
    expect(panel.pipelinesState.error()).toBe('The pipelines could not be read.');
  });
});
