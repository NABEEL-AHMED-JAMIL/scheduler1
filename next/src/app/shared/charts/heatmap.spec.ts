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
    { day: 'Mon', hour: 9, value: 1 },
    { day: 'Mon', hour: 10, value: 40 },
    { day: 'Tue', hour: 11, value: 83 },
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
