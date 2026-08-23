import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { BarChart, Bar } from './bar-chart';

@Component({ imports: [BarChart], template: `<app-bar-chart [data]="data()" [height]="104" />` })
class Host { readonly data = signal<Bar[]>([]); }

function barsFor(data: Bar[]) {
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

  it('returns no bars when every value is zero', () => {
    expect(barsFor([{ name: 'a', value: 0 }])).toEqual([]);
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
