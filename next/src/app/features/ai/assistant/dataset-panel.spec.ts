import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AssistantApi } from './assistant.api';
import { DatasetPanel } from './dataset-panel';

/** Owner 2026-10-27: the dataset panel is loading, then empty or the rows, or says why it could not read them. */
function panel(answer: () => Observable<unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { datasetRef: 'ds-1', tool: 'get_jobs' } },
      { provide: AssistantApi, useValue: { dataset: answer } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new DatasetPanel());
  screen.ngOnInit();
  return screen;
}

describe('Dataset panel -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, not empty, until the rows answer', () => {
    const screen = panel(() => NEVER);
    expect(screen.loading()).toBe(true);
    expect(screen.state.pending()).toBe(true);
  });

  it('is empty once no row answers', () => {
    const screen = panel(() => of({ status: 'SUCCESS', message: '', data: { rows: [], rowsKept: 0, offset: 0 } }));
    expect(screen.state.pending()).toBe(false);
    expect(screen.rows()).toEqual([]);
  });

  it('says the rows could not be read, in plain words', () => {
    const screen = panel(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(screen.loading()).toBe(false);
    expect(screen.error()).toBe('The dataset could not be read.');
  });
});

describe('Dataset panel -- sorted on the server (owner 2026-10-27)', () => {
  it('sends no sort before a heading is picked, then the column and direction from the first rows, and Next walks that order', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ name: 'r' + i, amount: i }));
    const dataset = vi.fn(() => of({ status: 'SUCCESS', message: '', data: { rows, rowsKept: 120, offset: 0 } }));
    const screen = panel(dataset);
    expect(dataset).toHaveBeenLastCalledWith('ds-1', 0, 50, null);
    expect(screen.sort.sortable('amount')).toBe(true);
    screen.page(1);
    screen.sort.toggle('amount');
    expect(dataset).toHaveBeenLastCalledWith('ds-1', 0, 50, { sort: 'amount', dir: 'asc' });
    screen.sort.toggle('amount');
    expect(dataset).toHaveBeenLastCalledWith('ds-1', 0, 50, { sort: 'amount', dir: 'desc' });
    screen.page(1);
    expect(dataset).toHaveBeenLastCalledWith('ds-1', 50, 50, { sort: 'amount', dir: 'desc' });
  });
});
