import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { Dashboard } from './dashboard';
import { DashboardService, JobBreakdown } from './dashboard.service';
import { ToastService } from '../../shared/ui/toast.service';
import { JobEventsService } from '../../core/socket/job-events.service';
import { AuthService } from '../../core/auth/auth.service';
import { BillingBrief } from '../billing/billing-brief';
import { Donut } from '../../shared/charts/donut';
import { BarChart } from '../../shared/charts/bar-chart';
import { Heatmap } from '../../shared/charts/heatmap';

/**
 * MIG-296 (review dashboard#17): a platform administrator's hour drill-down lists every
 * workspace's jobs, and a row said only the job's name and id. The server now tags each row with
 * its workspace and marks the TOTAL row allWorkspaces; the table shows a Workspace column after
 * the job and the heading says whose jobs these are. Nobody else's drill-down changes.
 */
type Role = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

const row = (over: Partial<JobBreakdown>): JobBreakdown => ({
  jobId: 1, jobName: 'Job', queue: 0, start: 0, running: 0, failed: 0,
  completed: 0, skip: 0, interrupt: 0, missed: 0, total: 0, ...over,
});

const HOUR: JobBreakdown[] = [
  row({ jobId: 2833, jobName: 'Nightly import', completed: 2, total: 2, tenantId: 1, tenantName: 'Acme Ops' }),
  // Identity could not be asked for this one's name.
  row({ jobId: 2901, jobName: 'Nightly import', failed: 1, total: 1, tenantId: 7 }),
  row({ jobId: 0, jobName: 'TOTAL', completed: 2, failed: 1, total: 3, allWorkspaces: true }),
];

async function render(role: Role, hour: JobBreakdown[] = HOUR) {
  TestBed.resetTestingModule();
  const answer = () => of({ status: 'SUCCESS', data: [] });
  TestBed.configureTestingModule({
    providers: [
      { provide: DashboardService, useValue: { jobStatus: answer, jobRunning: answer, hourly: answer, breakdown: () => of({ status: 'SUCCESS', data: hour }) } },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: 0 }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
      { provide: AuthService, useValue: { canOpen: () => true, isPlatformAdmin: () => role === 'PLATFORM_ADMIN', isTenantAdmin: () => role !== 'TENANT_USER', canBuild: () => false } },
    ],
  });
  // The drill-down is what is under test; the billing card and the charts have their own specs
  // and dependencies of their own, so they are left as inert elements here.
  TestBed.overrideComponent(Dashboard, {
    remove: { imports: [BillingBrief, Donut, BarChart, Heatmap] },
    add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
  });
  const fixture = TestBed.createComponent(Dashboard);
  const dashboard = fixture.componentInstance;
  fixture.detectChanges();
  dashboard.selectedCell.set({ date: '2026-09-24', hr: 22, day: 'Thursday', dates: ['2026-09-24'] });
  dashboard.breakdown.set(hour);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const drill = () => el.querySelector<HTMLElement>('#dash-drill')!;
  const headings = () => Array.from(drill().querySelectorAll('thead th')).map(th => (th.textContent ?? '').trim());
  const bodyRows = () => Array.from(drill().querySelectorAll('tbody > tr'));
  const footCells = () => Array.from(drill().querySelectorAll('tfoot > tr > td'));
  return { fixture, dashboard, el, drill, headings, bodyRows, footCells };
}

describe('Dashboard hour drill-down: the workspace a job belongs to', () => {
  it('gives a platform administrator a Workspace column right after the job', async () => {
    const { headings, bodyRows } = await render('PLATFORM_ADMIN');
    const heads = headings();
    expect(heads.indexOf('Workspace')).toBe(heads.indexOf('Job') + 1);
    const at = heads.indexOf('Workspace');
    expect(bodyRows().map(tr => (tr.children[at]?.textContent ?? '').trim()))
      .toEqual(['Acme Ops', 'Workspace #7']);
  });

  it('keeps the footer lined up under the headings', async () => {
    const { headings, footCells } = await render('PLATFORM_ADMIN');
    expect(footCells()).toHaveLength(headings().length);
  });

  it('says "all workspaces" in the heading when the server marks the hour so', async () => {
    const { dashboard, drill } = await render('PLATFORM_ADMIN');
    expect(dashboard.drillHeading()).toBe('Jobs in all workspaces on Thursday 24 Sep 2026, 22:00–23:00');
    expect(drill().getAttribute('aria-label')).toContain('all workspaces');
  });

  it('finds a job by its workspace in the search box', async () => {
    const { dashboard } = await render('PLATFORM_ADMIN');
    dashboard.breakdownSearch.set('acme');
    expect(dashboard.filteredBreakdown().map(r => r.jobId)).toEqual([2833]);
    dashboard.breakdownSearch.set('workspace #7');
    expect(dashboard.filteredBreakdown().map(r => r.jobId)).toEqual([2901]);
  });

  for (const role of ['TENANT_ADMIN', 'TENANT_USER'] as const) {
    it(`leaves the ${role} drill-down exactly as it was`, async () => {
      // The server never marks a tenant's hour allWorkspaces; without the flag the heading is the old one.
      const own = HOUR.map(({ tenantName, allWorkspaces, ...rest }) => rest as JobBreakdown);
      const { dashboard, headings, footCells, drill } = await render(role, own);
      expect(headings()).not.toContain('Workspace');
      expect(footCells()).toHaveLength(headings().length);
      expect(drill().textContent).not.toMatch(/Workspace #|all workspaces/);
      expect(dashboard.drillHeading()).toBe('Jobs on Thursday 24 Sep 2026, 22:00–23:00');
      dashboard.breakdownSearch.set('workspace');
      expect(dashboard.filteredBreakdown()).toEqual([]);
    });
  }
});
