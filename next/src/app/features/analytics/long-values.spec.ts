import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of } from 'rxjs';
import { ColumnCard } from './column-card';
import { AnalyticsService } from './analytics.service';
import { WidgetTable, WidgetTableDialog } from './widget-table';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TITLE_MAX } from '../../shared/ui/long-text';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

/**
 * A ledger whose notes column runs to 20,000 characters a row (owner, 2026-09-28: "if text is big
 * in some csv the statistics or text not wrapping"). Opening that column's card made the Compact
 * table 5,043px wide, and a result table offered no way to read a value it had cut short.
 *
 * The test DOM does no layout, so what is pinned is what decides the layout: every one of these
 * values is drawn by app-data-text (clamped, wrapping anywhere, tooltip capped) and never by a
 * one-line `truncate` or `whitespace-nowrap` box, whose width is the length of the value. The rest
 * is behaviour: "Show all" is there and opens the whole value.
 */

const NOTE = 'Remittance advice received from vendor; reconciled against purchase order. '.repeat(300).slice(0, 20_000);

afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach(node => node.remove()));
useMemoryStorage();

/** A text column as the profile scan describes one, first and last being two whole notes. */
function textColumn() {
  return {
    name: 'notes', type: 'VARCHAR', shortType: 'VARCHAR', text: true, rows: 2000, measured: true,
    filledPercent: 100, nullPercent: 0, approxNullRows: 0, approxDistinct: 1990, distinctPercent: 99.5,
    allNull: false, constant: false, typeSurprise: null, keyLike: true,
    min: 'A' + NOTE, max: 'Z' + NOTE, avg: null, std: null,
    minLabel: 'A' + NOTE, maxLabel: 'Z' + NOTE, avgLabel: '', stdLabel: '',
    q25Label: '', medianLabel: '', q75Label: '', spread: [], spreadSummary: '',
  };
}

function card(kind?: 'table') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AnalyticsService, useValue: {
        distribution: () => of({ status: 'SUCCESS', message: '', data: {
          name: 'notes', exactValues: true, mostCommon: NOTE, mostCommonRows: 3,
          bins: [{ value: NOTE, rows: 3 }, { value: 'short', rows: 1 }],
        } }),
      } },
    ],
  });
  const fixture = TestBed.createComponent(ColumnCard);
  fixture.componentRef.setInput('column', textColumn());
  fixture.componentRef.setInput('connection', 'etl-bucket');
  fixture.componentRef.setInput('path', 'ledger.csv');
  fixture.componentInstance.measure();
  if (kind) fixture.componentInstance.chooseKind(kind);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

/** Every element whose own text holds the note and whose box would be as long as it. */
function unwrappedBoxes(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('*')].filter(node =>
    [...node.childNodes].some(child => child.nodeType === 3 && (child.textContent ?? '').length > 200)
    && (node.classList.contains('truncate') || node.classList.contains('whitespace-nowrap')));
}

describe('a column card over 20,000-character values', () => {
  it('draws first and last (A–Z) as data text, three lines at most', () => {
    const { host } = card();
    const values = [...host.querySelectorAll<HTMLElement>('dl app-data-text')];
    expect(values.length).toBe(2);
    for (const value of values) {
      expect(value.style.getPropertyValue('--data-text-lines')).toBe('3');
      expect(value.querySelector('.data-text-value')!.getAttribute('title')!.length).toBeLessThanOrEqual(TITLE_MAX + 1);
      expect(value.querySelector('.data-text-more')).not.toBeNull();
    }
  });

  it('draws the most common value as data text, three lines at most', () => {
    const { host } = card();
    const common = host.querySelector<HTMLElement>('[data-most-common] app-data-text')!;
    expect(common).not.toBeNull();
    expect(common.style.getPropertyValue('--data-text-lines')).toBe('3');
    expect(common.querySelector('.data-text-more')).not.toBeNull();
  });

  it('labels each bar with data text, so a long value keeps to its slot', () => {
    const { host } = card();
    const labels = host.querySelectorAll('app-data-text[data-bar-label]');
    expect(labels.length).toBe(2);
    // The long one offers the whole value; the short one needs nothing.
    expect(labels[0].querySelector('.data-text-more')).not.toBeNull();
    expect(labels[1].querySelector('.data-text-more')).toBeNull();
  });

  it('draws the counts table\'s values as data text too', () => {
    const { host } = card('table');
    expect(host.querySelectorAll('table app-data-text').length).toBe(2);
  });

  it('prints no value in a one-line box as wide as the value', () => {
    expect(unwrappedBoxes(card().host)).toEqual([]);
    expect(unwrappedBoxes(card('table').host)).toEqual([]);
  });

  it('caps every tooltip on the card', () => {
    const { host } = card();
    for (const node of host.querySelectorAll('[title]')) {
      expect(node.getAttribute('title')!.length, node.outerHTML.slice(0, 80)).toBeLessThanOrEqual(TITLE_MAX + 40);
    }
  });

  it('opens the whole of "first (A–Z)" in the side panel', async () => {
    const { fixture, host } = card();
    host.querySelector<HTMLButtonElement>('dl .data-text-more')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const panel = document.querySelector('app-data-text-panel')!;
    expect(panel.querySelector('.data-text-full')!.textContent).toBe('A' + NOTE);
    expect(panel.textContent).toContain('20,001 characters');
    expect(panel.textContent).toContain('notes');
  });
});

