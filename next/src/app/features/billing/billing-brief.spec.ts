import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { BillingBrief } from './billing-brief';
import { BillingApi } from './billing.service';
import { AuthService } from '../../core/auth/auth.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** The bill in one glance: read for admins, never asked for by anyone else. */
function brief(tenantAdmin: boolean, platformAdmin = false) {
  const api = { summary: vi.fn(() => of({ status: API_SUCCESS, data: { currency: 'USD', monthToDate: '184.62', periodStart: '2026-09-01', rateCardName: 'Standard', rateCardVersion: 3,
    openBalance: '202.75', openCount: 1, overdueBalance: '0', overdueCount: 0, pendingSlips: 1, nextDueAt: '2026-09-30T08:00:00Z', nextDueNumber: 'INV-2026-08-0006', nextDueBalance: '202.75',
    latestNumber: 'INV-2026-08-0006', latestTotal: '402.75', latestStatus: 'partially_paid' } })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: BillingApi, useValue: api }, { provide: AuthService, useValue: { isTenantAdmin: () => tenantAdmin, isPlatformAdmin: () => platformAdmin } },
  ] });
  const component = TestBed.runInInjectionContext(() => new BillingBrief());
  component.ngOnInit();
  return { component, api };
}

describe('BillingBrief', () => {
  it('reads the summary for an admin and turns the figures into numbers', () => {
    const { component, api } = brief(true);
    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(component.summary()?.monthToDate).toBe(184.62);
    expect(component.summary()?.openBalance).toBe(202.75);
    expect(component.summary()?.nextDueBalance).toBe(202.75);
    expect(component.hasSomething()).toBe(true);
    expect(component.money(202.75, 'USD')).toBe('$202.75');
  });

  it('never asks for a tenant user', () => {
    const { component, api } = brief(false);
    expect(api.summary).not.toHaveBeenCalled();
    expect(component.summary()).toBeNull();
  });
});
