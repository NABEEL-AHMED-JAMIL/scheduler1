/**
 * How billing figures read on every billing screen -- one place, so a rate on Cost & usage,
 * on an invoice and on a rate card is the same string, and a byte count is never "0 GB".
 */
import { formatDate } from '@angular/common';

/** A byte meter is counted in bytes and priced per GB: the `per` a rate card carries for it. */
export const BYTES_PER_GB = 1024 * 1024 * 1024;
export const HOURS_PER_DAY = 24;
export const MS_PER_DAY = 86_400_000;

/**
 * Money with two decimals -- or four when the figure is real but under a cent, so it is not "$0.00".
 * A column passes the `digits` its figures share (see `moneyDigits`), so one row is not "$0.0055"
 * under another's "$0.01".
 */
export function formatMoney(value: number, currency = 'USD', digits?: number): string {
  const abs = Math.abs(value);
  digits ??= abs > 0 && abs < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/**
 * A run's or a row's amount as a cell reads it (Cost & usage redesign, 2026-10-19): cents, and "<$0.01" for a real amount
 * under a cent -- "$0.0020" beside "$0.82" was noise. The exact figure goes on the cell's tooltip (`formatMoneyExact`).
 * A day's or a pipeline's total keeps `formatMoney`, which shows a sub-cent total exactly.
 */
export function formatMoneyCell(value: number, currency = 'USD'): string {
  const v = Number(value) || 0;
  return v !== 0 && Math.abs(v) < 0.01 ? `<${formatMoney(0.01, currency, 2)}` : formatMoney(v, currency, 2);
}

/** An amount to the meter's fifth place, for a tooltip. */
export function formatMoneyExact(value: number, currency = 'USD'): string {
  return formatMoney(Number(value) || 0, currency, 5);
}

/** The precision a column of amounts shares: four decimals when any real amount in it is under a cent. */
export function moneyDigits(values: number[]): number {
  return values.some(v => { const abs = Math.abs(Number(v) || 0); return abs > 0 && abs < 0.01; }) ? 4 : 2;
}

/** Amounts added up per currency: a total never mixes two. */
export type MoneyTotals = Record<string, number>;

/** `totals` with `value` added under its currency (USD when the row names none, as elsewhere here). */
export function addMoney(totals: MoneyTotals, value: number, currency: string | null | undefined): MoneyTotals {
  const code = currency || 'USD';
  return { ...totals, [code]: (totals[code] ?? 0) + Number(value || 0) };
}

/**
 * A total as it reads on a tile: one figure in its own currency, or one figure per currency --
 * "€50.00 · £1,000.00" -- when the rows behind it were billed in several. Adding pounds to euros
 * and calling the result dollars is the one answer that is certainly wrong.
 */
export function formatTotals(totals: MoneyTotals): string {
  const codes = Object.keys(totals).sort();
  if (!codes.length) return formatMoney(0, 'USD');
  return codes.map(code => formatMoney(totals[code], code)).join(' · ');
}

/**
 * A share of a total as a column writes it (owner #7): "77%", and "<1%" for a real amount that rounds to nothing --
 * "0%" beside $0.16 read as if that line cost nothing.
 */
export function formatShare(sharePercent: number, amount: number): string {
  if (amount > 0 && sharePercent < 1) return '<1%';
  return `${Math.round(sharePercent)}%`;
}

/** Money as a headline figure: whole units. */
export function formatMoneyRound(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

/** How many decimals a unit price needs to read as itself: 0.045 is not "$0.05", 0.000032 not "$0.00". */
export function priceDigits(p: number): number {
  const text = Math.abs(p).toFixed(6).replace(/0+$/, '');
  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  return Math.min(6, Math.max(2, decimals));
}

/** A unit in the plural, for "per 1,000 tokens": GB stays GB, a query becomes queries. */
export function pluralUnit(unit: string): string {
  if (!unit || unit === 'GB' || unit.endsWith('s')) return unit;
  return /[^aeiou]y$/.test(unit) ? unit.slice(0, -1) + 'ies' : unit + 's';
}

/** "$0.05 per 1,000 tokens", "$0.01 per GB", "$0.33 per user-day", "Free". */
export function formatUnitPrice(unitPrice: number, per: number, unit: string | undefined, currency = 'USD'): string {
  if (Number(unitPrice) === 0) return 'Free';
  const digits = priceDigits(unitPrice);
  const price = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(unitPrice);
  // A byte meter is priced per GB; "$0.01 per 1,073,741,824 bytes" would be true and unreadable.
  if (unit === 'byte' && per === BYTES_PER_GB) return `${price} per GB`;
  if (unit === 'each') return `${price} each`;
  return per > 1 ? `${price} per ${per.toLocaleString()} ${pluralUnit(unit ?? '')}`.trimEnd() : `${price} per ${unit ?? ''}`.trimEnd();
}

/** Bytes as a person reads them, trailing zeros dropped: "38.2 GB", "2 KB", "900 B". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
  if (bytes < BYTES_PER_GB) return `${(bytes / 1024 ** 2).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`;
  return `${(bytes / BYTES_PER_GB).toLocaleString(undefined, { maximumFractionDigits: 2 })} GB`;
}

export function formatGb(gb: number): string { return formatBytes(gb * BYTES_PER_GB); }

/** A quantity in its unit's own terms: bytes as KB/MB/GB, GB-hours as such, small minutes as seconds. */
export function formatQuantity(quantity: number, unit: string | undefined): string {
  if (unit === 'byte') return formatBytes(quantity);
  if (unit === 'GB') return formatGb(quantity);
  if (unit === 'GB-hour') return quantity < 1 ? `${formatGb(quantity / HOURS_PER_DAY)} · day` : `${quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  if (unit === 'minute') return quantity < 1 ? `${(quantity * 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} sec` : quantity.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return quantity.toLocaleString(undefined, { maximumFractionDigits: quantity < 10 ? 3 : 0 });
}

/** Whole days since a due date, never negative. */
export function daysOverdue(dueAt: string | null | undefined, now = Date.now()): number {
  return dueAt ? Math.max(0, Math.floor((now - new Date(dueAt).getTime()) / MS_PER_DAY)) : 0;
}

/** ZT-B2: the calendar day "yyyy-MM-dd" at an instant in a time zone (a workspace's billing zone). */
export function dayInZone(zone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  }
}
/** "October 2026" for a month's first day, "2026-10-01". */
export function monthName(firstDay: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${firstDay.slice(0, 10)}T00:00:00Z`));
}
export function firstOfMonth(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
export function daysInMonth(d: Date): number { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
/** "2026-09": the month a period is closed under. */
export function yearMonth(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

/**
 * "2026-09" (or a first-of-month date) as a chart's axis writes a month: "Sep 2026", the month as
 * "24 Sep 2026" abbreviates it. Only where twelve bars share an axis; a billing period in a list or
 * a heading is the full 'month' format from time-format.ts, "September 2026" (MIG-295).
 *
 * Through Angular's formatDate, which reads "2026-09-01" as that calendar day, rather than
 * toLocaleDateString, which follows the browser's language instead of the console's.
 */
export function monthShort(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month ?? '');
  return match ? formatDate(`${match[1]}-${match[2]}-01`, 'MMM yyyy', 'en-US') : String(month ?? '');
}

/**
 * A calendar day (yyyy-MM-dd) moved by whole days -- a billing day as Billing names it in the workspace's zone (H9), which
 * is a date, not an instant: no zone is involved, so none can shift it. Anything that is not such a day comes back as is.
 */
export function shiftDay(day: string, by: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
  if (!match) return day;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + by));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The viewer's own calendar day as yyyy-MM-dd. toISOString() is UTC, and in the evening already says tomorrow. */
export function localIsoDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Each workspace's name for a picker or a table; names that repeat carry the id, so two rows never read the same. */
export function workspaceLabels(tenants: { tenantId: number; tenantName: string }[]): Map<number, string> {
  const key = (n: string) => (n ?? '').trim().toLowerCase();
  const seen = new Map<string, number>();
  for (const t of tenants) seen.set(key(t.tenantName), (seen.get(key(t.tenantName)) ?? 0) + 1);
  return new Map(tenants.map(t => {
    const name = (t.tenantName ?? '').trim() || `Workspace ${t.tenantId}`;
    return [t.tenantId, (seen.get(key(t.tenantName)) ?? 0) > 1 ? `${name} (#${t.tenantId})` : name];
  }));
}

// ---- billing days of instants (owner review 2026-10-12: tables grouped by day) ----------------------------------------

function zoned(zone: string | null | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: zone || undefined });
  } catch {
    // A zone this browser does not know: its own, rather than nothing.
    return new Intl.DateTimeFormat('en-GB', options);
  }
}

