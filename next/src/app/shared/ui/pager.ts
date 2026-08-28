import { Signal, signal } from '@angular/core';

/** The sizes the legacy list screens offered, kept so a saved habit still works. */
export const PAGE_SIZES = [50, 100, 150, 200];

/**
 * Client-side paging for the list screens. A helper rather than a component for the same
 * reason as createSort: the table keeps its own markup.
 *
 * `slice` clamps the page against the row count it is handed, so a filter that shrinks the
 * list below the current page cannot strand the user on a blank page -- the old screens
 * reset to page 1 on every filter change instead, which lost their place on a re-sort.
 */
export function createPager<T>(initialSize = PAGE_SIZES[0]) {
  const size = signal(initialSize);
  const page = signal(1);

  const totalPagesFor = (count: number) => Math.max(1, Math.ceil(count / size()));

  function slice(rows: T[]): T[] {
    const current = Math.min(page(), totalPagesFor(rows.length));
    const start = (current - 1) * size();
    return rows.slice(start, start + size());
  }

  function goTo(next: number, count: number): void {
    page.set(Math.max(1, Math.min(next, totalPagesFor(count))));
  }

  function setSize(next: number): void {
    size.set(Number(next) || size());
    page.set(1);
  }

  /** Filters change what "page 2" means, so a screen calls this when its filters change. */
  function reset(): void {
    page.set(1);
  }

  return {
    size: size as Signal<number>,
    page: page as Signal<number>,
    sizes: PAGE_SIZES,
    totalPagesFor,
    slice,
    goTo,
    setSize,
    reset,
  };
}
