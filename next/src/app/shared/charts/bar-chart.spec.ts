import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { BarChart, Bar } from './bar-chart';

@Component({
  imports: [BarChart],
  template: `<app-bar-chart [data]="data()" [height]="104" [format]="format()" />`,
})
class Host {
  readonly data = signal<Bar[]>([]);
  readonly format = signal<(value: number) => string>((value: number) => String(value));
}

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

describe('the key to a stack\'s colours', () => {
  /** The chart instance, so the legend it derives can be read directly. */
  function chartFor(data: Bar[]): BarChart {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.componentInstance.data.set(data);
    fixture.detectChanges();
    return fixture.debugElement.children[0].componentInstance as BarChart;
  }

  const stacked: Bar[] = [
    { name: 'north', value: 400, segments: [
      { label: 'shipped', value: 300, color: 'var(--chart-0)' },
      { label: 'returned', value: 100, color: 'var(--chart-1)' },
    ] },
    { name: 'south', value: 100, segments: [
      // Deliberately the other way round: the legend must key on the LABEL, not on position.
      { label: 'returned', value: 50, color: 'var(--chart-1)' },
      { label: 'shipped', value: 50, color: 'var(--chart-0)' },
    ] },
  ];

  it('names every category once, with the colour that category is drawn in', () => {
    // Without this the mapping existed only in each bar's title attribute: a mouse-only,
    // one-at-a-time affordance, so the chart encoded its second dimension in colour alone.
    expect((chartFor(stacked) as any).legend()).toEqual([
      { label: 'shipped', color: 'var(--chart-0)' },
      { label: 'returned', color: 'var(--chart-1)' },
    ]);
  });

  it('says nothing about a chart that has no segments to key', () => {
    // A plain bar chart labels its own bars, so a legend there would be a second copy of the
    // axis. It must cost that chart no space at all.
    expect((chartFor([{ name: 'x', value: 10 }, { name: 'y', value: 4 }]) as any).legend())
      .toEqual([]);
  });

  it('leaves out a category with nothing in it, which is what the stack draws', () => {
    // segments are filtered to value > 0 before they are drawn; a swatch for a band that is not
    // on the chart is a key to nothing.
    const withEmpty: Bar[] = [{ name: 'north', value: 300, segments: [
      { label: 'shipped', value: 300, color: 'var(--chart-0)' },
      { label: 'cancelled', value: 0, color: 'var(--chart-2)' },
    ] }];
    expect((chartFor(withEmpty) as any).legend()).toEqual([
      { label: 'shipped', color: 'var(--chart-0)' },
    ]);
  });
});

/**
 * A chart of a known pixel width, so the fit rules can be exercised at all.
 *
 * `measured` is set by a ResizeObserver and stays 0 under jsdom, which means every existing test
 * here runs the "not measured yet" fallback and none of them touches the width arithmetic. That
 * is how a chart could ship drawing twenty-four overlapping money labels across its own top edge.
 */
function chartAt(width: number, data: Bar[], format?: (value: number) => string) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.data.set(data);
  if (format) fixture.componentInstance.format.set(format);
  fixture.detectChanges();
  const chart = fixture.debugElement.children[0].componentInstance as BarChart;
  (chart as any).measured.set(width);
  fixture.detectChanges();
  return chart;
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

