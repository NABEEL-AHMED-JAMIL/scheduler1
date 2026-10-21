import { describe, it, expect, vi } from 'vitest';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Dashboards } from './dashboard';
import { AnalyticsService, Dashboard, DashboardWidget } from './analytics.service';

/**
 * UX review 2026-10-12. A viewer -- Saved Analyses alone -- reads the boards: opens, runs and filters them, and is offered
 * nothing that changes one (the gateway refuses those with a 403 besides). A refused board says so, with no retry; one card
 * that cannot be read no longer stops the counts of the cards after it.
 */
const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });
const BOARD: Dashboard = { analyticsDashboardId: 7, dashboardName: 'Ward occupancy', dashboardDescription: 'Beds by ward' };
const OTHER: Dashboard = { analyticsDashboardId: 8, dashboardName: 'Readmissions' };
const LAST: Dashboard = { analyticsDashboardId: 9, dashboardName: 'No-shows' };
const WIDGET: DashboardWidget = { analyticsDashboardWidgetId: 100, analyticsDashboardId: 7, widgetTitle: 'Beds', analyticsAnalysisId: 11,
  visualizationType: 'ranked', displayOrder: 0 };

function render(opts: { canEdit: boolean; byId?: (id: number) => any }) {
  const api = {
    fetchAllDashboards: vi.fn(() => of(OK([BOARD, OTHER, LAST]))),
    fetchDashboardById: vi.fn(opts.byId ?? ((id: number) => of(OK({ ...(id === 7 ? BOARD : id === 8 ? OTHER : LAST), widgets: [WIDGET] })))),
    fetchAllAnalyses: vi.fn(() => of(OK([]))), fetchAllQueries: vi.fn(() => of(OK([]))),
    analyze: vi.fn(() => new Subject().asObservable()), query: vi.fn(() => new Subject().asObservable()), cancel: vi.fn(() => of(OK(null))),
    saveDashboard: vi.fn(), deleteDashboard: vi.fn(), saveWidget: vi.fn(), deleteWidget: vi.fn(), schema: vi.fn(() => new Subject().asObservable()),
  };
  const edit = signal(opts.canEdit);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AnalyticsService, useValue: api },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: AuthService, useValue: { canEditDashboards: computed(() => edit()), canOpen: () => true, user: signal({ appUserId: 4642, tenantId: 2960 }) } },
    ],
  });
  const fixture = TestBed.createComponent(Dashboards);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = () => { fixture.detectChanges(); return (el.textContent ?? '').replace(/\s+/g, ' '); };
  return { api, fixture, el, board: fixture.componentInstance, text };
}

describe('Saved Analyses for a reader who may not change dashboards', () => {
  it('offers no new dashboard and says why', () => {
    const { text, el } = render({ canEdit: false });
    expect(text()).not.toContain('New dashboard');
    expect(el.querySelector('[data-test="read-only"]')?.textContent).toContain('Edit dashboards');
  });

  it('opens a board with no theme, no add, no delete and no tile actions', () => {
    const { board, text, el, fixture } = render({ canEdit: false });
    board.openDashboard(BOARD);
    fixture.detectChanges();
    expect(text()).toContain('Ward occupancy');
    expect(el.querySelector('.dash-theme')).toBeNull();
    expect(el.querySelector('[aria-label="Actions for Beds"]')).toBeNull();
    expect(text()).not.toContain('Add a widget');
  });

  it('offers all of it to whoever may edit', () => {
    const { board, text, el, fixture } = render({ canEdit: true });
    expect(text()).toContain('New dashboard');
    board.openDashboard(BOARD);
    fixture.detectChanges();
    expect(el.querySelector('.dash-theme')).not.toBeNull();
    expect(el.querySelector('[aria-label="Actions for Beds"]')).not.toBeNull();
  });
});

describe('a board that cannot be read', () => {
  it('says a refusal is one, without a retry', () => {
    const refused = new HttpErrorResponse({ status: 403, error: { status: 'ERROR', message: 'Saved Analyses is not part of your access. Ask your workspace admin.' } });
    const { board, el, fixture } = render({ canEdit: false, byId: () => throwError(() => refused) });
    board.openDashboard(BOARD);
    fixture.detectChanges();
    const card = el.querySelector('[data-test="board-refused"]');
    expect(card?.textContent).toContain("This dashboard isn't open to you");
    expect(card?.textContent).toContain('Ask your workspace admin');
    expect(el.querySelector('app-load-error')).toBeNull();
  });

  /** ZT-A10 (2026-10-21): Meridian's board link opened in Riverside read "Dashboard not found with 1524." and offered "Try again". */
  it('ZT-A10: says a board that is not here is not here, with the way back and no retry', () => {
    const { board, el, fixture } = render({ canEdit: true, byId: () => of({ status: 'ERROR', message: 'Dashboard not found with 1524.', data: null }) });
    board.openDashboard(BOARD);
    fixture.detectChanges();
    const card = el.querySelector('[data-test="board-missing"]');
    expect(card?.textContent).toContain("This dashboard isn't here");
    expect(card?.textContent).toContain('another workspace');
    expect(el.querySelector('app-load-error')).toBeNull();
  });

  it('leaves one card without counts and still counts the cards after it', () => {
    const { board } = render({ canEdit: true, byId: (id: number) => id === 8
      ? throwError(() => new HttpErrorResponse({ status: 502 }))
      : of(OK({ ...(id === 7 ? BOARD : LAST), widgets: [WIDGET] })) });
    expect(board.cardFacts(BOARD)).toContain('1 widget');
    expect(board.cardFacts(OTHER)).toBe('');
    expect(board.cardFacts(LAST)).toContain('1 widget');
  });
});
