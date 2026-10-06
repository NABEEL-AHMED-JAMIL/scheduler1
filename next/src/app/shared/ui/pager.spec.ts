import { describe, it, expect } from 'vitest';
import { createPager, PAGE_SIZES } from './pager';

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('createPager', () => {
  it('offers the page sizes the legacy screens did', () => {
    expect(PAGE_SIZES).toEqual([50, 100, 150, 200]);
  });

  it('slices to the current page', () => {
    const pager = createPager<number>();
    expect(pager.slice(rows(255))).toEqual(rows(50));
    pager.goTo(2, 255);
    expect(pager.slice(rows(255))[0]).toBe(51);
  });

  it('leaves a short last page short rather than padding it', () => {
    const pager = createPager<number>();
    pager.goTo(6, 255);
    expect(pager.slice(rows(255))).toHaveLength(5);
  });

  it('clamps a page beyond the end instead of going blank', () => {
    const pager = createPager<number>();
    pager.goTo(99, 255);
    expect(pager.page()).toBe(6);
  });

  it('returns to page 1 when the size changes, so the view stays put', () => {
    const pager = createPager<number>();
    pager.goTo(4, 255);
    pager.setSize(100);
    expect(pager.page()).toBe(1);
    expect(pager.slice(rows(255))).toHaveLength(100);
  });

  it('does not strand the user on a page a filter has emptied', () => {
    // The bug this guards: sitting on page 6, then filtering down to 43 rows. Without the
    // clamp inside slice, page 6 of a 1-page list returns nothing and the table looks broken.
    const pager = createPager<number>();
    pager.goTo(6, 255);
    expect(pager.slice(rows(43))).toEqual(rows(43));
  });

  it('reset sends the user back to the first page', () => {
    const pager = createPager<number>();
    pager.goTo(3, 255);
    pager.reset();
    expect(pager.page()).toBe(1);
  });

  it('never goes below page 1', () => {
    const pager = createPager<number>();
    pager.goTo(-5, 255);
    expect(pager.page()).toBe(1);
  });
});
