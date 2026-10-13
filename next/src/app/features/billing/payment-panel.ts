import { Component, ElementRef, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { SidePanel } from '../../shared/ui/side-panel';
import { FormRow } from '../../shared/ui/form-row';
import { Section } from '../../shared/ui/section';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { DateField, dayText } from '../../shared/ui/date-field';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { formatSize } from '../../shared/ui/format-size';
import { focusFirstInvalid } from '../../shared/ui/focus-first-invalid';
import { BillingApi, InvoiceDetail, PAYMENT_METHODS, PaymentRow } from './billing.service';
import { formatMoney } from './billing-format';
import { NOTE_MAX, REFERENCE_MAX, SLIP_ACCEPT, amountProblem, dayProblem, minorDigits, newIdempotencyKey, openToPay, roundMoney, slipProblem } from './payment-form';

/** What the invoice pane hands the panel: the invoice as it reads it now, and what of it is paid, credited and claimed. */
export interface PaymentPanelData {
  invoice: InvoiceDetail;
  paid: number;
  credited: number;
  /** Slips awaiting verification: claimed, not counted, and not payable again. */
  pending: number;
  platformAdmin: boolean;
}

/** What the panel closes with once Billing took the payment. */
export interface PaymentPanelResult { message: string; payment: PaymentRow | null; }

type Counting = 'verified' | 'later';

/**
 * Record a payment (a platform administrator) or upload a payment slip (a workspace administrator) against one invoice
 * (payment review 2026-10-12): in the side panel over the right of the screen, with the invoice beside it. The head says
 * which invoice and what is due; the amount starts at what is open, in the invoice's currency, with "Pay in full" and
 * what a part leaves open; the method, the day received (in the workspace's billing time zone), the reference and the
 * note on grouped rows; the slip in the shared dropzone with its types and limit. Every rule Billing holds is checked as
 * it is typed and shown under its field; "what happens next" says what the button will do; a refusal from Billing is
 * shown in the panel, by the field it is about when it names one, not only as a toast. One Idempotency-Key per panel, so
 * a double click or a retry records the payment once.
 */
@Component({
  selector: 'app-payment-panel',
  imports: [SidePanel, FormRow, Section, Field, Icon, DateField, FileDropzone],
  templateUrl: './payment-panel.html',
  styles: `
    .pay-due { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 0.75rem 1.25rem; padding: 0.875rem 1rem;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-inset); }
    .pay-due dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
    .pay-due dd { margin: 0.125rem 0 0; font-variant-numeric: tabular-nums; font-size: 0.875rem; }
    .pay-due .is-due dd { font-size: 1.125rem; font-weight: 600; }
    .pay-amount { display: flex; align-items: stretch; }
    .pay-amount .pay-currency { display: inline-flex; align-items: center; padding: 0 0.625rem; font-size: 0.8125rem; color: var(--text-secondary);
      border: 1px solid var(--border-strong); border-right: 0; border-radius: var(--radius-md) 0 0 var(--radius-md); background: var(--surface-inset); }
    .pay-amount .input { border-top-left-radius: 0; border-bottom-left-radius: 0; min-width: 0; flex: 1; }
    .pay-quick { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.375rem; }
    .pay-choice { display: grid; grid-template-columns: 1fr; gap: 0.5rem; }
    @media (min-width: 40rem) { .pay-choice { grid-template-columns: 1fr 1fr; } }
    .pay-choice label { display: flex; gap: 0.625rem; align-items: flex-start; padding: 0.75rem 0.875rem; cursor: pointer;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-raised); }
    .pay-choice label.is-on { border-color: var(--color-brand-500, var(--border-strong)); box-shadow: 0 0 0 1px var(--color-brand-500, var(--border-strong)); }
    .pay-choice input { margin-top: 0.2rem; }
    .pay-next { display: flex; gap: 0.625rem; align-items: flex-start; }
    .pay-next ul { margin: 0; padding-left: 1rem; list-style: disc; }
  `,
})
export class PaymentPanel implements OnInit {
  readonly ref = inject<DialogRef<PaymentPanelResult>>(DialogRef);
  readonly data = inject<PaymentPanelData>(DIALOG_DATA);
  private readonly api = inject(BillingApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly invoice = this.data.invoice;
  readonly currency = this.invoice.currency || 'USD';
  readonly platformAdmin = this.data.platformAdmin;
  readonly methods = PAYMENT_METHODS;
  readonly slipAccept = SLIP_ACCEPT;
  readonly referenceMax = REFERENCE_MAX;
  readonly noteMax = NOTE_MAX;
  /** What can still be paid: the balance less slips awaiting verification. */
  readonly open = openToPay(Number(this.invoice.balance), this.data.pending, this.currency);
  readonly step = minorDigits(this.currency) === 0 ? '1' : (1 / 10 ** minorDigits(this.currency)).toFixed(minorDigits(this.currency));
  readonly heading = (this.platformAdmin ? 'Record a payment for ' : 'Upload a payment slip for ') + this.invoice.number;
  readonly subtitle = `${this.invoice.tenantName ?? 'Workspace'} · balance due ${this.money(Number(this.invoice.balance))} ${this.currency}`;
  /** One key for every try of this form: a double click or a retry is the same payment. */
  private readonly idempotencyKey = newIdempotencyKey();

  readonly amount = signal(this.open > 0 ? this.open.toFixed(Math.max(minorDigits(this.currency), 0)) : '');
  readonly method = signal('bank');
  readonly receivedOn = signal('');
  readonly reference = signal('');
  readonly note = signal('');
  readonly slip = signal<File | null>(null);
  /** A platform administrator's choice; a workspace's slip is always awaiting verification. */
  readonly counting = signal<Counting>('verified');
  readonly submitted = signal(false);
  readonly touched = signal<Record<string, boolean>>({});
  readonly busy = signal(false);
  /** Billing's refusal, kept in the panel; `serverField` is the field it is about, when it names one. */
  readonly serverError = signal('');
  readonly serverField = signal<'' | 'amount' | 'receivedOn' | 'slip' | 'reference' | 'note'>('');
  /** The workspace's billing time zone and today in it, from Billing; the invoice's zone and the computer's day until then. */
  readonly zone = signal(this.invoice.timeZone || '');
  readonly today = signal(new Date().toISOString().slice(0, 10));

  readonly amountValue = computed(() => Number(this.amount()));
  readonly amountError = computed(() => this.shown('amount', amountProblem(this.amount(), this.open, this.data.pending, this.currency, v => this.money(v))));
  readonly dayError = computed(() => this.shown('receivedOn', dayProblem(this.receivedOn(), this.today(), this.zone(), dayText)));
  readonly referenceError = computed(() => this.shown('reference', this.reference().length > REFERENCE_MAX ? `At most ${REFERENCE_MAX} characters.` : ''));
  readonly noteError = computed(() => this.shown('note', this.note().length > NOTE_MAX ? `At most ${NOTE_MAX} characters.` : ''));
  readonly slipError = computed(() => this.shown('slip', slipProblem(this.slip(), !this.platformAdmin, formatSize)));
  /** Every problem, whether shown yet or not: the button stays honest about what Billing would refuse. */
  readonly problems = computed(() => [
    amountProblem(this.amount(), this.open, this.data.pending, this.currency, v => this.money(v)),
    dayProblem(this.receivedOn(), this.today(), this.zone(), dayText),
    this.reference().length > REFERENCE_MAX ? 'reference' : '', this.note().length > NOTE_MAX ? 'note' : '',
    slipProblem(this.slip(), !this.platformAdmin, formatSize),
  ].filter(Boolean));

  readonly verifiedNow = computed(() => this.platformAdmin && this.counting() === 'verified');
  readonly isFull = computed(() => !this.amountError() && this.amountValue() > 0 && roundMoney(this.open - this.amountValue(), this.currency) === 0);
  readonly leaves = computed(() => Math.max(0, roundMoney(Number(this.invoice.balance) - (this.amountValue() || 0), this.currency)));
  readonly primaryLabel = computed(() => !this.platformAdmin ? 'Send slip for verification' : this.verifiedNow() ? 'Record and verify' : 'Record payment');
  readonly dayHint = computed(() => `The day the money ${this.platformAdmin ? 'arrived' : 'was sent'}, in ${this.zone() || 'the workspace\'s billing time zone'}. Blank: today.`);

  /** What the button will do, in the order it happens. */
  readonly nextSteps = computed<string[]>(() => {
    const amount = this.amountValue() > 0 && !this.amountError() ? this.money(this.amountValue()) : 'The payment';
    const n = this.invoice.number;
    if (!this.platformAdmin) {
      return [`${amount} is sent to the platform with the slip, as awaiting verification.`,
        'The balance moves and a receipt is issued once the platform verifies it; you can follow it under Payments.'];
    }
    if (this.verifiedNow()) {
      return [`${amount} is recorded as received${this.receivedOn() ? ' on ' + dayText(this.receivedOn()) : ' today'} and counts at once.`,
        this.isFull() ? `${n} becomes Paid.` : `${this.money(this.leaves())} stays open on ${n}.`,
        'A receipt is issued and listed under Documents; the payment shows under Payments and in the history.'];
    }
    return [`${amount} is listed under Payments as awaiting verification.`, 'The balance moves and a receipt is issued once someone verifies it.'];
  });

  ngOnInit(): void {
    // A platform administrator names the workspace; a workspace administrator reads its own.
    this.api.timeZone(this.platformAdmin ? this.invoice.tenantId : null).subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data) { if (r.data.zone) this.zone.set(r.data.zone); if (r.data.today) this.today.set(r.data.today); } },
      error: () => { /* the invoice's zone and the computer's day stand */ },
    });
  }

  money(v: number): string { return formatMoney(v, this.currency); }

  touch(field: string): void { this.touched.update(t => ({ ...t, [field]: true })); }

  private shown(field: string, problem: string): string {
    if (this.serverField() === field && this.serverError()) return this.serverError();
    return problem && (this.submitted() || this.touched()[field]) ? problem : '';
  }

  setAmount(v: string): void { this.amount.set(v.trim()); this.clearServer('amount'); }
  payInFull(): void { this.setAmount(this.open.toFixed(minorDigits(this.currency))); this.touch('amount'); }
  setDay(day: string): void { this.receivedOn.set(day); this.touch('receivedOn'); this.clearServer('receivedOn'); }
  setSlip(file: File | null): void { this.slip.set(file); this.touch('slip'); this.clearServer('slip'); }

  private clearServer(field: string): void { if (this.serverField() === field || !this.serverField()) { this.serverError.set(''); this.serverField.set(''); } }

  submit(): void {
    if (this.busy()) return;
    this.submitted.set(true);
    this.serverError.set(''); this.serverField.set('');
    if (this.problems().length) { focusFirstInvalid(this.host.nativeElement, this.injector); return; }
    this.busy.set(true);
    this.api.submitPayment(this.invoice.invoiceId, this.amount(), this.method(), this.reference().trim(), this.note().trim(), this.slip(), {
      currency: this.currency, receivedOn: this.receivedOn() || undefined, verified: this.verifiedNow(), idempotencyKey: this.idempotencyKey,
    }).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS) { this.refused(r.message); return; }
        this.ref.close({ message: r.message, payment: r.data ?? null });
      },
      error: err => { this.busy.set(false); this.refused(err?.error?.message || 'The payment could not be recorded. Nothing was saved; try again.'); },
    });
  }

  /** Billing's sentence, by the field it is about when it names one, else at the top of the panel. */
  private refused(message: string): void {
    const m = message.toLowerCase();
    const field = /amount|owed|decimal|balance|billed in/.test(m) ? 'amount' : /day received|valid date/.test(m) ? 'receivedOn'
      : /slip|pdf|png|jpeg|mb\b|too large/.test(m) ? 'slip' : /reference/.test(m) ? 'reference' : /note/.test(m) ? 'note' : '';
    this.serverField.set(field);
    this.serverError.set(message);
  }

  close(): void { this.ref.close(); }
}