function table(rows: (string | null)[][], columns = ['notes', 'n'], wrap = false) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] })
    .createComponent(WidgetTable);
  fixture.componentRef.setInput('columns', columns);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('measureColumn', [false, true]);
  fixture.componentRef.setInput('wrap', wrap);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('a table widget over 20,000-character values', () => {
  it('clamps each cell to one line and caps its tooltip', () => {
    const { host } = table([[NOTE, '3'], ['short', '1']]);
    const cell = host.querySelector<HTMLElement>('tbody td app-data-text')!;
    expect(cell.style.getPropertyValue('--data-text-lines')).toBe('1');
    expect(cell.querySelector('.data-text-value')!.getAttribute('title')!.length).toBeLessThanOrEqual(TITLE_MAX + 1);
    expect(unwrappedBoxes(host)).toEqual([]);
  });

  it('offers "Show all" on the long value and opens it whole', async () => {
    const { fixture, host } = table([[NOTE, '3'], ['short', '1']]);
    const more = host.querySelectorAll<HTMLButtonElement>('.data-text-more');
    expect(more.length).toBe(1);
    more[0].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('app-data-text-panel .data-text-full')!.textContent).toBe(NOTE);
  });

  it('keeps the unrounded figure in a measure cell\'s tooltip', () => {
    const { host } = table([['a', '103909527.57999787']]);
    const figure = host.querySelectorAll('tbody td .data-text-value')[1];
    expect(figure.getAttribute('title')).toBe('103909527.57999787');
  });

  it('shows more lines of each value when wrapping is on', () => {
    const { host } = table([[NOTE, '3']], ['notes', 'n'], true);
    const lines = Number(host.querySelector<HTMLElement>('tbody td app-data-text')!.style.getPropertyValue('--data-text-lines'));
    expect(lines).toBeGreaterThan(1);
  });

  it('draws a null as a dash, not as data text', () => {
    const { host } = table([[null, '1']]);
    expect(host.querySelector('tbody td')!.textContent!.trim()).toBe('—');
  });
});

describe('the expanded table', () => {
  function dialog(fresh: boolean) {
    TestBed.resetTestingModule();
    if (fresh) localStorage.removeItem('etl.grid.result:widget-table');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: DialogRef, useValue: { close: () => {} } },
        { provide: DIALOG_DATA, useValue: {
          title: 'Notes', columns: ['notes', 'n'], rows: [[NOTE, '3']], measureColumn: [false, true],
          rowCount: 1, truncated: false, notes: [],
        } },
      ],
    });
    const fixture = TestBed.createComponent(WidgetTableDialog);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const wrap = () => [...host.querySelectorAll('button')].find(b => /Wrap text/.test(b.textContent ?? ''))!;
    const lines = () => Number(host.querySelector<HTMLElement>('tbody app-data-text')!.style.getPropertyValue('--data-text-lines'));
    return { fixture, wrap, lines };
  }

  it('has the Data grid\'s "Wrap text" switch, off by default', () => {
    const { wrap, lines } = dialog(true);
    expect(wrap().getAttribute('aria-pressed')).toBe('false');
    expect(lines()).toBe(1);
  });

  it('wraps the values when it is switched on, and remembers that for the next table', () => {
    const first = dialog(true);
    first.wrap().click();
    first.fixture.detectChanges();
    expect(first.wrap().getAttribute('aria-pressed')).toBe('true');
    expect(first.lines()).toBeGreaterThan(1);

    const again = dialog(false);
    expect(again.wrap().getAttribute('aria-pressed')).toBe('true');
    expect(again.lines()).toBeGreaterThan(1);
  });
});