describe('whether a label fits where it is about to be drawn', () => {

  /** Twenty-four months of revenue, the shape that produced the smear. */
  const revenue: Bar[] = Array.from({ length: 24 }, (_, at) => ({
    name: `2024-${String((at % 12) + 1).padStart(2, '0')}`,
    value: 4_398_765.46 + at,
  }));

  it('falls back to the compact figure when the formatted value is wider than a bar', () => {
    // 900px over 24 bars is 37.5px of pitch, and "4,398,765.46" needs about 80. The old rule
    // asked only whether the pitch cleared a flat 22px, which is true of "4.4M" and of nothing
    // else -- so it drew all twenty-four on top of each other. Now the figure that does not fit
    // is written the compact way instead of withheld, and the full one stays in the hint.
    const chart = chartAt(900, revenue, money);
    expect((chart as any).showValues()).toBe(true);
    expect(chart.bars()[0].display).toBe('4.4M');
    expect(chart.bars()[0].hint).toContain(money(revenue[0].value));
  });

  it('withholds the figures when not even the compact form fits', () => {
    // 60 bars over 900px is 15px of pitch; "4.4M" needs 32.
    const many: Bar[] = Array.from({ length: 60 }, (_, at) => ({ name: 'd' + at, value: 4_398_765 - at }));
    const chart = chartAt(900, many, money);
    expect((chart as any).showValues()).toBe(false);
  });

  it('measures the pitch against the bar cap, not the column the bar could have had', () => {
    // Seven bars in a 930px pane: the column is 133px, but a bar is capped at 64px and its
    // label sits over the bar, so "14,791,928.89" (about 86px) cannot fit and the seven labels
    // ran into one another on a full-width dashboard tile.
    const week: Bar[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name, at) => ({ name, value: 14_791_928.89 + at }));
    const chart = chartAt(930, week, money);
    expect((chart as any).showValues()).toBe(true);
    expect(chart.bars()[0].display).toBe('14.8M');   // the tenth, because "15M" seven times says nothing
  });

  it('draws them when the SAME bars carry a value that does fit', () => {
    // The bars have not changed; only the formatter has. Whether a figure fits is a fact about
    // the string, which is the whole correction.
    const chart = chartAt(900, revenue, (n: number) => `${Math.round(n / 100_000) / 10}M`);
    expect((chart as any).showValues()).toBe(true);
  });

  it('thins the axis by the WIDEST label, not by an assumed one', () => {
    // Ten-character customer ids need about 68px; at 700px over 11 bars each slot is 63.6. The
    // flat 34px assumption drew every one of them, which is "CUST-00111 CUST-00319CUST-00315"
    // running together along the bottom of the Top-10 chart.
    const customers: Bar[] = Array.from({ length: 11 }, (_, at) => ({
      name: `CUST-00${String(at + 1).padStart(3, '0')}`,
      value: 300_000 - at,
    }));

    const cramped = chartAt(700, customers);
    expect(cramped.bars().filter(bar => bar.labelled).length).toBeLessThan(11);

    // Given room, every label is drawn: the rule is about fit, not a blanket thinning.
    const roomy = chartAt(1600, customers);
    expect(roomy.bars().every(bar => bar.labelled)).toBe(true);
  });

  it('keeps short labels on every bar at a pitch that would hide long ones', () => {
    const short: Bar[] = Array.from({ length: 11 }, (_, at) => ({ name: `Q${at}`, value: 10 + at }));
    expect(chartAt(700, short).bars().every(bar => bar.labelled)).toBe(true);
  });
});

describe('a roll-up bar that dwarfs the data', () => {
  /** What "Top 10 customers" actually holds: ten real rows, and everything else in one bar. */
  const topTen: Bar[] = [
    // A real spread across the ten. The live board's ten differ by 0.03%, which rounds to one
    // pixel however the scale is chosen -- a fixture like that cannot tell the two scales apart.
    ...Array.from({ length: 10 }, (_, at) => ({ name: `CUST-${at}`, value: 300_000 - at * 25_000 })),
    { name: 'Other', value: 101_025_562, inert: true },
  ];

  it('scales to the bars the chart is about, not to the roll-up', () => {
    // The roll-up set the scale, so all ten real bars rendered at the 3px floor and the chart
    // answered nothing -- the one bar explicitly NOT one of the ten decided how the ten looked.
    const chart = chartAt(900, topTen);
    expect(chart.maxValue()).toBe(300_000);

    const real = chart.bars().filter(bar => !bar.inert);
    // The tallest real bar now uses the full track instead of three pixels.
    expect(Math.max(...real.map(bar => bar.px))).toBeGreaterThan(40);
    // And the ten are told apart, which is the whole point of a ranked chart.
    expect(new Set(real.map(bar => bar.px)).size).toBeGreaterThan(1);
  });

  it('still draws the roll-up, and says it was cut rather than faking its height', () => {
    const chart = chartAt(900, topTen);
    const other = chart.bars().find(bar => bar.name === 'Other')!;

    expect(other.px).toBeGreaterThan(0);
    expect(other.clipped).toBe(true);
    expect(other.hint).toContain('101025562');
    expect(other.hint).toContain('drawn cut');
    // A real bar is not cut, so the marking means something.
    expect(chart.bars().find(bar => bar.name === 'CUST-0')!.clipped).toBe(false);
  });

  it('falls back to every bar when they are all roll-ups, rather than scaling to nothing', () => {
    const allInert: Bar[] = [
      { name: 'Other', value: 50, inert: true },
      { name: 'Rest', value: 100, inert: true },
    ];
    expect(chartAt(900, allInert).maxValue()).toBe(100);
  });
});
