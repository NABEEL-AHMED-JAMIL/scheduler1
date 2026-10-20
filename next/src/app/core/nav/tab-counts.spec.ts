import { describe, it, expect } from 'vitest';
import { TabCounts } from './tab-counts';

describe('TabCounts', () => {
  it('keeps a number per tab path, drops one that cannot be read, and keeps zero', () => {
    const c = new TabCounts();
    c.set({ '/reports/templates': 12, '/reports/library': 0, '/reports/assets': null });
    expect(c.of('/reports/templates')).toBe(12);
    expect(c.of('/reports/library')).toBe(0);
    expect(c.of('/reports/assets')).toBeNull();
    c.set({ '/reports/templates': undefined });
    expect(c.of('/reports/templates')).toBeNull();
    expect(c.of('/reports/library')).toBe(0);
  });
});
