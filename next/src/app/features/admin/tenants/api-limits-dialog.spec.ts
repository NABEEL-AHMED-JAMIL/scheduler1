import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ApiLimitsDialog, boundValue } from './api-limits-dialog';
import { ApiClientsApi } from '../../integration/api-clients/api-clients.api';
import { ToastService } from '../../../shared/ui/toast.service';

const DEFAULTS = { clientRateMax: 600, clientBurstMax: 100, workspaceRate: 1200, workspaceBurst: 200, monthlyCalls: null };

function dialog(row: Record<string, unknown>) {
  const api = {
    limits: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { tenantId: 2946, defaults: DEFAULTS, month: '2026-10', callsThisMonth: 850,
      quotaUsedPercent: 85, quotaWarning: true, monthEndsAt: null, updatedAt: null, updatedBy: null, ...row } })),
    saveLimits: vi.fn(() => of({ status: 'SUCCESS', message: 'API limits saved. They hold from the next call.' })),
  };
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(),
    { provide: DIALOG_DATA, useValue: { tenantId: 2946, tenantName: 'Northwind Group' } },
    { provide: DialogRef, useValue: ref },
    { provide: ApiClientsApi, useValue: api },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(ApiLimitsDialog);
  fixture.detectChanges();
  return { fixture, d: fixture.componentInstance, api, ref };
}

describe('MIG-337: a workspace\'s API limits (Administration › Tenants)', () => {
  it('reads the workspace\'s bounds, shows only what was set, and saves empty as the default and no quota', () => {
    const { d, api, ref, fixture } = dialog({ custom: true, bounds: { ...DEFAULTS, workspaceRate: 240, monthlyCalls: 1000 } });
    expect(api.limits).toHaveBeenCalledWith(2946);
    expect(d.clientRate()).toBe('');
    expect(d.workspaceRate()).toBe('240');
    expect(d.monthly()).toBe('1000');
    expect(fixture.nativeElement.textContent).toContain('850 calls');
    // H9: the quota's month is the bill's, in the workspace's billing time zone, which Identity names.
    expect(fixture.nativeElement.textContent).toContain("The bill's month, in the workspace's billing time zone.");
    expect(d.quotaHint({ ...api.limits.mock.results[0].value, monthTimeZone: 'America/Chicago' } as never)).toContain('in America/Chicago.');
    d.clientRate.set('120');
    d.monthly.set('');
    d.save();
    expect(api.saveLimits).toHaveBeenCalledWith({ tenantId: 2946, clientRateMax: 120, clientBurstMax: 0, workspaceRate: 240, workspaceBurst: 0,
      monthlyCalls: 0 });
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('a value that is not a whole number cannot be saved', () => {
    const { d } = dialog({ custom: false, bounds: DEFAULTS });
    d.monthly.set('ten thousand');
    expect(d.ready()).toBe(false);
    expect(boundValue('10,000')).toBe(10000);
    expect(boundValue(' ')).toBe(0);
    expect(boundValue('-5')).toBeNull();
  });
});
