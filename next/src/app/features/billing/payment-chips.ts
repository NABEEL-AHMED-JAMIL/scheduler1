/**
 * Owner #11 (2026-10-19): one look per payment state and per method, used the same way on every billing screen -- the
 * invoice's payments, the invoice header, the rail and the documents.
 *
 * Each state has its own token colour (styles.css, "Payment chips": --pill-pay-<kind>-fg / -bg), its own glyph and its
 * word, so a chip never says anything by colour alone. Pending is amber, verified green, rejected a soft red, a failed
 * card a filled red (the pair inside the red family told apart by weight, as Failed and Interrupt are), refunded blue,
 * a credit note applied grey; the method chips -- card violet, bank transfer teal, cash and other neutral -- are
 * categorical, never a status hue, so "Card" never reads as "ok". contrast.spec.ts measures every pair in all five
 * themes and holds them apart from each other.
 */

/** What a chip needs: its words, its class (pill + its token pair), its glyph and an optional tooltip. */
export interface PaymentChip { kind: string; label: string; cls: string; icon: string; title?: string; }

/** The payment states, each with its own chip: the order the legend lists them. */
export const PAYMENT_STATE_KINDS = ['pending', 'verified', 'applied', 'rejected', 'failed', 'refunded', 'part-refunded'] as const;
/** The methods with a chip of their own. */
export const PAYMENT_METHOD_KINDS = ['card', 'bank', 'cash', 'other', 'credit'] as const;
/** Every token pair the chips use (styles.css): what contrast.spec.ts measures. */
export const PAYMENT_CHIP_TOKENS = ['pending', 'verified', 'applied', 'rejected', 'failed', 'refunded', 'card', 'bank'] as const;

export interface PaymentLike {
  status: string;
  method?: string | null;
  provider?: string | null;
  amount?: number | null;
  refundedAmount?: number | null;
  note?: string | null;
}

const chip = (kind: string, label: string, token: string, icon: string, title?: string): PaymentChip =>
  ({ kind, label, cls: `pill pill-pay pill-pay-${token}`, icon, title });

/** A payment's state as a chip: awaiting verification, verified, applied, rejected, failed (a declined card), refunded. */
export function paymentStateChip(p: PaymentLike): PaymentChip {
  const card = p.method === 'card' && !!p.provider;
  if (p.status === 'submitted') return chip('pending', 'Awaiting verification', 'pending', 'clock', 'Counts once the platform verifies the slip');
  if (p.status === 'rejected') {
    return card ? chip('failed', 'Failed', 'failed', 'xCircle', p.note || 'The card payment failed')
      : chip('rejected', 'Rejected', 'rejected', 'close', p.note || 'The platform rejected this slip');
  }
  if (p.status === 'verified') {
    if (p.method === 'credit_note') return chip('applied', 'Applied', 'applied', 'minus', 'A credit note applied to the balance');
    const refunded = Number(p.refundedAmount ?? 0);
    const amount = Number(p.amount ?? 0);
    if (refunded > 0 && refunded >= amount) return chip('refunded', 'Refunded', 'refunded', 'undo', 'Refunded in full; a credit note records it');
    if (refunded > 0) return chip('part-refunded', 'Part refunded', 'refunded', 'undo', `Part of it refunded; a credit note records it`);
    return chip('verified', 'Verified', 'verified', 'checkCircle', card ? 'Confirmed by the card provider' : 'Verified by the platform; a receipt was issued');
  }
  return chip('unknown', p.status ? p.status[0].toUpperCase() + p.status.slice(1) : '—', 'applied', 'info');
}

/** A payment's method as a chip: card (with its provider), bank transfer, cash, other, credit note. */
export function paymentMethodChip(method: string | null | undefined, provider?: string | null): PaymentChip {
  if (method === 'card') return chip('card', provider === 'stripe' ? 'Card · Stripe' : 'Card', 'card', 'card', provider === 'stripe' ? 'Paid by card through Stripe' : 'Paid by card');
  if (method === 'bank') return chip('bank', 'Bank transfer', 'bank', 'bank');
  if (method === 'credit_note') return chip('credit', 'Credit note', 'applied', 'file');
  if (method === 'cash') return { kind: 'cash', label: 'Cash', cls: 'pill pill-pay pill-neutral', icon: 'briefcase' };
  return { kind: 'other', label: method ? 'Other' : '—', cls: 'pill pill-pay pill-neutral', icon: 'dots' };
}
