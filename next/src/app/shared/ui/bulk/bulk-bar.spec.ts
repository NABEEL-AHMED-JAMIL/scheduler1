import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { BulkAnswer, BulkSelection } from './bulk.model';
import { BulkBar } from './bulk-bar';
import { BulkPanel } from './bulk-panel';

interface Row { id: number; }
const rows = (n: number, from = 1): Row[] => Array.from({ length: n }, (_, i) => ({ id: from + i }));
const DECIDED: BulkAnswer = { bulkId: 'b-1234567890', action: 'approve', dryRun: false, requested: 2, done: [{ id: 1 }, { id: 2 }], skipped: [], failed: [] };

function render(opts: { page?: Row[]; moreMatch?: boolean; total?: number | null; matching?: Row[]; answer?: BulkAnswer } = {}) {
  const selection = new BulkSelection<Row>({ idOf: r => r.id, noun: ['task', 'tasks'], groupNoun: 'workflow', send: vi.fn(),
    matching: () => of({ rows: opts.matching ?? rows(140), total: opts.total ?? null }) });
  const dialog = { open: vi.fn(() => ({ closed: of(opts.answer), componentInstance: null })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: Dialog, useValue: dialog }] });
  const fixture = TestBed.createComponent(BulkBar);
  fixture.componentRef.setInput('selection', selection);
  fixture.componentRef.setInput('pageRows', opts.page ?? rows(25));
  fixture.componentRef.setInput('moreMatch', opts.moreMatch ?? true);
  fixture.componentRef.setInput('matchTotal', opts.total ?? null);
  const decided = vi.fn();
  fixture.componentInstance.decided.subscribe(decided);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el.querySelector<HTMLElement>(sel);
  return { fixture, el, q, selection, dialog, decided, refresh: () => fixture.detectChanges() };
}

describe('BulkBar: "N selected · Reject · Approve · Clear"', () => {
  it('stays away until something is picked, then says how many, aloud too', () => {
    const { q, selection, refresh } = render();
    expect(q('[data-bulk-bar]')).toBeNull();
    selection.toggle({ id: 1 });
    refresh();
    expect(q('[data-bulk-count]')!.textContent!.trim()).toBe('1 selected');
    expect(q('[data-bulk-live]')!.textContent!.trim()).toBe('1 task selected.');
    expect(q('[data-bulk-bar]')!.getAttribute('role')).toBe('region');
    expect(q('[data-bulk-matching]')).toBeNull();
  });

  it('offers Select all matching only once the whole page is picked and more match, capped at 100', () => {
    const { q, selection, refresh } = render({ total: 340 });
    selection.setPage(rows(25), true);
    refresh();
    expect(q('[data-bulk-matching]')!.textContent!.trim()).toBe('Select the first 100 of 340 matching');
    q('[data-bulk-matching]')!.click();
    refresh();
    expect(selection.count()).toBe(100);
    expect(q('[data-bulk-matched]')!.textContent!.trim()).toBe('The first 100 of 340 matching are selected.');
  });

  it('names the total when it is under the cap, and offers nothing when nothing more matches', () => {
    const under = render({ total: 40, matching: rows(40) });
    under.selection.setPage(rows(25), true);
    under.refresh();
    expect(under.q('[data-bulk-matching]')!.textContent!.trim()).toBe('Select all 40 matching');
    under.q('[data-bulk-matching]')!.click();
    under.refresh();
    expect(under.q('[data-bulk-matched]')!.textContent!.trim()).toBe('All 40 matching are selected.');
    const all = render({ moreMatch: false });
    all.selection.setPage(rows(25), true);
    all.refresh();
    expect(all.q('[data-bulk-matching]')).toBeNull();
  });

  it('opens the confirm panel on the right with the picked rows, and hands a decision on, cleared', () => {
    const { q, selection, refresh, dialog, decided } = render({ answer: DECIDED });
    selection.setPage(rows(2), true);
    refresh();
    q('[data-bulk-approve]')!.click();
    expect(dialog.open).toHaveBeenCalledTimes(1);
    const [component, config] = dialog.open.mock.calls[0] as unknown as [unknown, { data: { action: string; rows: Row[] }; panelClass: string[] }];
    expect(component).toBe(BulkPanel);
    expect(config.data.action).toBe('approve');
    expect(config.data.rows.map(r => r.id)).toEqual([1, 2]);
    expect(config.panelClass).toContain('side-panel-right');
    expect(decided).toHaveBeenCalledWith(DECIDED);
    expect(selection.count()).toBe(0);
  });

  it('keeps the selection when the panel is cancelled, and Clear drops it', () => {
    const { q, selection, refresh, decided } = render();
    selection.setPage(rows(2), true);
    refresh();
    q('[data-bulk-reject]')!.click();
    expect(decided).not.toHaveBeenCalled();
    expect(selection.count()).toBe(2);
    q('[data-bulk-clear]')!.click();
    refresh();
    expect(selection.count()).toBe(0);
    expect(q('[data-bulk-bar]')).toBeNull();
  });
});
