import { Signal, computed, signal } from '@angular/core';

export type SortDirection = 'asc' | 'desc';

/**
 * Column sorting for the list screens. Kept as a helper rather than a component so a table can
 * keep its own markup; nulls always sort last regardless of direction, since "no value" is not
 * meaningfully smaller or larger than a value.
 */
export function createSort<T>(initialKey = '', initialDirection: SortDirection = 'asc') {
  const key = signal(initialKey);
  const direction = signal<SortDirection>(initialDirection);

  function toggle(nextKey: string): void {
    if (key() === nextKey) {
      direction.update(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      key.set(nextKey);
      direction.set('asc');
    }
  }

  /** Glyph name for a column header: which way it sorts, or that it can be sorted at all. */
  function iconFor(forKey: string): 'sort' | 'arrowUp' | 'arrowDown' {
    if (key() !== forKey) return 'sort';
    return direction() === 'asc' ? 'arrowUp' : 'arrowDown';
  }

  function indicator(forKey: string): '' | '↑' | '↓' {
    if (key() !== forKey) return '';
    return direction() === 'asc' ? '↑' : '↓';
  }

  function apply(rows: T[], valueOf: (row: T, key: string) => unknown): T[] {
    const activeKey = key();
    if (!activeKey) return rows;
    const factor = direction() === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = valueOf(a, activeKey);
      const right = valueOf(b, activeKey);
      const leftEmpty = left === null || left === undefined || left === '';
      const rightEmpty = right === null || right === undefined || right === '';
      if (leftEmpty && rightEmpty) return 0;
      if (leftEmpty) return 1;
      if (rightEmpty) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
      return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor;
    });
  }

  return { key: key as Signal<string>, direction: direction as Signal<SortDirection>, toggle, indicator, iconFor, apply };
}
