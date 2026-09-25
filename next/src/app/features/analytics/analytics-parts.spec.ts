import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, ViewChild } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { FilterBuilder, emptyFilterGroup } from './filter-builder';
import { DatasetOverview } from './dataset-overview';
import { WidgetTable, WidgetTableDialog } from './widget-table';
import { AnalyticsService, DatasetColumn, FilterGroup } from './analytics.service';
import { API_SUCCESS } from '../../core/api/api.config';

/** Audit 09-22: the Studio's smaller pieces drawn to the console pattern. */

const COLUMNS: DatasetColumn[] = [{ name: 'region', type: 'VARCHAR' }, { name: 'amount', type: 'DECIMAL(18,3)' }];

function builder(model: FilterGroup, depth = 0) {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(FilterBuilder);
  fixture.componentRef.setInput('model', model);
  fixture.componentRef.setInput('columns', COLUMNS);
  if (depth) fixture.componentRef.setInput('depth', depth);
  const emitted: FilterGroup[] = [];
  fixture.componentInstance.changed.subscribe(g => emitted.push(g));
  fixture.detectChanges();
  return { fixture, emitted, el: fixture.nativeElement as HTMLElement };
}

describe('FilterBuilder', () => {
  it('draws AND / OR as the segmented control, with a group label and pressed state', () => {
    const { el, emitted, fixture } = builder(emptyFilterGroup());
    const seg = el.querySelector('[aria-label="Match"]')!;
    expect(seg.classList).toContain('seg');
    const [and, or] = [...seg.querySelectorAll('button')];
    expect(and.getAttribute('aria-pressed')).toBe('true');
    or.click();
    fixture.detectChanges();
    expect(emitted.at(-1)!.op).toBe('OR');
  });

  it('names the group remover', () => {
    const { el } = builder(emptyFilterGroup(), 1);
    expect(el.querySelector('button[aria-label="Remove this group and everything in it"]')).not.toBeNull();
  });
});

@Component({ imports: [DatasetOverview], template: `<app-dataset-overview connection="c" path="p.csv" [sizeBytes]="2048" modified="1 Sep" />` })
class OverviewHost { @ViewChild(DatasetOverview) overview!: DatasetOverview; }

describe('DatasetOverview', () => {
  function overview() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [OverviewHost], providers: [provideRouter([]),
      { provide: AnalyticsService, useValue: { overview: () => of({ status: API_SUCCESS, data: {
        durationMs: 5, charts: [{ kind: 'topValues', title: 'Rows by region', question: 'q', column: 'region', rows: [{ label: 'north', rows: 3 }] }],
        profile: { bucket: 'b', path: 'p', format: 'CSV', multiFile: false, totalRows: 3, columns: [
          { name: 'region', type: 'VARCHAR', nullPercentage: 0, completeness: 100 }] } } }) } }] });
    const fixture = TestBed.createComponent(OverviewHost);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('does not repeat the figures the dataset strip already shows; keeps Complete', () => {
    const { el } = overview();
    const labels = [...el.querySelectorAll('app-stat-tile')].map(t => t.getAttribute('label') ?? t.textContent!);
    expect(labels.join(' ')).toContain('Complete');
    expect(labels.join(' ')).not.toMatch(/\bOn disk\b|\bRows\b|\bColumns\b/);
  });

  it('refreshes with the console Refresh button', () => {
    const { el } = overview();
    const refresh = [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Refresh')!;
    expect(refresh).toBeTruthy();
    expect(refresh.classList).toContain('btn-default');
  });
});

describe('WidgetTable', () => {
  it('is a .table-modern', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(WidgetTable);
    fixture.componentRef.setInput('columns', ['region', 'rows']);
    fixture.componentRef.setInput('rows', [['north', '3']]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('table')!.classList).toContain('table-modern');
  });

  it('marks a partial result in the dialog as a warning, not an error', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { title: 'Rows', truncated: true, notes: [], columns: ['a'], rows: [['1']], measureColumn: [false], rowCount: 1 } },
    ] });
    const fixture = TestBed.createComponent(WidgetTableDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const partial = [...el.querySelectorAll('.pill')].find(p => /partial/i.test(p.textContent!));
    expect(partial?.classList).toContain('pill-warn');
    const close = [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Close')!;
    expect(close.classList).toContain('btn-ghost');
  });
});
