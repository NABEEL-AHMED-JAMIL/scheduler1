/**
 * How billing figures read on every billing screen -- one place, so a rate on Cost & usage,
 * on an invoice and on a rate card is the same string, and a byte count is never "0 GB".
 */

/** A byte meter is counted in bytes and priced per GB: the `per` a rate card carries for it. */
export const BYTES_PER_GB = 1024 * 1024 * 1024;
export const HOURS_PER_DAY = 24;
export const MS_PER_DAY = 86_400_000;

/** Money with two decimals -- or four when the figure is real but under a cent, so it is not "$0.00". */
export function formatMoney(value: number, currency = 'USD'): string {
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
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

/** "$0.05 / 1,000 per token", "$0.01 per GB", "$0.33 per user-day". */
export function formatUnitPrice(unitPrice: number, per: number, unit: string | undefined, currency = 'USD'): string {
  const digits = priceDigits(unitPrice);
  const price = new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(unitPrice);
  // A byte meter is priced per GB; "$0.01 / 1,073,741,824 per byte" would be true and unreadable.
  if (unit === 'byte' && per === BYTES_PER_GB) return `${price} per GB`;
  return `${price}${per > 1 ? ' / ' + per.toLocaleString() : ''} per ${unit ?? ''}`;
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
  if (unit === 'minute') return quantity < 1 ? `${(quantity * 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} s` : quantity.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return quantity.toLocaleString(undefined, { maximumFractionDigits: quantity < 10 ? 3 : 0 });
}

/** Whole days since a due date, never negative. */
export function daysOverdue(dueAt: string | null | undefined, now = Date.now()): number {
  return dueAt ? Math.max(0, Math.floor((now - new Date(dueAt).getTime()) / MS_PER_DAY)) : 0;
}

export function firstOfMonth(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
export function daysInMonth(d: Date): number { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
/** "2026-09": the month a period is closed under. */
export function yearMonth(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
