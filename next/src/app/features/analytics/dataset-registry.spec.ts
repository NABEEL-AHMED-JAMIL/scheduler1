import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { AnalyticsService } from './analytics.service';
import { DatasetRegistry } from './dataset-registry';

/** Owner 2026-10-27: the registry is loading, then empty or listed, or says why it could not be read. */
function registry(answer: () => Observable<unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AnalyticsService, useValue: { fetchAllDatasets: answer } },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new DatasetRegistry());
  screen.ngOnInit();
  return screen;
}

describe('Registered datasets -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading until the registry answers', () => {
    expect(registry(() => NEVER).loading()).toBe(true);
  });

  it('is empty once an empty registry answers', () => {
    const screen = registry(() => of({ status: 'SUCCESS', message: '', data: [] }));
    expect(screen.loading()).toBe(false);
    expect(screen.datasets()).toEqual([]);
    expect(screen.error()).toBe('');
  });

  it('says the registry could not be read, in plain words', () => {
    const screen = registry(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(screen.loading()).toBe(false);
    expect(screen.error()).toBe('The registry could not be read.');
  });
});
