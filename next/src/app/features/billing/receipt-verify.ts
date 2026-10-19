import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { BillingApi, ReceiptVerdict } from './billing.service';

/** The dialog's heading id, for the opener's ariaLabelledBy. */
export const RECEIPT_VERIFY_TITLE_ID = 'receipt-verify-title';

/** What the dialog checks: a receipt Billing keeps (by its number), or a file someone sends back. */
export interface ReceiptVerifyData { number?: string | null; }

/** "866d6235…663ed351": a fingerprint short enough for a line, the whole of it in the tooltip. */
export function shortHash(hex: string | null | undefined): string {
  return !hex ? '' : hex.length <= 20 ? hex : `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

/**
 * Owner #10 (MIG-393): a verdict on a receipt -- one line that says whether it is genuine, then each check with its own
 * glyph and word (signed, unchanged since signing, certified with no changes allowed, exactly as issued, the platform's
 * certificate), who signed and when, and why a PDF reader may say "validity unknown". Never colour alone: a check that
 * holds has a tick and "Yes", one that fails a cross and "No".
 */
@Component({
  selector: 'app-receipt-verdict',
  imports: [Icon, ServerTimePipe],
  template: `
    @if (verdict(); as v) {
      <div class="receipt-verdict" [class.is-ok]="v.verified" [class.is-bad]="!v.verified" role="status" data-test="receipt-verdict">
        <app-icon [name]="v.verified ? 'shield' : 'alert'" size="1.25rem" class="shrink-0" />
        <div class="min-w-0">
          <p class="text-sm font-semibold" data-test="receipt-verdict-summary">{{ v.verified ? 'Genuine receipt' : v.signature.signed ? 'Does not verify' : 'Not signed' }}</p>
          <p class="text-xs text-[color:var(--text-secondary)]">{{ v.summary }}</p>
        </div>
      </div>
      <ul class="receipt-checks" aria-label="Checks">
        @for (c of v.checks; track c.key) {
          <li [attr.data-check]="c.key" [class.is-ok]="c.ok">
            <app-icon [name]="c.ok ? 'checkCircle' : 'xCircle'" size="1em" class="shrink-0 mt-0.5" />
            <div class="min-w-0"><span class="font-medium">{{ c.label }}</span> <span class="receipt-check-word">{{ c.ok ? 'Yes' : 'No' }}</span>
              <div class="text-xs text-[color:var(--text-secondary)] break-words">{{ c.detail }}</div></div>
          </li>
        }
      </ul>
      @if (v.signature.signed) {
        <dl class="receipt-facts">
          <dt>Signed by</dt><dd>{{ v.signature.signerName }}</dd>
          <dt>Reason</dt><dd>{{ v.signature.reason || '—' }}</dd>
          @if (v.signature.signedAt) { <dt>Signed</dt><dd class="tabular">{{ v.signature.signedAt | serverTime: 'dateTime' }}</dd> }
          <dt>Certificate</dt><dd class="mono" [title]="v.signature.certificateSha256 || ''">SHA-256 {{ short(v.signature.certificateSha256) }}</dd>
          @if (v.receipt) { <dt>Receipt</dt><dd class="mono">{{ v.receipt.number }}</dd> }
          <dt>File</dt><dd class="mono" [title]="v.signature.sha256">SHA-256 {{ short(v.signature.sha256) }}</dd>
        </dl>
        <p class="text-[11px] text-[color:var(--text-muted)] leading-snug" data-test="receipt-trust-note">{{ v.trustNote }}</p>
      }
    }
  `,
})
export class ReceiptVerdictView {
  readonly verdict = input<ReceiptVerdict | null>(null);
  readonly short = shortHash;
}

/**
 * "Verify this receipt": the stored copy of a receipt by its number, or a PDF handed back -- the same checks either way,
 * and the platform's certificate to download for a reader that wants to trust it by hand.
 */
@Component({
  selector: 'app-receipt-verify-dialog',
  imports: [Icon, FileDropzone, ReceiptVerdictView],
  template: `
    <div class="card shadow-2xl w-[34rem] max-w-[calc(100vw-2rem)] max-h-[88vh] flex flex-col overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-2.5 border-b shrink-0 border-subtle">
        <app-icon name="shield" class="icon-info shrink-0" size="1.05em" />
        <h2 [id]="titleId" class="text-sm font-medium mr-auto truncate">{{ data.number ? 'Verify ' + data.number : 'Verify a receipt file' }}</h2>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="ref.close()" aria-label="Close"><app-icon name="close" /></button>
      </div>
      <div class="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-3">
        @if (!data.number) {
          <p class="text-xs text-[color:var(--text-secondary)]">Choose the receipt's PDF as it was sent or downloaded. It is checked here and not kept.</p>
          <app-file-dropzone [file]="file()" (fileChange)="pick($event)" accept="application/pdf,.pdf" prompt="Drop the receipt PDF here" hint="PDF · up to 10 MB" />
        }
        @if (busy()) {
          <div class="flex items-center gap-2 text-sm text-[color:var(--text-muted)]"><span class="spinner"></span>Checking the signature…</div>
        } @else if (error()) {
          <div class="step-notice step-notice-crit" role="alert"><app-icon name="alert" class="icon-crit shrink-0 mt-0.5" /><div>{{ error() }}</div></div>
        }
        <app-receipt-verdict [verdict]="verdict()" />
      </div>
      <div class="flex items-center gap-2 px-4 py-2.5 border-t border-subtle shrink-0">
        <button type="button" class="btn btn-ghost btn-sm mr-auto" (click)="downloadCertificate()" [disabled]="!signed()" data-test="download-certificate"
                title="The platform's receipt certificate (PEM), to trust by hand in a PDF reader"><app-icon name="download" />Download certificate</button>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button>
      </div>
    </div>
  `,
})
export class ReceiptVerifyDialog implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(BillingApi);
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<ReceiptVerifyData>(DIALOG_DATA, { optional: true }) ?? {};
  readonly titleId = RECEIPT_VERIFY_TITLE_ID;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly file = signal<File | null>(null);
  readonly verdict = signal<ReceiptVerdict | null>(null);
  readonly signed = computed(() => !!this.verdict()?.signature.signed);

  ngOnInit(): void {
    if (this.data.number) this.run(this.api.verifyReceipt(this.data.number));
  }

  pick(file: File | null): void {
    this.file.set(file);
    this.verdict.set(null);
    this.error.set('');
    if (file) this.run(this.api.verifyReceiptFile(file));
  }

  private run(call: ReturnType<BillingApi['verifyReceipt']>): void {
    this.busy.set(true);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => { this.busy.set(false); if (r.status === API_SUCCESS && r.data) this.verdict.set(r.data); else this.error.set(r.message || 'The receipt could not be checked.'); },
      error: e => { this.busy.set(false); this.error.set(e?.error?.message || 'The receipt could not be checked.'); },
    });
  }

  downloadCertificate(): void {
    this.api.receiptCertificate().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: b => BillingApi.save(b, 'receipt-signing-certificate.pem'),
      error: () => this.error.set('The certificate could not be downloaded.'),
    });
  }
}
