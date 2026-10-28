import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AskDataApi } from '../../ask-data/ask-data.api';
import { AnalyticsService } from '../analytics.service';
import { VisualisePanel } from './visualise-panel';

/** Owner 2026-10-27: Visualise is loading, says when nothing fits a suggestion, or why the columns could not be read. */
function panel(schema: () => Observable<unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { name: 'orders.csv', connection: 'minio-main', path: 'orders.csv' } },
      { provide: AnalyticsService, useValue: { schema, query: () => NEVER } },
      { provide: AskDataApi, useValue: {} },
      { provide: HttpClient, useValue: { get: () => NEVER } },
      { provide: AuthService, useValue: { canOpen: () => false, canEditDashboards: () => false } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new VisualisePanel());
  screen.ngOnInit();
  return screen;
}

describe('Visualise -- loading, nothing to suggest, error (owner 2026-10-27)', () => {
  it('is loading, and says nothing is suggested only after the columns answer', () => {
    const screen = panel(() => NEVER);
    expect(screen.loading()).toBe('Reading the columns…');
    expect(screen.noSuggestion()).toBe(false);
  });

  it('falls back to the row count when no column lends itself to a chart, and runs it', () => {
    // suggestCharts always offers at least "Row count", so the panel never ends with nothing.
    const screen = panel(() => of({ status: 'SUCCESS', message: '', data: { columns: [] } }));
    expect(screen.tried().map(t => t.suggestion.id)).toEqual(['rows']);
    expect(screen.loading()).toBe('Running the suggested charts…');
    expect(screen.noSuggestion()).toBe(false);
  });

  it('says the columns could not be read, in plain words, with Try again', () => {
    const screen = panel(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(screen.loading()).toBe('');
    expect(screen.error()).toBe('The columns could not be read.');
    expect(screen.readFailed()).toBe(true);
  });
});
