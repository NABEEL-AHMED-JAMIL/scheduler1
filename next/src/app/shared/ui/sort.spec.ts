import { describe, it, expect } from 'vitest';
import { createSort } from './sort';

interface Row { name: string; count: number | null; when?: string }

const valueOf = (row: any, key: string) => row[key];

describe('createSort', () => {
  it('sorts ascending on the initial key and flips on a repeat toggle', () => {
    const sort = createSort<Row>('name');
    const rows: Row[] = [{ name: 'b', count: 1 }, { name: 'a', count: 2 }];

    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['a', 'b']);
    sort.toggle('name');
    expect(sort.direction()).toBe('desc');
    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['b', 'a']);
  });

  it('starts a new column ascending rather than keeping the previous direction', () => {
    const sort = createSort<Row>('name');
    sort.toggle('name');
    expect(sort.direction()).toBe('desc');
    sort.toggle('count');
    expect(sort.key()).toBe('count');
    expect(sort.direction()).toBe('asc');
  });

  it('keeps empty values last in both directions', () => {
    // A null is not "smaller" than 1 -- it is missing, and missing rows belong at the end
    // whichever way the column is sorted.
    const sort = createSort<Row>('count');
    const rows: Row[] = [
      { name: 'has-2', count: 2 },
      { name: 'empty', count: null },
      { name: 'has-1', count: 1 },
    ];

    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['has-1', 'has-2', 'empty']);
    sort.toggle('count');
    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['has-2', 'has-1', 'empty']);
  });

  it('compares numbers numerically, not as strings', () => {
    const sort = createSort<Row>('count');
    const rows: Row[] = [{ name: 'ten', count: 10 }, { name: 'nine', count: 9 }];
    expect(sort.apply(rows, valueOf).map(r => r.name)).toEqual(['nine', 'ten']);
  });

  it('does not mutate the array it is given', () => {
    const sort = createSort<Row>('name');
    const rows: Row[] = [{ name: 'b', count: 1 }, { name: 'a', count: 2 }];
    const order = rows.map(r => r.name);
    sort.apply(rows, valueOf);
    expect(rows.map(r => r.name)).toEqual(order);
  });

  it('reports which glyph a header should show', () => {
    const sort = createSort<Row>('name');
    expect(sort.iconFor('name')).toBe('arrowUp');
    expect(sort.iconFor('count')).toBe('sort');
    sort.toggle('name');
    expect(sort.iconFor('name')).toBe('arrowDown');
  });
});
