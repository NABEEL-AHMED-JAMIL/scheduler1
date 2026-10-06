import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of } from 'rxjs';
import { ColumnCard } from './column-card';
import { AnalyticsService } from './analytics.service';

/**
 * One column's card: what it can be drawn as, and what it refuses to draw.
 *
 * These moved here with the card itself. They were written against the studio component when the
 * distribution lived there, and the card owning its own measurement is what let the SAME card be
 * opened from a Compact row -- so the tests follow the code rather than reaching back into a
 * parent that no longer holds any of it.
 *
 * The gate is the interesting half. A ring and a line each make a CLAIM, and each claim is false
 * for one of the two distributions the server produces.
 *
 * @author Nabeel Ahmed
 */

const CATEGORIES = {
  name: 'col', exactValues: true,
  bins: [{ value: 'North', rows: 9 }, { value: 'South', rows: 3 }],
};
const BINNED = {
  name: 'col', exactValues: false,
  bins: [{ from: '0', to: '10', rows: 4 }, { from: '10', to: '20', rows: 7 },
         { from: '20', to: '30', rows: 2 }],
};

function cardWith(measured: unknown) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AnalyticsService, useValue: {
        distribution: () => of({ status: 'SUCCESS', message: '', data: measured }),
      } },
    ],
  });
  const fixture = TestBed.createComponent(ColumnCard);
  fixture.componentRef.setInput('column', { name: 'col' });
  fixture.componentRef.setInput('connection', 'etl-bucket');
  fixture.componentRef.setInput('path', 'demo/orders.csv');
  const card = fixture.componentInstance;
  if (measured !== undefined) card.measure();
  return card;
}

const reasonFor = (card: ColumnCard, id: string) =>
  card.kinds().find(kind => kind.id === id)!.reason;

describe('measuring one column', () => {
  it('does not measure on creation — that is two statements against the file', () => {
    // A two-hundred-column file would open by firing two hundred of them at a four-permit
    // ceiling. Cost follows the click.
    const card = cardWith(undefined);
    expect(card.distribution()).toBeNull();
    expect(card.bars()).toEqual([]);
  });

  it('scales every bar against the tallest, not against the total', () => {
    expect(cardWith(BINNED).bars().map(b => b.percent)).toEqual([4 / 7 * 100, 100, 2 / 7 * 100]);
  });

  it('gives an empty bin no width at all', () => {
    // A gap in a distribution is where there are NO values. A sliver would draw a continuous
    // shape over a hole, which is the one thing a distribution must not do.
    const card = cardWith({ name: 'col', exactValues: false,
      bins: [{ from: '0', to: '10', rows: 4 }, { from: '10', to: '20', rows: 0 }] });
    expect(card.bars()[1].percent).toBe(0);
  });

  it('labels a binned bar by where it starts, and puts both edges in the tooltip', () => {
    const card = cardWith(BINNED);
    expect(card.bars().map(b => b.label)).toEqual(['0', '10', '20']);
    expect(card.bars()[0].title).toBe('0 to 10: 4 row(s)');
  });

  it('labels a value-by-value bar with the value itself', () => {
    expect(cardWith(CATEGORIES).bars().map(b => b.label)).toEqual(['North', 'South']);
  });

  it('reports a refusal from the server rather than drawing nothing silently', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AnalyticsService, useValue: {
          distribution: () => of({ status: 'ERROR', message: 'This dataset has no column called "x".' }),
        } },
      ],
    });
    const fixture = TestBed.createComponent(ColumnCard);
    fixture.componentRef.setInput('column', { name: 'x' });
    fixture.componentRef.setInput('connection', 'b');
    fixture.componentRef.setInput('path', 'p');
    fixture.componentInstance.measure();
    expect(fixture.componentInstance.error()).toContain('no column called');
    expect(fixture.componentInstance.distribution()).toBeNull();
  });

  it('does not measure the same column twice', () => {
    let calls = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AnalyticsService, useValue: {
          distribution: () => { calls++; return of({ status: 'SUCCESS', message: '', data: BINNED }); },
        } },
      ],
    });
    const fixture = TestBed.createComponent(ColumnCard);
    fixture.componentRef.setInput('column', { name: 'col' });
    fixture.componentRef.setInput('connection', 'b');
    fixture.componentRef.setInput('path', 'p');
    fixture.componentInstance.measure();
    fixture.componentInstance.measure();
    expect(calls).toBe(1);
  });
});

describe('which drawings a column can carry', () => {
  it('offers a ring for categories, which really are parts of a whole', () => {
    expect(reasonFor(cardWith(CATEGORIES), 'share')).toBe('');
  });

  it('refuses a ring over a numeric range, and says why', () => {
    // Equal-width bins are positions on an axis. A ring throws the axis away.
    expect(reasonFor(cardWith(BINNED), 'share')).toContain('positions on a numeric range');
  });

  it('refuses a ring with too many slices to read', () => {
    const many = { name: 'col', exactValues: true,
      bins: Array.from({ length: 12 }, (_, i) => ({ value: 'v' + i, rows: 1 })) };
    expect(reasonFor(cardWith(many), 'share')).toContain('harder to read');
  });

  it('offers a curve over binned values, where a line stands for values that exist', () => {
    expect(reasonFor(cardWith(BINNED), 'curve')).toBe('');
    expect(reasonFor(cardWith(BINNED), 'area')).toBe('');
  });

  it('refuses a curve over categories, which have no order but the sort', () => {
    expect(reasonFor(cardWith(CATEGORIES), 'curve')).toContain('draw the sort order');
  });

  it('always offers the bars and the counts, whatever the column is', () => {
    for (const measured of [CATEGORIES, BINNED]) {
      expect(reasonFor(cardWith(measured), 'bars')).toBe('');
      expect(reasonFor(cardWith(measured), 'table')).toBe('');
    }
  });

  it('defaults to the first kind the values can carry', () => {
    expect(cardWith(BINNED).kind()).toBe('bars');
  });

  it('remembers the kind a reader picked', () => {
    const card = cardWith(BINNED);
    card.chooseKind('curve');
    expect(card.kind()).toBe('curve');
  });

  it('shapes the same counts for a ring and for a curve', () => {
    const card = cardWith(BINNED);
    expect(card.slices()).toEqual([
      { name: '0', value: 4 }, { name: '10', value: 7 }, { name: '20', value: 2 }]);
    expect(card.points()).toEqual([
      { label: '0', value: 4 }, { label: '10', value: 7 }, { label: '20', value: 2 }]);
  });

  it('offers nothing at all for a column that was measured and had no values', () => {
    const card = cardWith({ name: 'col', exactValues: false, bins: [] });
    expect(card.kinds().every(kind => !!kind.reason)).toBe(true);
  });
});
