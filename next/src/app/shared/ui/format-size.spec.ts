import { describe, it, expect } from 'vitest';
import { formatSize } from './format-size';

describe('formatSize', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 ** 2, '1.0 MB'],
    [1024 ** 3, '1.00 GB'],
  ])('formats %i as %s', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });

  it('separates "empty" from "unknown"', () => {
    // A zero-byte file is a real thing and should not read as missing data.
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(undefined)).toBe('—');
    expect(formatSize(null)).toBe('—');
  });
});
