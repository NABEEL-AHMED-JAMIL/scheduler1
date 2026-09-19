import { describe, it, expect } from 'vitest';
import { BYTES_PER_GB, daysOverdue, formatBytes, formatMoney, formatMoneyRound, formatQuantity, formatUnitPrice, priceDigits, yearMonth } from './billing-format';

/** The one way billing figures read, on every billing screen. */
describe('billing-format', () => {
  it('money shows cents, or four decimals when the figure is real but under a cent', () => {
    expect(formatMoney(46.2)).toBe('$46.20');
    expect(formatMoney(0.00602)).toBe('$0.0060');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(-36, 'EUR')).toMatch(/36\.00/);
    expect(formatMoneyRound(1842.4)).toBe('$1,842');
  });

  it('a unit price keeps the decimals it has, and a byte meter is priced per GB', () => {
    expect([priceDigits(0.05), priceDigits(0.045), priceDigits(0.000032), priceDigits(3)]).toEqual([2, 3, 6, 2]);
    expect(formatUnitPrice(0.01, BYTES_PER_GB, 'byte')).toBe('$0.01 per GB');
    expect(formatUnitPrice(0.05, 1000, 'token')).toBe('$0.05 / 1,000 per token');
    expect(formatUnitPrice(0.045, 1, 'user-day')).toBe('$0.045 per user-day');
    expect(formatUnitPrice(0.000032, 1, 'GB-hour')).toBe('$0.000032 per GB-hour');
  });

  it('quantities read in their unit: bytes trimmed, GB-hours as a day, small minutes as seconds', () => {
    expect(formatBytes(41016604262)).toBe('38.2 GB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatQuantity(131000000000, 'byte')).toBe('122 GB');
    expect(formatQuantity(0.5, 'GB-hour')).toBe('21.33 MB · day');
    expect(formatQuantity(0.3, 'minute')).toBe('18 s');
    expect(formatQuantity(16596, 'token')).toBe('16,596');
    expect(formatQuantity(0.005, 'run')).toBe('0.005');
  });

  it('days overdue never go negative, and a month is named yyyy-MM', () => {
    const now = new Date('2026-09-19T00:00:00Z').getTime();
    expect(daysOverdue('2026-09-15T00:00:00Z', now)).toBe(4);
    expect(daysOverdue('2026-10-15T00:00:00Z', now)).toBe(0);
    expect(daysOverdue(null, now)).toBe(0);
    expect(yearMonth(new Date('2026-09-19T00:00:00'))).toBe('2026-09');
  });
});
