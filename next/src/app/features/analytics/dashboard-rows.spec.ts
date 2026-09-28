import { describe, it, expect } from 'vitest';
import { fillRows } from './dashboard';

/**
 * A board is twelve columns. A figure (3) beside a chart (6) left a quarter of the row empty, with
 * a table below it: the last tile in a row now stretches to the row's end whenever the next one
 * cannot fit beside it.
 */
describe('filling a board\'s rows', () => {
  it('stretches the last tile of a row the next tile cannot join', () => {
    expect(fillRows([3, 6, 12, 12, 12, 6, 6])).toEqual([3, 9, 12, 12, 12, 6, 6]);
    expect(fillRows([6, 12])).toEqual([12, 12]);
  });

  it('leaves rows that are already full alone', () => {
    expect(fillRows([3, 3, 6, 12])).toEqual([3, 3, 6, 12]);
    expect(fillRows([6, 6])).toEqual([6, 6]);
  });

  it('fills the last row too', () => {
    expect(fillRows([3, 3, 3])).toEqual([3, 3, 6]);
    expect(fillRows([12, 6])).toEqual([12, 12]);
  });
});
