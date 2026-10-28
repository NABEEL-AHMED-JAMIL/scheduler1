import { describe, it, expect, vi } from 'vitest';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Dashboards } from './dashboard';
import { AnalyticsService } from './analytics.service';

/**
 * Owner 2026-10-27: the dashboards list is loading (cards, not "No dashboards yet") until it answers, then empty or the
 * reason it could not be read; the Add widget sources say when their read failed.
 */
const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });

function render(listing: () => Observable<unknown>, analyses: () => Observable<unknown> = () => of(OK([]))) {
  const api = {
    fetchAllDashboards: vi.fn(listing), fetchDashboardById: vi.fn(() => NEVER),
    fetchAllAnalyses: vi.fn(analyses), fetchAllQueries: vi.fn(() => of(OK([]))),
    analyze: vi.fn(() => new Subject().asObservable()), query: vi.fn(() => new Subject().asObservable()), cancel: vi.fn(() => of(OK(null))),
    saveDashboard: vi.fn(), deleteDashboard: vi.fn(), saveWidget: vi.fn(), deleteWidget: vi.fn(), schema: vi.fn(() => new Subject().asObservable()),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AnalyticsService, useValue: api },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: AuthService, useValue: { canEditDashboards: computed(() => true), canOpen: () => true, user: signal({ appUserId: 4642, tenantId: 2960 }) } },
    ],
  });
  const fixture = TestBed.createComponent(Dashboards);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, board: fixture.componentInstance, text: () => { fixture.detectChanges(); return el.textContent ?? ''; } };
}

describe('Dashboards -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, not "No dashboards yet", until the list answers', () => {
    const { board, text } = render(() => NEVER);
    expect(board.loading()).toBe(true);
    expect(text()).not.toContain('No dashboards yet');
  });

  it('says there is none yet once an empty list answers', () => {
    const { board, text } = render(() => of(OK([])));
    expect(board.loading()).toBe(false);
    expect(text()).toContain('No dashboards yet');
  });

  it('says the list could not be read, with Try again, and not that there is none', () => {
    const { board, text } = render(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(board.loading()).toBe(false);
    expect(board.error()).not.toBe('');
    expect(text()).toContain('Try again');
    expect(text()).not.toContain('No dashboards yet');
  });

  it('says the saved work a widget points at could not be read, in plain words', () => {
    const { board } = render(() => of(OK([])), () => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(board.sourcesError()).toBe('Saved analyses could not be read.');
    expect(board.sourcesReady()).toBe(true);
  });
});
