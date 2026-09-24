import { describe, it, expect } from 'vitest';
import { BYTES_PER_GB, addMoney, formatTotals, daysOverdue, formatBytes, formatMoney, formatMoneyRound, formatQuantity, formatUnitPrice, localIsoDate, moneyDigits, monthShort, pluralUnit, priceDigits, workspaceLabels, yearMonth } from './billing-format';

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
    expect(formatUnitPrice(0.045, 1, 'user-day')).toBe('$0.045 per user-day');
    expect(formatUnitPrice(0.000032, 1, 'GB-hour')).toBe('$0.000032 per GB-hour');
  });

  /** "$0.05 / 1,000 per token" read as a fraction of a token; a price per a thousand says so. */
  it('a price per a batch of units names the batch, in the plural', () => {
    expect(formatUnitPrice(0.05, 1000, 'token')).toBe('$0.05 per 1,000 tokens');
    expect(formatUnitPrice(0.004, 1000, 'op')).toBe('$0.004 per 1,000 ops');
    expect(formatUnitPrice(0.2, 100, 'query')).toBe('$0.20 per 100 queries');
    expect(formatUnitPrice(1, 10, 'topic-hour')).toBe('$1.00 per 10 topic-hours');
    expect(formatUnitPrice(3.02, 1, 'each')).toBe('$3.02 each');
  });

  it('a meter priced at nothing reads Free, not "$0.00 per GB"', () => {
    expect(formatUnitPrice(0, BYTES_PER_GB, 'byte')).toBe('Free');
    expect(formatUnitPrice(0, 1000, 'op')).toBe('Free');
  });

  it('units take the plural a person would write', () => {
    expect(['token', 'query', 'user-day', 'GB-hour', 'GB', 'minute', 'day'].map(pluralUnit))
      .toEqual(['tokens', 'queries', 'user-days', 'GB-hours', 'GB', 'minutes', 'days']);
  });

  /** "$0.0055" above "$0.01" in one column reads as two kinds of number; a column picks one precision. */
  it('a column of amounts shares one precision: four decimals if any real amount is under a cent', () => {
    expect(moneyDigits([0.51, 0.0055, 0, 0.29])).toBe(4);
    expect(moneyDigits([0.51, 0, 12])).toBe(2);
    expect(moneyDigits([])).toBe(2);
    expect(formatMoney(0.01, 'USD', 4)).toBe('$0.0100');
    expect(formatMoney(0.0055, 'USD', 2)).toBe('$0.01');
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

  it('a month reads as the rest of the console writes it, not "26-09"', () => {
    expect(monthShort('2026-09')).toBe('Sep 2026');
    expect(monthShort('2027-01-01')).toBe('Jan 2027');
  });

  /** toISOString() is UTC: after 7 pm in Chicago it already says tomorrow, and a card dated tomorrow read "in effect". */
  it("today is the viewer's own calendar day, not UTC's", () => {
    expect(localIsoDate(new Date(2026, 8, 23, 23, 30))).toBe('2026-09-23');
    expect(localIsoDate(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});

/**
 * A tile that adds up amounts from several invoices. Summed as one number and labelled dollars,
 * a workspace billed in pounds read "$1,200.00 to collect"; and across workspaces billed in
 * different currencies there is no single number to show at all.
 */
describe('addMoney / formatTotals', () => {
  it('shows a total in the currency it was billed in', () => {
    const totals = addMoney(addMoney({}, 1000, 'GBP'), 200, 'GBP');
    expect(formatTotals(totals)).toBe(formatMoney(1200, 'GBP'));
  });

  it('keeps different currencies apart rather than adding them', () => {
    const totals = addMoney(addMoney({}, 1000, 'GBP'), 50, 'EUR');
    expect(formatTotals(totals)).toBe(`${formatMoney(50, 'EUR')} · ${formatMoney(1000, 'GBP')}`);
  });

  it('reads a row with no currency as dollars, as the rest of billing does', () => {
    expect(formatTotals(addMoney({}, 5, undefined))).toBe(formatMoney(5, 'USD'));
  });

  it('says nothing is owed in no particular currency', () => {
    expect(formatTotals({})).toBe(formatMoney(0, 'USD'));
  });
});

/** Two workspaces called "MedAxis Care Network" were two identical rows in every picker and table. */
describe('workspaceLabels', () => {
  it('keeps a unique name as it is and tells repeated names apart by id', () => {
    const labels = workspaceLabels([
      { tenantId: 2905, tenantName: 'MedAxis Care Network' },
      { tenantId: 2901, tenantName: 'CareBridge Health Services' },
      { tenantId: 3107, tenantName: 'MedAxis Care Network' },
    ]);
    expect(labels.get(2901)).toBe('CareBridge Health Services');
    expect(labels.get(2905)).toBe('MedAxis Care Network (#2905)');
    expect(labels.get(3107)).toBe('MedAxis Care Network (#3107)');
  });

  it('compares names the way a reader does: case and surrounding spaces do not make them different', () => {
    const labels = workspaceLabels([{ tenantId: 1, tenantName: 'Default' }, { tenantId: 2, tenantName: ' default ' }]);
    expect(labels.get(1)).toBe('Default (#1)');
    expect(labels.get(2)).toBe('default (#2)');
  });
});