/** The billing day (yyyy-MM-dd) an instant falls on in a zone (the workspace's, H9) -- never the browser's when one is given. */
export function zonedDay(at: Date, zone: string | null | undefined): string {
  const parts = zoned(zone, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The time of day an instant is in a zone, 24-hour: "22:50". */
export function zonedTime(at: Date, zone: string | null | undefined): string {
  return zoned(zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

/** An instant as a recent-activity cell writes it, 24-hour, in a zone (the workspace's): "19 Oct, 19:26". */
export function zonedStamp(at: Date, zone: string | null | undefined): string {
  return `${zoned(zone, { day: 'numeric', month: 'short' }).format(at)}, ${zonedTime(at, zone)}`;
}

/** A billing day as a day header names it: "Mon 12 Oct 2026". */
export function dayHeading(day: string, locale = 'en-US'): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') ? formatDate(day + 'T00:00:00Z', 'EEE d MMM y', locale, 'UTC') : day;
}

/** Rows in their order, cut into runs of the same billing day (`dayOf` gives each row's; null for a row with no time). */
export function groupByDay<T>(rows: T[], dayOf: (row: T) => string | null): { day: string | null; rows: T[] }[] {
  const out: { day: string | null; rows: T[] }[] = [];
  for (const row of rows) {
    const day = dayOf(row);
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(row); else out.push({ day, rows: [row] });
  }
  return out;
}
