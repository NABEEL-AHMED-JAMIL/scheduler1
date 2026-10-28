import { describe, expect, it, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AnalyticsService } from '../analytics.service';
import { ChartAnswer } from './chart-answer';
import { PinChartData, PinChartPanel } from './pin-chart-panel';
import { rowsOf } from './visualise-panel';

/**
 * MIG-357, the pin flow: the person's boards are offered (or a new one named), and Pin sends the query that ran, the kind
 * drawn, the settings and the caption to analyticsWorkspace.json/pinChart -- then says where the tile went. A refusal is
 * said in the server's words.
 */

const ANSWER: ChartAnswer = {
  sql: 'SELECT category, sum(revenue) AS revenue FROM dataset GROUP BY 1 ORDER BY revenue DESC\nLIMIT 200',
  dataset: { datasetId: 1300, name: 'Retail orders', connection: 'meridian-s3', path: 'datasets/retail/orders.csv' },
  columns: ['category', 'revenue'], rows: [['Books', '1200'], ['Toys', '800']], rowCount: 2, truncated: false,
  chart: { kind: 'ranked', title: 'Revenue by category', caption: 'Revenue for each category.', additive: true, source: 'model' },
};

function render(analytics: Partial<Record<keyof AnalyticsService, unknown>>) {
  const close = vi.fn();
  const data: PinChartData = { answer: ANSWER, kind: 'ranked', settings: { title: { text: 'Revenue by category' } }, title: 'Revenue by category' };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PinChartPanel],
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AnalyticsService, useValue: analytics },
      { provide: DIALOG_DATA, useValue: data }, { provide: DialogRef, useValue: { close } }],
  });
  const fixture = TestBed.createComponent(PinChartPanel);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, panel: fixture.componentInstance, close, q: (s: string) => el.querySelector(s) as HTMLElement | null };
}

describe('Pin to dashboard', () => {
  it('pins onto the first of the person\'s boards and says where the tile went', () => {
    const pinChart = vi.fn(() => of({ status: 'SUCCESS', data: {
      dashboard: { analyticsDashboardId: 1451, dashboardName: 'Meridian revenue', created: false }, analyticsQueryId: 1600,
      widget: { analyticsDashboardId: 1451, widgetTitle: 'Revenue by category' } } }));
    const { fixture, panel, q } = render({
      fetchAllDashboards: () => of({ status: 'SUCCESS', data: [{ analyticsDashboardId: 1451, dashboardName: 'Meridian revenue' },
        { analyticsDashboardId: 1452, dashboardName: 'Ops' }] }),
      pinChart,
    });
    expect(panel.mode()).toBe('existing');
    expect(panel.boardId()).toBe(1451);
    (q('[data-test="pin-save"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(pinChart).toHaveBeenCalledTimes(1);
    const sent = (pinChart.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ analyticsDashboardId: 1451, dashboardName: null, widgetTitle: 'Revenue by category',
      connectionAlias: 'meridian-s3', datasetPath: 'datasets/retail/orders.csv', queryText: ANSWER.sql, visualizationType: 'ranked' });
    expect(JSON.parse(sent['widgetConfig'] as string)).toEqual({ caption: 'Revenue for each category.',
      chart: { title: { text: 'Revenue by category' } }, additive: true });
    expect(q('[data-test="pinned"]')?.textContent).toContain('Meridian revenue');
    expect(q('[data-test="open-board"]')?.getAttribute('href')).toContain('board=1451');
  });

  it('makes a new board when the person has none, and says the server\'s refusal', () => {
    const pinChart = vi.fn(() => of({ status: 'ERROR', message: 'A dashboard name is at most 255 characters.' }));
    const { fixture, panel, q } = render({ fetchAllDashboards: () => of({ status: 'SUCCESS', data: [] }), pinChart });
    expect(panel.mode()).toBe('new');
    expect(panel.canPin()).toBe(false);
    panel.newName.set('Retail');
    fixture.detectChanges();
    (q('[data-test="pin-save"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((pinChart.mock.calls[0] as unknown[])[0]).toMatchObject({ analyticsDashboardId: null, dashboardName: 'Retail' });
    expect(q('[data-test="pin-error"]')?.textContent).toContain('at most 255 characters');
  });

  it('a 403 from the page gate reads as access, not as a failure', () => {
    const { fixture, panel, q } = render({ fetchAllDashboards: () => of({ status: 'SUCCESS', data: [] }),
      pinChart: () => throwError(() => ({ status: 403, error: null })) });
    panel.newName.set('Retail');
    panel.pin();
    fixture.detectChanges();
    expect(q('[data-test="pin-error"]')?.textContent).toContain('does not let you change dashboards');
  });
});

describe('Visualise -- a run\'s kept file read as rows', () => {
  it('reads a list of row objects as columns and text cells, and nothing else as a table', () => {
    expect(rowsOf([{ level: '65+', pct: 21.4, note: null }, { level: '18-39', pct: 9.1, note: 'x' }])).toEqual({
      columns: ['level', 'pct', 'note'], rows: [['65+', '21.4', null], ['18-39', '9.1', 'x']] });
    expect(rowsOf({ rows: [{ a: 1 }] })).toEqual({ columns: ['a'], rows: [['1']] });
    expect(rowsOf([1, 2])).toBeNull();
    expect(rowsOf('text')).toBeNull();
    expect(rowsOf([])).toBeNull();
  });
});

describe('Pin to dashboard -- the dashboard list loads, is empty, or failed (owner 2026-10-27)', () => {
  it('is loading until the dashboards answer', () => {
    const { panel } = render({ fetchAllDashboards: () => NEVER });
    expect(panel.loading()).toBe(true);
    expect(panel.boardsError()).toBe('');
  });

  it('offers a new dashboard when there is none', () => {
    const { panel } = render({ fetchAllDashboards: () => of({ status: 'SUCCESS', data: [] }) });
    expect(panel.loading()).toBe(false);
    expect(panel.mode()).toBe('new');
    expect(panel.boardsError()).toBe('');
  });

  it('says the dashboards could not be read, rather than that there are none', () => {
    const { panel, el } = render({ fetchAllDashboards: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
    expect(panel.loading()).toBe(false);
    expect(panel.boardsError()).toBe('Your dashboards could not be read; you can still pin to a new one.');
    expect(el.textContent).toContain('Try again');
  });
});
