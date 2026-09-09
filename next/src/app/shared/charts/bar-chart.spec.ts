import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { BarChart, Bar } from './bar-chart';

@Component({ imports: [BarChart], template: `<app-bar-chart [data]="data()" [height]="104" />` })
class Host { readonly data = signal<Bar[]>([]); }

function barsFor(data: Bar[]) {
  // Reset first: configureTestingModule throws once the module has been instantiated, so a
  // test that measures several bar counts could not otherwise call this more than once.
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.data.set(data);
  fixture.detectChanges();
  const chart = fixture.debugElement.children[0].componentInstance as BarChart;
  return chart.bars();
}

describe('BarChart scaling', () => {
  it('scales linearly, so a bar twice as long means twice the value', () => {
    const [a, b] = barsFor([{ name: 'x', value: 100 }, { name: 'y', value: 50 }]);
    expect(b.px / a.px).toBeCloseTo(0.5, 1);
  });

  it('gives the largest value the full track', () => {
    // height 104 leaves 72px once the value and label lines are reserved
    expect(barsFor([{ name: 'x', value: 8 }])[0].px).toBe(72);
  });

  it('keeps a tiny value visible beside a huge one', () => {
    // The case that used to justify a square-root scale: 1 against 168.
    const bars = barsFor([{ name: 'a', value: 168 }, { name: 'b', value: 86 }, { name: 'c', value: 1 }]);
    expect(bars[2].px).toBeGreaterThanOrEqual(3);
    // ...without inflating the middle bar, which sqrt pushed from 37px to 52px
    expect(bars[1].px).toBeCloseTo(37, 0);
  });

  it('draws nothing for zero', () => {
    expect(barsFor([{ name: 'a', value: 5 }, { name: 'b', value: 0 }])[1].px).toBe(0);
  });

  // Changed deliberately: this used to assert []. An all-zero series is a real answer and a
  // different one from "no data" -- jobs.ts rounds a sub-minute run to 0.0 minutes, so a job
  // whose runs were all fast hit the empty state and printed "nothing to show" directly beside
  // a caption saying those runs exist. The bars are now drawn flat, with the axis intact.
  it('still draws the axis when every value is zero, rather than claiming there is no data', () => {
    const bars = barsFor([{ name: 'a', value: 0 }, { name: 'b', value: 0 }]);
    expect(bars).toHaveLength(2);
    expect(bars.map(b => b.px)).toEqual([0, 0]);
    expect(bars[0].labelled).toBe(true);
  });

  it('draws no bars only when there is genuinely no data', () => {
    expect(barsFor([])).toEqual([]);
  });

  it('labels only the first bar of a repeated run', () => {
    // 24 hourly bars from one day would otherwise all read "Aug 19" truncated to "A..."
    const bars = barsFor([
      { name: 'Aug 19', value: 1 }, { name: 'Aug 19', value: 2 },
      { name: 'Aug 20', value: 3 }, { name: 'Aug 20', value: 4 },
    ]);
    expect(bars.map(b => b.newGroup)).toEqual([true, false, true, false]);
  });
});

describe('BarChart axis labels', () => {
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `09-${String(i + 1).padStart(2, '0')}`, value: i }));

  /**
   * The defect the labels were rewritten for: the old rule pinned the last index on top of a
   * modulo grid that knew nothing about it, so 31 bars labelled index 28 AND index 30 -- two
   * bars apart, 28px, under a 30px label. It rendered as "09-0609-08".
   */
  it('spaces every labelled pair evenly, so no two labels can collide', () => {
    for (const count of [17, 20, 24, 25, 30, 31, 45, 60, 91, 180, 366]) {
      const at = barsFor(days(count))
        .map((bar, index) => ({ bar, index }))
        .filter(x => x.bar.labelled)
        .map(x => x.index);
      const gaps = at.slice(1).map((index, i) => index - at[i]);
      if (!gaps.length) continue;
      // Every gap is the chosen stride except the final one, which is at least that wide.
      // That invariant is what the old rule broke: with 31 bars it produced gaps of
      // 4,4,4,4,4,4,4,2 -- the trailing 2 being index 28 against the forced index 30.
      const stride = gaps[0];
      const interior = gaps.slice(0, -1);
      expect(interior.every(g => g === stride), `${count} bars gave gaps ${gaps}`).toBe(true);
      expect(gaps[gaps.length - 1], `${count} bars gave gaps ${gaps}`).toBeGreaterThanOrEqual(stride);
    }
  });

  it('always bounds the axis: the first and last bars carry a label', () => {
    for (const count of [1, 2, 5, 17, 31, 200]) {
      const bars = barsFor(days(count));
      expect(bars[0].labelled, `${count} bars`).toBe(true);
      expect(bars[bars.length - 1].labelled, `${count} bars`).toBe(true);
    }
  });

  it('anchors the outer labels inward so they do not hang off the card', () => {
    const bars = barsFor(days(31));
    expect(bars[0].align).toBe('start');
    expect(bars[30].align).toBe('end');
    expect(bars.filter(b => b.labelled).slice(1, -1).every(b => b.align === 'center')).toBe(true);
  });

  /**
   * Labels used to be drawn only when newGroup AND labelled were both true, and the two rules
   * were computed independently. On job history -- 24 runs whose names are dates, ten on one
   * day and fourteen on the next -- the intersection was a single index, so the axis carried
   * exactly one label.
   */
  it('labels each run of repeated names once, instead of intersecting two unrelated rules', () => {
    const data = [
      ...Array.from({ length: 10 }, () => ({ name: '7 Sep', value: 1 })),
      ...Array.from({ length: 14 }, () => ({ name: '8 Sep', value: 2 })),
    ];
    const bars = barsFor(data);
    const labelled = bars.filter(b => b.labelled);
    expect(labelled).toHaveLength(2);
    expect(labelled.map(b => b.name)).toEqual(['7 Sep', '8 Sep']);
  });
});
