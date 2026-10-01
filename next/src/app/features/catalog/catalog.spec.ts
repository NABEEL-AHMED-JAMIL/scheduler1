import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { Catalog } from './catalog';
import { CatalogApi } from './catalog.api';
import { CatalogPanel } from './catalog-panel';
import { AssetDetail, CatalogAsset, LineageGraph, freshnessText, lineageSides, whereText } from './catalog.model';

/**
 * Data Catalog (MIG-288): the workspace's assets with their owner, freshness, sensitive fields and quality, narrowed by
 * kind, flag and text; one asset in a panel -- its columns and tags, sensitivity, lineage, and access.
 */
const ASSETS: CatalogAsset[] = [
  { assetId: 1346, kind: 'file', source: 'storage', name: 'customers.csv', connection: 'ui-review-s3', path: 'crm/customers.csv', format: 'csv',
    ownerUserId: null, ownerName: null, description: null, rowCount: 4, sizeBytes: null, columnCount: 6, qualityScore: 91.67,
    sensitivity: 'Restricted', status: 'Active', lastChangedAt: '2026-09-30T22:50:27', profiledAt: null, profileError: null, deletedAt: null,
    stale: false, noOwner: true, tags: ['card_number', 'email'] },
  { assetId: 1010, kind: 'dataset', source: 'analytics', name: 'Clean customers', connection: 'ui-review-s3', path: 'out/*.json', format: 'json',
    ownerUserId: 4537, ownerName: 'Claude Demo Admin', description: 'Cleaned', rowCount: 3, sizeBytes: null, columnCount: 3, qualityScore: null,
    sensitivity: 'Unclassified', status: 'Active', lastChangedAt: '2026-08-01T10:00:00', profiledAt: null, profileError: null, deletedAt: null,
    stale: true, noOwner: false, tags: [] },
];
const SUMMARY = { assets: 2, sensitive: 1, stale: 1, noOwner: 1, datasets: 1, files: 1, staleDays: 30 };
const GRAPH: LineageGraph = {
  ref: 'dataset:1010',
  nodes: [{ ref: 'file:s/in.csv', kind: 'file', name: 'in.csv' }, { ref: 'pipeline:2849', kind: 'pipeline', name: 'Clean-up job' },
    { ref: 'file:s/out.json', kind: 'file', name: 'out.json' }, { ref: 'dataset:1010', kind: 'dataset', name: 'Clean customers' },
    { ref: 'dashboard:1380', kind: 'dashboard', name: 'Customer health' }],
  edges: [{ from: 'file:s/in.csv', to: 'pipeline:2849', via: 'run', runs: 7, lastRunId: 7516, lastSeenAt: null },
    { from: 'pipeline:2849', to: 'file:s/out.json', via: 'run', runs: 6, lastRunId: 7516, lastSeenAt: null },
    { from: 'file:s/out.json', to: 'dataset:1010', via: 'dataset', runs: 1, lastRunId: null, lastSeenAt: null },
    { from: 'dataset:1010', to: 'dashboard:1380', via: 'dashboard', runs: 1, lastRunId: null, lastSeenAt: null }],
};

function api(detail?: Partial<AssetDetail>) {
  const asset: AssetDetail = { ...ASSETS[1], columns: [
    { position: 0, name: 'email', dataType: 'VARCHAR', nullPercent: 0, distinctCount: 3, tags: ['email'], tagsReviewed: false },
    { position: 1, name: 'region', dataType: 'VARCHAR', nullPercent: 25, distinctCount: 2, tags: [], tagsReviewed: true }],
    canEdit: false, masked: false, myAccess: null, ...detail };
  return {
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: ASSETS })),
    summary: vi.fn(() => of({ status: 'SUCCESS', message: '', data: SUMMARY })),
    asset: vi.fn(() => of({ status: 'SUCCESS', message: '', data: asset })),
    lineage: vi.fn(() => of({ status: 'SUCCESS', message: '', data: GRAPH })),
    accessRequests: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [
      { grantId: 1000, assetId: 1010, assetName: 'Clean customers', userId: 4597, userName: 'alex', reason: 'churn review', days: 2,
        status: 'Granted', workflowInstanceId: 1016, requestedAt: null, decidedAt: null, expiresAt: '2026-10-02T23:33:17', endedAt: null }] })),
    tag: vi.fn(() => of({ status: 'SUCCESS', message: '', data: asset })),
    classify: vi.fn(() => of({ status: 'SUCCESS', message: '', data: asset })),
    requestAccess: vi.fn(() => of({ status: 'SUCCESS', message: 'Asked.', data: {} })),
    revokeAccess: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { grantId: 1000, status: 'Revoked' } })),
  };
}

