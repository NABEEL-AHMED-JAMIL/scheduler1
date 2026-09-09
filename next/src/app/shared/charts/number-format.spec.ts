import { describe, it, expect } from 'vitest';
import { compactNumber } from './number-format';

describe('compactNumber', () => {
  it.each([
    [0, '0'], [7, '7'], [999, '999'],
    [1000, '1K'], [1200, '1.2K'], [1535, '1.5K'],
    [9949, '9.9K'], [12000, '12K'], [25400, '25K'], [999400, '999K'],
    [1200000, '1.2M'], [25400000, '25M'], [1200000000, '1.2B'],
  ])('%d reads as %s', (value, out) => {
    expect(compactNumber(value as number)).toBe(out);
  });

  it('keeps the sign', () => {
    expect(compactNumber(-1200)).toBe('-1.2K');
  });

  it('drops a trailing .0 rather than printing 12.0K', () => {
    expect(compactNumber(1000)).toBe('1K');
    expect(compactNumber(2000)).toBe('2K');
  });

  it('says so rather than printing NaN', () => {
    expect(compactNumber(Number.NaN)).toBe('—');
    expect(compactNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
