import { describe, it, expect, vi } from 'vitest';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Dashboards, tileOf } from './dashboard';
import { AnalyticsService, Dashboard, DashboardWidget } from './analytics.service';
import { BoardApi, tableBody } from './board/board-api';

/**
 * ZT-A13 (owner, 2026-10-21): a viewer whose only Analytics page is Saved Analyses ran any statement on any file of the
 * bucket. The server now runs such a reader the tile's own saved statement or analysis, named by its board and widget -- so
 * every read a board makes says which tile it is: a tile's run, a table's page and its export, a filter's values, and the
 * columns the filter bar reads.
 */
const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });
const BOARD: Dashboard = { analyticsDashboardId: 7, dashboardName: 'Ward occupancy' };
const ANALYSIS_TILE: DashboardWidget = { analyticsDashboardWidgetId: 100, analyticsDashboardId: 7, widgetTitle: 'Beds', analyticsAnalysisId: 11,
  visualizationType: 'ranked', displayOrder: 0 };
const QUERY_TILE: DashboardWidget = { analyticsDashboardWidgetId: 101, analyticsDashboardId: 7, widgetTitle: 'Admissions', analyticsQueryId: 21,
  visualizationType: 'bar', displayOrder: 1 };

function render() {
  const api = {
    fetchAllDashboards: vi.fn(() => of(OK([BOARD]))),
    fetchDashboardById: vi.fn(() => of(OK({ ...BOARD, widgets: [ANALYSIS_TILE, QUERY_TILE] }))),
    fetchAllAnalyses: vi.fn(() => of(OK([{ analyticsAnalysisId: 11, analysisName: 'Beds by ward', connectionAlias: 'riverside-health-s3',
      datasetPath: 'patient360/results/encounters.csv', analysisConfig: JSON.stringify({ dimensions: ['ward'], measure: { aggregation: 'COUNT_ROWS' } }) }]))),
    fetchAllQueries: vi.fn(() => of(OK([{ analyticsQueryId: 21, queryName: 'Admissions', connectionAlias: 'riverside-health-s3',
      datasetPath: 'patient360/results/cohort.csv', queryText: 'SELECT ward, count(*) FROM dataset GROUP BY ward' }]))),
    analyze: vi.fn(() => new Subject().asObservable()), query: vi.fn(() => new Subject().asObservable()), cancel: vi.fn(() => of(OK(null))),
    saveDashboard: vi.fn(), deleteDashboard: vi.fn(), saveWidget: vi.fn(), deleteWidget: vi.fn(), schema: vi.fn(() => new Subject().asObservable()),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AnalyticsService, useValue: api },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: AuthService, useValue: { canEditDashboards: computed(() => false), canOpen: () => true, user: signal({ appUserId: 4642, tenantId: 2960 }) } },
    ],
  });
  const fixture = TestBed.createComponent(Dashboards);
  fixture.detectChanges();
  return { api, fixture, board: fixture.componentInstance };
}

describe('ZT-A13: every read a board makes names its tile', () => {
  it('a tile run carries its board and widget, an analysis and a statement alike', () => {
    const { api, board, fixture } = render();
    board.openDashboard(BOARD);
    fixture.detectChanges();
    expect(api.analyze).toHaveBeenCalledWith(expect.objectContaining({ boardId: 7, widgetId: 100 }));
    expect(api.query).toHaveBeenCalledWith(expect.objectContaining({ boardId: 7, widgetId: 101, sql: 'SELECT ward, count(*) FROM dataset GROUP BY ward' }));
  });

  it('the filter bar asks for a dataset\'s columns on its board', () => {
    const { api, board, fixture } = render();
    board.openDashboard(BOARD);
    fixture.detectChanges();
    board.chooseFilterDataset('riverside-health-s3\u0000patient360/results/cohort.csv');
    expect(api.schema).toHaveBeenCalledWith('riverside-health-s3', 'patient360/results/cohort.csv', 7);
  });

  it('a tile not saved yet names none', () => {
    expect(tileOf({ widgetTitle: 'Draft', displayOrder: 0 } as DashboardWidget)).toEqual({});
    expect(tileOf(QUERY_TILE)).toEqual({ boardId: 7, widgetId: 101 });
  });

  it('a table page and its export carry the tile; a filter\'s values the board', () => {
    const body = tableBody({ connection: 'c', path: 'p', sql: 'SELECT 1', page: 0, pageSize: 25, boardId: 7, widgetId: 101 });
    expect(body).toEqual(expect.objectContaining({ boardId: 7, widgetId: 101 }));
    expect(tableBody({ connection: 'c', path: 'p', sql: 'SELECT 1', page: 0, pageSize: 25 })).not.toHaveProperty('boardId');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(BoardApi);
    const http = TestBed.inject(HttpTestingController);
    api.values('riverside-health-s3', 'patient360/results/cohort.csv', 'ward', '', 200, 7).subscribe();
    const call = http.expectOne(r => r.url.endsWith('/analytics.json/values'));
    expect(call.request.params.get('boardId')).toBe('7');
    expect(call.request.params.get('column')).toBe('ward');
    api.exportCsv({ connection: 'c', path: 'p', sql: 'SELECT 1', page: 0, pageSize: 25, boardId: 7, widgetId: 101 }, 'admissions.csv').subscribe();
    const exported = http.expectOne(r => r.url.endsWith('/analyticsExport.json/download'));
    expect(exported.request.body).toEqual(expect.objectContaining({ boardId: 7, widgetId: 101, format: 'csv' }));
  });
});
