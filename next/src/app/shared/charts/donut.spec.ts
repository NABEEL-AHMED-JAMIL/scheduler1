import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Donut, Slice } from './donut';

/**
 * The figure in the middle of the ring, which was the one branch that formatted nothing.
 *
 * compactTotal has four branches and three of them compact: thousands to "1.5k", millions to
 * "2.5M". Below a thousand it printed the sum exactly as JavaScript had accumulated it, so a ring
 * over a money column -- which a CSV reader types as DOUBLE -- showed "33.989999999999995" in
 * text-xl inside a 104px circle, overflowing it in both directions, while the legend rows an inch
 * away read 33.33, 0.49 and 0.17 correctly because those go through the `format` input.
 *
 * The cure is in compactTotal rather than in `format`, because the constraint in the centre is the
 * RING: readableCell renders a money total as "103,909,527.58", which is right in a legend row and
 * does not fit in a space that holds about five characters. Two decimal places drop the float noise
 * and keep money and rates whole, which is the whole of the defect.
 *
 * @author Nabeel Ahmed
 */
describe('the total in the middle of the ring', () => {

  function ring(inputs: Record<string, unknown>): ComponentFixture<Donut> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Donut);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  /** What is actually painted inside the ring. */
  function centreText(fixture: ComponentFixture<Donut>): string {
    const node = (fixture.nativeElement as HTMLElement).querySelector('.text-xl');
    return (node?.textContent ?? '').trim();
  }

  /**
   * Three slices of money whose sum JavaScript cannot represent exactly.
   *
   * THE ORDER IS LOAD-BEARING. Floating-point addition is not associative, and total() folds the
   * slices left to right from 0: starting at the large value absorbs the two small ones exactly
   * (33.33 + 0.49 + 0.17 === 33.99) while starting at the small ones does not
   * (0.49 + 0.17 + 33.33 === 33.989999999999995). Written large-first, this fixture produced a
   * clean total and the test below measured nothing -- which is exactly what its own premise
   * assertion caught. Small denominations first, as a ring sorted ascending would give them.
   */
  const money: Slice[] = [
    { name: 'support', value: 0.49 },
    { name: 'training', value: 0.17 },
    { name: 'licences', value: 33.33 },
  ];

  it('drops the float noise from a sum below a thousand', () => {
    const fixture = ring({ data: money });

    // The raw sum really is noisy -- if this ever stops being true the test below is measuring
    // nothing, so it is asserted rather than assumed.
    expect(fixture.componentInstance.total()).not.toBe(33.99);
    expect(fixture.componentInstance.compactTotal()).toBe('33.99');
    expect(centreText(fixture)).toBe('33.99');
  });

  it('leaves the ring holding no digits it has no room for', () => {
    expect(centreText(ring({ data: money })).length).toBeLessThanOrEqual(6);
  });

  it('keeps a round total round rather than padding it with cents', () => {
    // Two places where they say something, not two places always: "30.00" in the centre of a ring
    // over a count would be an invented precision.
    expect(centreText(ring({ data: [{ name: 'a', value: 10 }, { name: 'b', value: 20 }] })))
      .toBe('30');
  });

  it('still compacts the three branches that were already compacting', () => {
    // The fix is confined to the sub-thousand branch; the others carry the ring's size constraint
    // and are what the centre is sized for.
    expect(ring({ data: [{ name: 'a', value: 1500 }] }).componentInstance.compactTotal())
      .toBe('1.5k');
    expect(ring({ data: [{ name: 'a', value: 20_000 }] }).componentInstance.compactTotal())
      .toBe('20k');
    expect(ring({ data: [{ name: 'a', value: 2_500_000 }] }).componentInstance.compactTotal())
      .toBe('2.5M');
  });

  it('leaves the legend on the caller\'s formatter, which is a different constraint', () => {
    // The legend has a row to itself and can carry a grouped, unabbreviated figure; the centre
    // cannot. Both must be free of the float artefact, and neither may be the other.
    const fixture = ring({
      data: money,
      format: (value: number) => value.toFixed(2),
    });

    const legend = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li'))
      .map(row => (row.textContent ?? '').replace(/\s+/g, ' ').trim());
    const shown = legend.join(' | ');
    expect(shown).toContain('33.33');
    expect(shown).toContain('0.49');
    expect(centreText(fixture)).toBe('33.99');
  });
});
