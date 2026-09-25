import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Heatmap } from './heatmap';

/**
 * The shade a cell is painted, and the one property it must never lose: being visible.
 *
 * There was no test on this component at all, and the scale was written as a mix of
 * --color-brand-500 with transparent. The monochrome rebrand later made that token a near-black,
 * so on the dark theme every intensity composited to the same black square over a near-black page
 * -- the entire grid AND its Less-to-More legend rendered as nothing, under a caption reporting
 * "Busiest hour: 83 runs".
 *
 * A unit test cannot see a colour. What it can do is pin the two things that made the failure
 * possible: that the scale reads a token defined per THEME rather than one that happens to be
 * near-black in both, and that intensity actually varies with the value.
 */
@Component({
  imports: [Heatmap],
  template: `<app-heatmap [data]="data()" />`,
})
class Host {
  readonly data = signal<{ day: string; hour: number; value: number; key?: string }[]>([]);
}

function heatmapWith(cells: { day: string; hour: number; value: number }[]): Heatmap {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.data.set(cells);
  fixture.detectChanges();
  return fixture.debugElement.children[0].componentInstance as Heatmap;
}

describe('how busy an hour looks', () => {

  const week = [
    { day: 'Monday', hour: 9, value: 1 },
    { day: 'Monday', hour: 10, value: 40 },
    { day: 'Tuesday', hour: 11, value: 83 },
  ];

  it('paints from a token that each theme defines for itself', () => {
    // --color-brand-500 is a near-black on BOTH themes since the rebrand, which is why it could
    // not carry a heat scale on a dark ground. --heat is redefined under html.dark.
    const shade = heatmapWith(week).background(40);
    expect(shade).toContain('var(--heat)');
    expect(shade).not.toContain('--color-brand-500');
  });

  it('gets stronger as the hour gets busier', () => {
    const heatmap = heatmapWith(week);
    const percentOf = (value: number) => Number(/(\d+)%/.exec(heatmap.background(value))![1]);

    expect(percentOf(1)).toBeLessThan(percentOf(40));
    expect(percentOf(40)).toBeLessThan(percentOf(83));
    // The busiest hour is the full-strength end of the scale, so the ramp uses its whole range.
    expect(percentOf(83)).toBe(100);
  });

  it('keeps the quietest hour distinguishable from an empty one', () => {
    // The reason the scale is square-rooted: with one hour at 83 and another at 1, a linear ramp
    // puts the quiet hour at 1% and it reads as "nothing happened" -- which is a different claim.
    const heatmap = heatmapWith(week);
    expect(heatmap.background(0)).toBe('var(--surface-sunken)');
    expect(percentIn(heatmap.background(1))).toBeGreaterThan(15);
  });

  function percentIn(shade: string): number {
    return Number(/(\d+)%/.exec(shade)![1]);
  }
});

/**
 * Over more than a week the same weekday and hour comes round again, and each later date replaced
 * the one before: four Thursdays at 10pm with 4, 11, 8 and 5 runs drew 5, and "Busiest hour" was
 * read from the raw cells, so it could name a figure no drawn cell showed.
 */
describe('a range longer than a week', () => {
  const thursdays = [
    { day: 'Thursday', hour: 22, value: 4, key: '2026-09-03' },
    { day: 'Thursday', hour: 22, value: 11, key: '2026-09-10' },
    { day: 'Thursday', hour: 22, value: 8, key: '2026-09-17' },
    { day: 'Thursday', hour: 22, value: 5, key: '2026-09-24' },
    { day: 'Thursday', hour: 9, value: 0, key: '2026-09-24' },
  ];

  it('adds up the runs of every date that falls on the same weekday and hour', () => {
    const heatmap = heatmapWith(thursdays);
    const cell = heatmap.rows()[0].cells[22];
    expect(cell.value).toBe(28);
    expect(cell.keys).toEqual(['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24']);
  });

  it('reads the busiest hour from the cells it draws', () => {
    const heatmap = heatmapWith(thursdays);
    expect(heatmap.max()).toBe(28);
  });

  it('says how many dates a cell covers', () => {
    const heatmap = heatmapWith(thursdays);
    expect(heatmap.tooltip('Thursday', heatmap.rows()[0].cells[22])).toBe('Thursday 10p — 28 runs across 4 dates');
  });

  it('keeps one date as the cell key when only one date is in it', () => {
    const heatmap = heatmapWith([{ day: 'Monday', hour: 9, value: 3, key: '2026-09-21' }] as never);
    const cell = heatmap.rows()[0].cells[9];
    expect(cell.key).toBe('2026-09-21');
    expect(cell.keys).toEqual(['2026-09-21']);
    expect(heatmap.tooltip('Monday', cell)).toBe('Monday 9a — 3 runs');
  });
});
