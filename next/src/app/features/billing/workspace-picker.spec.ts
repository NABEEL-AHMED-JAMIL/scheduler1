import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WorkspacePicker } from './workspace-picker';
import { AuthService } from '../../core/auth/auth.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** MIG-211: two workspaces called "MedAxis Care Network" were two identical options in every billing picker. */
describe('WorkspacePicker', () => {
  it('offers each workspace once by name, and a name two workspaces share with the id', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { isPlatformAdmin: () => true } }] });
    const picker = TestBed.inject(WorkspacePicker);
    picker.ready(() => {});
    TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/tenant.json/listTenants')).flush({ status: API_SUCCESS, data: [
      { tenantId: 3107, tenantName: 'MedAxis Care Network' }, { tenantId: 2901, tenantName: 'CareBridge Health Services' }, { tenantId: 2905, tenantName: 'MedAxis Care Network' },
    ] });
    expect(picker.options()).toEqual([
      { value: '3107', label: 'MedAxis Care Network (#3107)' },
      { value: '2901', label: 'CareBridge Health Services' },
      { value: '2905', label: 'MedAxis Care Network (#2905)' },
    ]);
    picker.tenantId.set('2905');
    expect(picker.name()).toBe('MedAxis Care Network (#2905)');
  });

  it('ZT-B12: opens Cost & usage on a billed workspace, a sandbox only when it is picked, and says when it is one', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { isPlatformAdmin: () => true } }] });
    const picker = TestBed.inject(WorkspacePicker);
    picker.tenantId.set(null);
    picker.ready(() => {});
    TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/tenant.json/listTenants')).flush({ status: API_SUCCESS, data: [
      { tenantId: 1004, tenantName: 'Cedar Valley Home Care (sandbox)', sandboxOf: 1002 }, { tenantId: 1003, tenantName: 'Lakeside Home Health (sandbox)', sandboxOf: 1001 },
      { tenantId: 1002, tenantName: 'Cedar Valley Home Care', sandboxOf: null },
    ] });
    expect(picker.effective()).toBe('1002');
    expect(picker.effectiveIsSandbox()).toBe(false);
    picker.tenantId.set('1003');
    expect(picker.effectiveIsSandbox()).toBe(true);
    picker.tenantId.set(null);
  });
});
