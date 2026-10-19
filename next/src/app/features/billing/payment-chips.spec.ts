import { describe, it, expect } from 'vitest';
import { PAYMENT_CHIP_TOKENS, paymentMethodChip, paymentStateChip } from './payment-chips';

/**
 * Owner #11 (2026-10-19): one chip per payment state and per method, each with its own token pair, glyph and word.
 * contrast.spec.ts measures the pairs in all five themes; this holds the mapping and that every class it hands out
 * has its rule in styles.css.
 */
describe('payment chips', () => {
  it('gives each payment state its own chip, word and glyph', () => {
    const states = [
      paymentStateChip({ status: 'submitted', method: 'bank' }),
      paymentStateChip({ status: 'verified', method: 'bank', amount: 2 }),
      paymentStateChip({ status: 'verified', method: 'credit_note', amount: 1 }),
      paymentStateChip({ status: 'rejected', method: 'bank', note: 'wrong amount' }),
      paymentStateChip({ status: 'rejected', method: 'card', provider: 'stripe', note: 'Your card was declined.' }),
      paymentStateChip({ status: 'verified', method: 'card', provider: 'stripe', amount: 3, refundedAmount: 3 }),
    ];
    expect(states.map(c => c.label)).toEqual(['Awaiting verification', 'Verified', 'Applied', 'Rejected', 'Failed', 'Refunded']);
    expect(states.map(c => c.cls.split(' ').pop())).toEqual(['pill-pay-pending', 'pill-pay-verified', 'pill-pay-applied', 'pill-pay-rejected',
      'pill-pay-failed', 'pill-pay-refunded']);
    // Never colour alone: every chip has a glyph, and no two states share one.
    expect(new Set(states.map(c => c.icon)).size).toBe(states.length);
    // The reason travels as the tooltip.
    expect(states[3].title).toBe('wrong amount');
    expect(states[4].title).toBe('Your card was declined.');
  });

  it('says a card payment refunded in part, and that a declined card failed rather than was rejected', () => {
    expect(paymentStateChip({ status: 'verified', method: 'card', provider: 'stripe', amount: 10, refundedAmount: 4 }).label).toBe('Part refunded');
    expect(paymentStateChip({ status: 'rejected', method: 'card', provider: 'stripe' }).kind).toBe('failed');
    // A card recorded by hand (no provider) that the platform rejected is a rejected slip, not a failed card.
    expect(paymentStateChip({ status: 'rejected', method: 'card' }).kind).toBe('rejected');
  });

  it('tells card from bank transfer by a categorical colour of its own', () => {
    const card = paymentMethodChip('card', 'stripe');
    const bank = paymentMethodChip('bank');
    expect(card).toMatchObject({ label: 'Card · Stripe', icon: 'card' });
    expect(card.cls).toContain('pill-pay-card');
    expect(bank).toMatchObject({ label: 'Bank transfer', icon: 'bank' });
    expect(bank.cls).toContain('pill-pay-bank');
    expect(paymentMethodChip('cash').cls).toContain('pill-neutral');
    expect(paymentMethodChip('credit_note').label).toBe('Credit note');
  });

  it('hands out only classes styles.css defines, each from its own token pair', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const css = fs.readFileSync(`${root}/src/styles.css`, 'utf8');
    for (const token of PAYMENT_CHIP_TOKENS) {
      expect(css, token).toContain(`.pill-pay-${token} `);
      expect(css, token).toContain(`--pill-pay-${token}-fg:`);
      expect(css, token).toContain(`--pill-pay-${token}-bg:`);
    }
  });
});