function page(flag?: string) {
  const fake = api();
  const dialog = { open: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: CatalogApi, useValue: fake }, { provide: Dialog, useValue: dialog }],
  });
  const fixture = TestBed.createComponent(Catalog);
  if (flag) fixture.componentRef.setInput('flag', flag);
  fixture.detectChanges();
  return { fake, dialog, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

function panel(detail?: Partial<AssetDetail>) {
  const fake = api(detail);
  const changed = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: CatalogApi, useValue: fake },
      { provide: DIALOG_DATA, useValue: { assetId: 1010, name: 'Clean customers', changed } }, { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: AuthService, useValue: { user: () => ({ appUserId: 4537 }) } }],
  });
  const fixture = TestBed.createComponent(CatalogPanel);
  fixture.detectChanges();
  return { fake, changed, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Data Catalog', () => {
  it('lists the assets with their owner, freshness, sensitive fields, sensitivity and quality, and counts them in the strip', () => {
    const { el, fake } = page();
    expect(fake.list).toHaveBeenCalledWith({ q: undefined, flag: undefined, withDeleted: false });
    const rows = Array.from(el.querySelectorAll('tr[data-asset]'));
    expect(rows.map(r => r.getAttribute('data-asset'))).toEqual(['1346', '1010']);
    expect(rows[0].textContent).toContain('customers.csv');
    expect(rows[0].textContent).toContain('ui-review-s3 · crm/customers.csv · 4 rows');
    expect(rows[0].textContent).toContain('card number');
    expect(rows[0].textContent).toContain('Restricted');
    expect(rows[0].textContent).toContain('91.67%');
    expect(rows[1].textContent).toContain('Claude Demo Admin');
    expect(rows[1].querySelector('.is-stale')).not.toBeNull();
    expect(el.textContent).toContain('With sensitive fields');
    expect(el.textContent).toContain('Stale over 30 days');
  });

  it('narrows by kind at once and by flag through the address', () => {
    const { screen, fixture, el, fake } = page('sensitive');
    expect(fake.list).toHaveBeenCalledWith({ q: undefined, flag: 'sensitive', withDeleted: false });
    screen.kind.set('dataset');
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('tr[data-asset]')).map(r => r.getAttribute('data-asset'))).toEqual(['1010']);
  });

  it('opens an asset in its panel', () => {
    const { el, dialog } = page();
    (el.querySelector('tr[data-asset="1010"]') as HTMLElement).click();
    expect(dialog.open).toHaveBeenCalledWith(CatalogPanel, expect.objectContaining({ data: expect.objectContaining({ assetId: 1010 }) }));
  });
});

describe('Data Catalog asset panel', () => {
  it('shows the columns and what they hold, and the lineage from source to report', () => {
    const { el } = panel();
    expect(el.querySelector('tr[data-column="email"]')?.textContent).toContain('email');
    const lineage = el.querySelector('[data-lineage]')!.textContent!;
    expect(lineage.indexOf('in.csv')).toBeLessThan(lineage.indexOf('Clean-up job'));
    expect(lineage.indexOf('Clean-up job')).toBeLessThan(lineage.indexOf('Clean customers'));
    expect(lineage.indexOf('Clean customers')).toBeLessThan(lineage.indexOf('Customer health'));
    expect(lineage).toContain('Used by 1 dashboard');
    expect(el.querySelector('[data-request-access]')).toBeNull();
  });

  it('lets someone it is masked for ask for access, for a time and a reason', () => {
    const { el, screen, fixture, fake } = panel({ masked: true });
    expect(el.querySelector('[data-access]')?.textContent).toContain('masked for you');
    const ask = el.querySelector('[data-request-access]') as HTMLButtonElement;
    expect(ask.disabled).toBe(true);
    screen.reason.set('churn review');
    screen.days.set(7);
    fixture.detectChanges();
    ask.click();
    expect(fake.requestAccess).toHaveBeenCalledWith(1010, 'churn review', 7);
  });

  it('lets the owner or an admin correct a column, set the sensitivity and end a grant', () => {
    const { el, fake, changed } = panel({ canEdit: true });
    const select = el.querySelector('select#tag-region') as HTMLSelectElement;
    select.value = 'address';
    select.dispatchEvent(new Event('change'));
    expect(fake.tag).toHaveBeenCalledWith(1010, 'region', ['address']);
    expect(changed).toHaveBeenCalled();
    const level = el.querySelector('[data-classify]') as HTMLSelectElement;
    level.value = 'Restricted';
    level.dispatchEvent(new Event('change'));
    expect(fake.classify).toHaveBeenCalledWith(1010, 'Restricted');
    expect(el.querySelector('[data-grant="1000"]')?.textContent).toContain('alex');
    (el.querySelector('[data-grant="1000"] button') as HTMLButtonElement).click();
    expect(fake.revokeAccess).toHaveBeenCalledWith(1000);
  });
});

describe('Data Catalog model', () => {
  it('says how fresh an asset is from the server clock', () => {
    const now = new Date('2026-10-01T05:00:00Z');
    expect(freshnessText('2026-09-30T23:50:00', now)).toBe('10 min');
    expect(freshnessText('2026-09-30T20:00:00', now)).toBe('4 h');
    expect(freshnessText('2026-09-20T23:00:00', now)).toBe('10 days');
    expect(freshnessText(null, now)).toBe('—');
  });

  it('reads the lineage as what comes before and after, nearest next to the asset', () => {
    const { upstream, downstream } = lineageSides(GRAPH);
    expect(upstream.map(n => n.name)).toEqual(['in.csv', 'Clean-up job', 'out.json']);
    expect(downstream.map(n => n.name)).toEqual(['Customer health']);
    expect(lineageSides(null)).toEqual({ upstream: [], downstream: [] });
  });

  it('names a document type by where it comes from', () => {
    expect(whereText({ ...ASSETS[0], kind: 'document_type', rowCount: 12 })).toBe('Document Intelligence · 12 rows');
  });
});
