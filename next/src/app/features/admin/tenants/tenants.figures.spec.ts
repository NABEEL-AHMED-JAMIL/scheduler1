import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { Tenants } from './tenants';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BillingApi } from '../../billing/billing.service';
import { ManagedSession } from '../managed-service/managed-session';
import { useMemoryStorage } from '../../../shared/testing/memory-storage';

/**
 * Owner #19 (2026-10-19): Platform › Workspaces shows each workspace's figures from the server -- users and pipelines
 * (Identity), runs this month, failed runs and alerts open (Core), cost this month, storage and plan (billing) -- with
 * summary tiles over every workspace, its state in words, and "Work in this workspace" first in its ⋮ (owner #20).
 */
const ROWS = [
  { tenantId: 2960, tenantName: 'Riverside Health', tenantCode: 'riverside', status: 'Active', managementMode: 'SELF', userCount: 3,
    sourceTaskCount: 12, sourceJobCount: 9, runsThisMonth: 140, failedRunsThisMonth: 6, openAlerts: 2 },
  { tenantId: 2962, tenantName: 'Open Data Lab', tenantCode: 'open-data', status: 'Suspended', managementMode: 'MANAGED', userCount: 3,
    sourceTaskCount: 4, sourceJobCount: 2, runsThisMonth: 20, failedRunsThisMonth: 0, openAlerts: 0 },
  { tenantId: 2963, tenantName: 'New', tenantCode: 'new', status: 'Active', userCount: 0, sourceTaskCount: 0, sourceJobCount: 0 },
];
const FIGURES = { month: '2026-10', storageDay: '2026-10-18', workspaces: [
  { tenantId: 2960, costThisMonth: '167.81', storageBytes: '2684354560', plan: 'Standard 2026', planOwn: false },
  { tenantId: 2962, costThisMonth: '12.00', storageBytes: '268435456', plan: 'Open Data pilot', planOwn: true },
] };

function setup(figures: object = { status: 'SUCCESS', data: FIGURES }) {
  const session = { workIn: vi.fn(async () => true) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', data: ROWS })), post: vi.fn(), put: vi.fn() } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: () => ({ appUserId: 4639 }), isPlatformAdmin: () => true, isManagedSession: () => false } },
      { provide: BillingApi, useValue: { workspaceFigures: vi.fn(() => of(figures)) } },
      { provide: ManagedSession, useValue: session },
    ],
  });
  const fixture = TestBed.createComponent(Tenants);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, session };
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('owner #19: Workspaces, its figures and its state', () => {
  useMemoryStorage();
  afterEach(() => sessionStorage.clear());

  it('sums the figures into the tiles: runs this month and failed, cost this month, alerts open, managed', () => {
    const { page } = setup();
    expect(page.stats()).toEqual(expect.objectContaining({ tenants: 3, active: 2, suspended: 1, managed: 1, users: 6, runs: 160, failed: 6,
      alerts: 2, alerting: 1 }));
    expect(page.stats().cost).toBeCloseTo(179.81, 2);
  });

  it('shows each workspace\'s plan, runs, storage, cost and alerts in its row, and a dash where nothing was counted', () => {
    const { el } = setup();
    const row = el.querySelector('[data-workspace="2960"]')!;
    expect([...row.querySelectorAll('[data-test="workspace-state"] .pill')].map(p => p.textContent!.trim())).toEqual(['Active', 'Self-managed']);
    expect([...row.querySelectorAll('[data-test="workspace-plan"] div')].map(d => d.textContent!.trim())).toEqual(['Standard 2026', 'the default card']);
    expect(text(row.querySelector('[data-test="workspace-runs"]'))).toBe('140 6 failed');
    expect(text(row.querySelector('[data-test="workspace-cost"]'))).toBe('$167.81');
    expect(text(row.querySelector('[data-test="workspace-alerts"]'))).toBe('2 open');
    expect(text(row)).toContain('2.5 GB');
    const unknown = el.querySelector('[data-workspace="2963"]')!;
    expect(text(unknown.querySelector('[data-test="workspace-runs"]'))).toBe('—');
    expect(text(unknown.querySelector('[data-test="workspace-cost"]'))).toBe('—');
  });

  it('filters to the managed workspaces', () => {
    const { page } = setup();
    page.setStatusFilter('MANAGED');
    expect(page.filtered().map(t => t.tenantName)).toEqual(['Open Data Lab']);
  });

  it('keeps the list when billing cannot say what the workspaces cost', () => {
    const { page } = setup({ status: 'ERROR', message: 'Metering is not configured.' });
    expect(page.rows().length).toBe(3);
    expect(page.figuresError()).toBe('Metering is not configured.');
  });

  it('owner #20: "Work in this workspace" opens a managed session there', () => {
    const { page, session } = setup();
    page.workIn(ROWS[0] as any);
    expect(session.workIn).toHaveBeenCalledWith(2960, 'Riverside Health');
  });
});
