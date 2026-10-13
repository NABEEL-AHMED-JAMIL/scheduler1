/**
 * The payment form's rules, as Billing holds them (payment review 2026-10-12, BillingService.recordPayment), checked in
 * the panel as the person types so a refusal is never the first they hear of one: an amount above zero, in the
 * currency's smallest unit, at most what is still owed less slips awaiting verification; a day received not after today
 * in the workspace's billing time zone and at most a year back; a reference and a note that fit; a slip that is a PDF,
 * a PNG or a JPEG of at most 10 MB.
 */

/** Billing's zero- and three-decimal currencies (MinorUnits); everything else has cents. */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

export const SLIP_MAX_BYTES = 10 * 1024 * 1024;
export const SLIP_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
export const REFERENCE_MAX = 120;
export const NOTE_MAX = 600;

export function minorDigits(currency: string | null | undefined): number {
  const c = (currency ?? '').trim().toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/** A sum of money rounded to the currency's smallest unit, so 0.1 + 0.2 never reads as 0.30000000000000004. */
export function roundMoney(value: number, currency: string): number {
  const f = 10 ** minorDigits(currency);
  return Math.round(value * f) / f;
}

/** What is still open to pay: the balance less slips already awaiting verification, never below zero. */
export function openToPay(balance: number, pending: number, currency: string): number {
  return Math.max(0, roundMoney(balance - pending, currency));
}

/** The amount as typed, or the sentence that says what is wrong with it; `money` writes an amount as the console does. */
export function amountProblem(raw: string, open: number, pending: number, currency: string, money: (v: number) => string): string {
  const text = (raw ?? '').trim();
  if (!text) return 'Enter the amount paid.';
  if (!/^\d+(\.\d+)?$/.test(text)) return 'Enter a number, such as 120.50.';
  const value = Number(text);
  if (!(value > 0)) return 'Enter an amount above zero.';
  const digits = minorDigits(currency);
  const decimals = (text.split('.')[1] ?? '').replace(/0+$/, '').length;
  if (decimals > digits) return digits === 0 ? `Amounts in ${currency} have no decimals.` : `Amounts in ${currency} have at most ${digits} decimals.`;
  if (value > open + 1e-9) {
    return open <= 0 ? 'Nothing more can be paid: ' + (pending > 0 ? `${money(pending)} is already in slips awaiting verification.` : 'the balance is settled.')
      : `At most ${money(open)} is still owed${pending > 0 ? ` (${money(pending)} more is in slips awaiting verification)` : ''}.`;
  }
  return '';
}

/** A day YYYY-MM-DD received, against today in the billing time zone; '' when it is fine (or empty: today is meant). */
export function dayProblem(day: string, today: string, zone: string, dayText: (d: string) => string): string {
  if (!day) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Pick a day.';
  if (today && day > today) return `Not after today (${dayText(today)}${zone ? ', ' + zone : ''}).`;
  if (today) {
    const back = new Date(today + 'T00:00:00Z');
    back.setUTCDate(back.getUTCDate() - 366);
    if (day < back.toISOString().slice(0, 10)) return 'At most a year back.';
  }
  return '';
}

/** A slip as Billing takes it: a PDF, a PNG or a JPEG (Billing reads the bytes; the name and type are checked here first). */
export function slipProblem(file: File | null, required: boolean, size: (bytes: number) => string): string {
  if (!file) return required ? 'Attach the transfer slip, so the platform can match the payment.' : '';
  const name = file.name.toLowerCase();
  const typeOk = ['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) || /\.(pdf|png|jpe?g)$/.test(name);
  if (!typeOk) return 'A slip must be a PDF, a PNG or a JPEG.';
  if (file.size > SLIP_MAX_BYTES) return `A slip can be at most 10 MB; this one is ${size(file.size)}.`;
  if (file.size === 0) return 'This file is empty.';
  return '';
}

/** A key for one payment form, sent with every try of it: a double click or a retry records the payment once. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'pay-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}
