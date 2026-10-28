import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RatePreviewView } from './rate-preview';
import { RatePreview } from './billing.service';

/** Owner 2026-10-27 ("add a sort on each table"): a draft's preview sorts its workspaces and the lines that change. */
const ws = (tenantId: number, tenantName: string, current: number, draft: number) => ({
  tenantId, tenantName, zone: 'America/Chicago', currentVersion: 2, currentName: 'Standard', current, draft, difference: draft - current, invoice: null,
  changes: [
    { meter: 'seats.user_days', label: 'Seats', service: 'Seats', quantity: 10, current: 1, draft: 2, difference: 1, currentUnitPrice: 0.1, draftUnitPrice: 0.2, rules: [] },
    { meter: 'ai.tokens.in', label: 'Model tokens in', service: 'Model calls', quantity: 4000, current: 3, draft: 1, difference: -2, currentUnitPrice: 0.05, draftUnitPrice: 0.02, rules: [] },
  ],
});
const PREVIEW = {
  period: '2026-09', tenantId: null, current: 9, draft: 8, difference: -1, onOwnCard: 0, rules: [],
  workspaces: [ws(1, 'Riverside', 5, 3), ws(2, 'Meridian', 4, 5)],
} as unknown as RatePreview;

function view() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(RatePreviewView);
  fixture.componentRef.setInput('preview', PREVIEW);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('RatePreviewView -- sorting', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it('keeps the meter order until a heading is picked, then sorts the workspaces by difference both ways', () => {
    const preview = view();
    expect(preview.workspaces().map(w => w.tenantId)).toEqual([1, 2]);
    preview.sort.toggle('difference');
    expect(preview.workspaces().map(w => w.tenantId)).toEqual([2, 1]);
    preview.sort.toggle('difference');
    expect(preview.workspaces().map(w => w.tenantId)).toEqual([1, 2]);
  });

  it('sorts the workspaces by name A to Z', () => {
    const preview = view();
    preview.sort.toggle('workspace');
    expect(preview.workspaces().map(w => w.tenantName)).toEqual(['Meridian', 'Riverside']);
  });

  it('sorts the lines that change by quantity', () => {
    const preview = view();
    const changes = PREVIEW.workspaces[0].changes;
    preview.changeSort.toggle('quantity');
    expect(preview.changeSort.apply(changes).map(c => c.meter)).toEqual(['ai.tokens.in', 'seats.user_days']);
    preview.changeSort.toggle('quantity');
    expect(preview.changeSort.apply(changes).map(c => c.meter)).toEqual(['seats.user_days', 'ai.tokens.in']);
  });
});
