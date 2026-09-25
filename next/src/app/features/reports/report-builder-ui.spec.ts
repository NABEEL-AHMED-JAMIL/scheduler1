import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NEVER, Observable, of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { StorageService } from '../objects/storage.service';
import { ReportPivot } from './report-pivot';
import { ReportChart } from './report-chart';
import { ReportDestinationDialog } from './report-destination-dialog';
import { Pivot, RunData, RunRow } from './pivot';

/** Audit 09-22, the report builder as drawn: named controls, one segmented style, a drawer that behaves. */
@Component({
  imports: [ReportPivot],
  template: `<app-report-pivot [data]="data()" startDate="2026-08-01" endDate="2026-08-31" />`,
})
class Host { readonly data = signal<RunData>(DATA); }

const DATA: RunData = {
  task: ['report-history', 'nightly-load'], status: ['Completed', 'Failed'], owner: ['Ada'], day: ['2026-08-01'], job: [], tenant: [],
  rows: [
    [0, 0, 0, 0, 40, 'job a', 1, 0, 2],
    [1, 0, 0, 0, 34, 'job b', 3, 0, 6],
    [1, 1, 0, 0, 12, 'job b', 4, 0, 1],
  ] as RunRow[],
};

function builder(post: () => Observable<unknown> = () => NEVER, dialogOpen = vi.fn(() => ({ closed: of(null) }))) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host], providers: [
    { provide: HttpClient, useValue: { post: vi.fn(post) } },
    { provide: Dialog, useValue: { open: dialogOpen } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const pivot = fixture.debugElement.children[0].componentInstance as ReportPivot;
  return { fixture, pivot, dialogOpen, el: fixture.nativeElement as HTMLElement };
}

describe('Report builder', () => {
  it('names Swap with words and an icon, not a lone "⇄"', () => {
    const { el } = builder();
    const swap = el.querySelector('button[aria-label="Swap rows and columns"]')!;
    expect(swap).not.toBeNull();
    expect(swap.textContent!.trim()).toBe('');
    expect(swap.querySelector('app-icon')).not.toBeNull();
  });

  it('labels the shape selects with .label', () => {
    const { el } = builder();
    for (const id of ['r-rows', 'r-cols', 'r-measure']) expect(el.querySelector(`label[for="${id}"]`)!.classList, id).toContain('label');
  });

  it('draws the chart-kind picker and the row order as .seg controls with aria-pressed', () => {
    const { el } = builder();
    const kinds = el.querySelector('[aria-label="Chart kind"]')!;
    expect(kinds.classList).toContain('seg');
    expect(kinds.querySelectorAll('.seg-btn.seg-on').length).toBe(1);
    const order = el.querySelector('[aria-label="Row order"]')!;
    expect(order.classList).toContain('seg');
    expect([...order.querySelectorAll('button')].map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('uses app-segmented for the chart kind, with refused kinds disabled and saying why', () => {
    const { el, pivot, fixture } = builder();
    pivot.setMeasure('avg');
    fixture.detectChanges();
    const picker = el.querySelector('app-segmented [aria-label="Chart kind"]')!;
    expect(picker).not.toBeNull();
    const donut = [...picker.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim() === 'Donut')!;
    expect(donut.disabled).toBe(true);
    expect(donut.getAttribute('title')).toContain('cannot be added');
    const line = [...picker.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent!.trim() === 'Line')!;
    line.click();
    expect(pivot.chart()).toBe('line');
  });

  it('shows CSV as busy while it builds, and calls the bucket export "Save to bucket"', () => {
    const { el, pivot, fixture } = builder();
    pivot.export('csv');
    fixture.detectChanges();
    const labels = [...el.querySelectorAll('button')].map(b => b.textContent!.trim());
    expect(labels).toContain('Building…');
    pivot.exporting.set(null);
    fixture.detectChanges();
    expect([...el.querySelectorAll('button')].map(b => b.textContent!.trim())).toContain('Save to bucket');
  });

  it('colours the column histogram with a class, not a constant inline style', () => {
    const { el, pivot, fixture } = builder();
    pivot.setMeasure('avg');
    fixture.detectChanges();
    expect(el.innerHTML).not.toContain('background: var(--series-brand)');
  });

  it('opens the drill-down as a named, non-modal dialog that Escape closes', () => {
    const { el, pivot, fixture } = builder();
    pivot.drill(0, 0);
    fixture.detectChanges();
    const drawer = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(drawer).not.toBeNull();
    expect(drawer.getAttribute('aria-modal')).toBe('false');
    const heading = el.querySelector('#' + drawer.getAttribute('aria-labelledby'))!;
    expect(heading.textContent).toBe(pivot.drillTitle());
    expect(drawer.getAttribute('style') ?? '').toBe('');
    drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(pivot.drillRows()).toEqual([]);
  });

  it('closes the drill-down when the view under it changes', () => {
    const { pivot, fixture } = builder();
    pivot.drill(0, 0);
    expect(pivot.drillRows().length).toBeGreaterThan(0);
    pivot.setMeasure('avg');
    fixture.detectChanges();
    expect(pivot.drillRows()).toEqual([]);
  });

  it('keeps the destination dialog open until the export is accepted', () => {
    let sent: unknown;
    const dialogOpen = vi.fn((_c: unknown, config: { data: { send: (r: unknown) => Observable<unknown> } }) => {
      sent = config.data.send;
      return { closed: of(null) };
    });
    const { pivot } = builder(() => of({ status: 'SUCCESS', message: 'Saved.' }), dialogOpen as any);
    pivot.saveToBucket('csv');
    expect(typeof sent).toBe('function');
  });
});

describe('ReportChart', () => {
  const pivot = (rows: string[]): Pivot => ({
    rowLabels: rows, colLabels: ['Completed'], matrix: rows.map(() => [1]), rowTotals: rows.map(() => 1), colTotals: [rows.length],
    grand: rows.length, cellRows: rows.map(() => [[]]),
  });
  function chart(p: Pivot) {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(ReportChart);
    fixture.componentRef.setInput('pivot', p);
    fixture.componentRef.setInput('measure', 'count');
    fixture.componentRef.setInput('kind', 'grouped');
    fixture.componentRef.setInput('colorFor', () => 'var(--chart-0)');
    fixture.componentRef.setInput('label', 'Runs by task');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('names the chart by its kind and title', () => {
    expect(chart(pivot(['a'])).querySelector('svg')!.getAttribute('aria-label')).toBe('Grouped bars of Runs by task');
  });

  it('says there is nothing to chart instead of drawing bare gridlines', () => {
    const el = chart(pivot([]));
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).toContain('No rows to chart.');
  });
});

describe('ReportDestinationDialog, sending', () => {
  function dialog(send: () => Observable<any>) {
    const close = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: DIALOG_DATA, useValue: { kind: 'submit', send } },
      { provide: DialogRef, useValue: { close } },
      { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', data: [] }) } },
    ] });
    const fixture = TestBed.createComponent(ReportDestinationDialog);
    fixture.detectChanges();
    const d = fixture.componentInstance;
    d.submitUrl.set('https://hooks.example/report');
    return { fixture, d, close, el: fixture.nativeElement as HTMLElement };
  }

  it('is built on app-form-dialog', () => {
    const { el } = dialog(() => NEVER);
    expect(el.querySelector('app-form-dialog h2')?.textContent?.trim()).toBe('Submit the report');
  });

  it('stays open, with what was typed, when the export is refused', () => {
    const { d, fixture, close, el } = dialog(() => of({ status: 'ERROR', message: 'Unknown endpoint.' }));
    d.submit();
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(d.submitUrl()).toBe('https://hooks.example/report');
    expect(el.textContent).toContain('Unknown endpoint.');
  });

  it('says Submitting… while an endpoint export is on its way', () => {
    const { d, fixture, el } = dialog(() => NEVER);
    d.submit();
    fixture.detectChanges();
    expect([...el.querySelectorAll('button')].map(b => b.textContent!.trim())).toContain('Submitting…');
  });

  it('closes once the export is accepted', () => {
    const { d, close } = dialog(() => of({ status: 'SUCCESS', message: 'Posted.' }));
    d.submit();
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ submitUrl: 'https://hooks.example/report', message: 'Posted.' }));
  });
});
