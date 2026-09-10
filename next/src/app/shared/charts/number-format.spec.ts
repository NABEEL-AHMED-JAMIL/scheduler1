import { describe, it, expect } from 'vitest';
import { compactNumber, readableCell } from './number-format';

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

describe('readableCell', () => {
  it('leaves anything that is not a plain number alone', () => {
    // Dimensions, dates and labels arrive in the same cells as figures. "2024-03" becoming
    // "2,024" would be a report inventing a year.
    expect(readableCell('2024-03')).toBe('2024-03');
    expect(readableCell('North')).toBe('North');
    expect(readableCell('CUST-00301')).toBe('CUST-00301');
    expect(readableCell('Electronics-015')).toBe('Electronics-015');
    expect(readableCell('')).toBe('');
    expect(readableCell('1e6')).toBe('1e6');
    expect(readableCell('0x10')).toBe('0x10');
    expect(readableCell('Infinity')).toBe('Infinity');
  });

  it('groups integers, which is the whole reason a count is hard to read', () => {
    expect(readableCell('250000')).toBe('250,000');
    expect(readableCell('9680')).toBe('9,680');
    expect(readableCell('7')).toBe('7');
    expect(readableCell('-4200')).toBe('-4,200');
  });

  it('keeps money exactly as written when it has two places or fewer', () => {
    // 47.33 must not become 47.3 and must not become 47.330. It is what the file said.
    expect(readableCell('47.33')).toBe('47.33');
    expect(readableCell('1999.20')).toBe('1,999.20');
    expect(readableCell('4.1')).toBe('4.1');
  });

  it('cuts float noise down to two places', () => {
    // The defect this function exists for: an executive tile reading 103909527.57999787.
    expect(readableCell('103909527.57999787')).toBe('103,909,527.58');
    expect(readableCell('69661430.16000023')).toBe('69,661,430.16');
    expect(readableCell('1795751.1399999992')).toBe('1,795,751.14');
  });

  it('keeps four places for values too small to survive two', () => {
    // Rounding 0.0031 to two places renders it "0.00", and so does 0.0049 -- a whole column of
    // distinct rates collapsing to one value that is not any of them.
    expect(readableCell('0.0031')).toBe('0.0031');
    expect(readableCell('0.00007')).toBe('0.0001');
  });

  it('does not touch a zero, which is a real answer', () => {
    expect(readableCell('0')).toBe('0');
    expect(readableCell('0.00')).toBe('0.00');
  });

  it('keeps the cents on a round money value', () => {
    // Number.isInteger(47.00) is true, so branching on the parsed number rendered this "47" and
    // took the cents off the one column that needs them. It branches on the written form instead.
    expect(readableCell('47.00')).toBe('47.00');
    expect(readableCell('1200.00')).toBe('1,200.00');
  });
});
