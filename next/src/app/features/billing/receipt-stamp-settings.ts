import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { PdfViewer } from '../objects/preview/pdf-viewer';
import { formatSize } from '../../shared/ui/format-size';
import { BillingApi, ReceiptStamp } from './billing.service';
import { WorkspacePicker } from './workspace-picker';
import { shortHash } from './receipt-verify';
import { AppLoading, loadErrorText } from '../../shared/ui/loading';
import { LoadError } from '../../shared/ui/load-error';

/**
 * Owner #10 (MIG-393), Billing › Settings › Receipt stamp: the stamp every receipt carries -- the platform's image, one
 * workspace's own, or (neither set) the generated one: the platform name, PAID and the receipt number -- with a specimen
 * receipt to look at before any receipt is issued with it, and whether receipts are digitally signed and with which
 * certificate (never the key). Platform administrators only; receipts already issued keep the stamp they were issued with.
 */
@Component({
  selector: 'app-receipt-stamp-settings',
  imports: [Icon, FileDropzone, ServerTimePipe, PdfViewer, AppLoading, LoadError],
  template: `
    <section class="card p-0 overflow-hidden" aria-labelledby="receipt-stamp-title" data-test="receipt-stamp-settings">
      <header class="flex items-start gap-3 px-5 py-4 border-b border-subtle flex-wrap">
        <div class="min-w-0 mr-auto">
          <h2 id="receipt-stamp-title" class="font-semibold text-sm flex items-center gap-2"><app-icon name="shield" size="1em" />Receipt stamp and signature</h2>
          <p class="text-xs text-[color:var(--text-muted)] mt-0.5 max-w-3xl">Every receipt is stamped and digitally signed when its payment is verified. A workspace's own stamp comes first, then the platform's; with neither, receipts carry the generated PAID stamp.</p>
        </div>
        <select class="input w-80 max-w-full" [value]="scope()" (change)="pickScope($any($event.target).value)" aria-label="Whose stamp" data-test="stamp-scope">
          <option value="">The platform (every workspace)</option>
          @for (o of workspaces.options(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>
      </header>

      <div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div class="p-5 flex flex-col gap-4 min-w-0">
          <!-- Owner 2026-10-27: a skeleton until the stamp answers (and for another scope), the reason with Try again when it fails. -->
          @if (error()) {
            <div class="step-notice step-notice-crit" role="alert"><app-icon name="alert" class="icon-crit shrink-0 mt-0.5" />
              <div>{{ error() }} <button type="button" class="btn btn-default btn-xs ml-1" (click)="load()"><app-icon name="refresh" />Try again</button></div></div>
          } @else if (infoLoading() && !info()) {
            <app-loading shape="panel" label="Reading the stamp…" [count]="4" />
          } @else if (info(); as s) {
            <dl class="receipt-facts" data-test="stamp-facts">
              <dt>Receipts use</dt>
              <dd><span [class]="'pill pill-pay ' + (s.uses === 'generated' ? 'pill-neutral' : 'pill-pay-verified')" data-test="stamp-uses">{{ usesLabel() }}</span></dd>
              @if (current(); as c) {
                <dt>Image</dt><dd class="min-w-0"><span class="mono">{{ c.fileName }}</span> · {{ humanSize(c.sizeBytes) }}@if (c.dateUpdated) { · {{ c.dateUpdated | serverTime: 'recent' }} }</dd>
              }
              <dt>Signature</dt>
              <dd>
                @if (s.signing.configured) {
                  <span class="pill pill-pay pill-pay-verified"><app-icon name="shield" size="0.85em" />Signed</span>
                  <span class="text-[color:var(--text-secondary)]"> by {{ s.signing.signerName }} · "{{ s.signing.reason }}"</span>
                } @else {
                  <span class="pill pill-pay pill-pay-pending"><app-icon name="alert" size="0.85em" />Not signed</span>
                  <span class="text-[color:var(--text-secondary)]"> no signing key is configured (scripts/receipt-signing-key.sh)</span>
                }
              </dd>
              @if (s.signing.configured) {
                <dt>Certificate</dt><dd class="mono" [title]="s.signing.certificateSha256 || ''">SHA-256 {{ short(s.signing.certificateSha256) }}</dd>
                <dt>Valid until</dt><dd class="tabular">{{ s.signing.notAfter | serverTime: 'date' }}@if (s.signing.selfIssued) { · self-issued }</dd>
              }
            </dl>
            @if (s.signing.selfIssued) {
              <p class="text-[11px] text-[color:var(--text-muted)] leading-snug max-w-xl">A self-issued certificate: PDF readers show the signature as intact with "validity unknown" until a certificate from a trusted authority replaces it. The console's Verify checks it against the platform's own.</p>
            }
          }

          <div>
            <span class="label">{{ scope() ? 'This workspace\\'s stamp image' : 'The platform\\'s stamp image' }}</span>
            <app-file-dropzone [file]="file()" (fileChange)="file.set($event)" accept="image/png,image/jpeg,.png,.jpg,.jpeg" prompt="Drop a stamp image here" hint="PNG or JPEG · up to 512 KB · 2400 px a side" />
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="!file() || busy()" data-test="stamp-save"><app-icon name="upload" [busy]="busy()" />Save stamp</button>
            <button type="button" class="btn btn-default btn-sm" (click)="remove()" [disabled]="!current() || busy()" data-test="stamp-remove"><app-icon name="trash" />{{ scope() ? 'Use the platform\\'s stamp' : 'Use the generated stamp' }}</button>
            <button type="button" class="btn btn-default btn-sm" (click)="downloadCertificate()" [disabled]="!info()?.signing?.configured"><app-icon name="download" />Download certificate</button>
          </div>
        </div>
        <div class="border-t lg:border-t-0 lg:border-l border-subtle flex flex-col min-w-0">
          <div class="flex items-center gap-2 px-4 py-2 border-b border-subtle">
            <span class="text-xs font-medium mr-auto">Specimen receipt</span>
            <button type="button" class="btn btn-default btn-xs" (click)="loadSpecimen()" [disabled]="specimenLoading()"><app-icon name="refresh" [busy]="specimenLoading()" />Refresh</button>
          </div>
          <div class="h-[34rem] flex flex-col min-h-0" data-test="stamp-specimen">
            @if (specimenUrl()) { <app-pdf-viewer [src]="specimenUrl()" /> }
            @else if (specimenLoading()) { <app-loading class="flex-1" shape="spinner" label="Drawing the specimen…" /> }
            @else if (specimenError()) { <app-load-error class="flex-1" [message]="specimenError()" (retry)="loadSpecimen()" /> }
            @else { <div class="flex-1 grid place-items-center text-sm text-[color:var(--text-muted)]">No specimen yet.</div> }
          </div>
        </div>
      </div>
    </section>
  `,
})
export class ReceiptStampSettings implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(BillingApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  readonly workspaces = inject(WorkspacePicker);
  readonly humanSize = formatSize;
  readonly short = shortHash;

  /** Whose stamp: '' the platform's, else a workspace id. */
  readonly scope = signal('');
  readonly info = signal<ReceiptStamp | null>(null);
  readonly error = signal('');
  /** Owner 2026-10-27: the stamp's read, loading from the start (the workspace list is read first). */
  readonly infoLoading = signal(true);
  readonly busy = signal(false);
  readonly file = signal<File | null>(null);
  readonly specimenUrl = signal<string | null>(null);
  readonly specimenLoading = signal(false);
  /** A specimen that could not be drawn says so; it read "No specimen yet." */
  readonly specimenError = signal('');
  /** The latest reads: a reply for the scope picked before this one never lands under this one. */
  private infoSeq = 0;
  private specimenSeq = 0;

  readonly current = computed(() => { const s = this.info(); return s ? (this.scope() ? s.workspace ?? null : s.platform) : null; });
  readonly usesLabel = computed(() => {
    const s = this.info();
    if (!s) return '';
    return s.uses === 'workspace' ? 'This workspace\'s image' : s.uses === 'platform' ? 'The platform\'s image' : 'The generated stamp';
  });

  ngOnInit(): void { this.workspaces.ready(() => this.load()); }
  ngOnDestroy(): void { this.revoke(); }

  private tenant(): number | null { return this.scope() ? Number(this.scope()) : null; }

  /** Another scope is another stamp: the last one's facts go, so they never read as this one's (owner 2026-10-27). */
  pickScope(value: string): void { this.scope.set(value); this.file.set(null); this.info.set(null); this.revoke(); this.load(); }

  load(): void {
    const seq = ++this.infoSeq;
    const unread = 'The stamp could not be read.';
    this.error.set(''); this.infoLoading.set(true);
    this.api.stamp(this.tenant()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        if (seq !== this.infoSeq) return;
        this.infoLoading.set(false);
        if (r.status === API_SUCCESS && r.data) this.info.set(r.data); else this.error.set(loadErrorText(r, unread));
      },
      error: e => { if (seq !== this.infoSeq) return; this.infoLoading.set(false); this.error.set(loadErrorText(e, unread)); },
    });
    this.loadSpecimen();
  }

  loadSpecimen(): void {
    const seq = ++this.specimenSeq;
    this.specimenLoading.set(true); this.specimenError.set('');
    this.api.stampSpecimen(this.tenant()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: b => { if (seq !== this.specimenSeq) return; this.specimenLoading.set(false); this.revoke(); this.specimenUrl.set(URL.createObjectURL(b)); },
      error: () => {
        if (seq !== this.specimenSeq) return;
        this.specimenLoading.set(false); this.revoke(); this.specimenError.set('The specimen could not be drawn just now.');
      },
    });
  }

  private revoke(): void { const u = this.specimenUrl(); if (u) URL.revokeObjectURL(u); this.specimenUrl.set(null); }

  save(): void {
    const f = this.file();
    if (!f || this.busy()) return;
    this.busy.set(true);
    this.api.saveStamp(f, this.tenant()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The stamp could not be saved.'); return; }
        this.toast.success(r.message); this.info.set(r.data); this.file.set(null); this.loadSpecimen();
      },
      error: e => { this.busy.set(false); this.toast.error(e?.error?.message || 'The stamp could not be saved.'); },
    });
  }

  async remove(): Promise<void> {
    if (!this.current() || this.busy()) return;
    const ok = await confirmWith(this.dialog, {
      title: this.scope() ? 'Use the platform\'s stamp?' : 'Use the generated stamp?',
      body: 'Receipts issued from now on show it. Receipts already issued keep the stamp they were issued with.',
      confirmLabel: 'Remove image',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.removeStamp(this.tenant()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => { this.busy.set(false); if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); return; } this.toast.success(r.message); this.info.set(r.data); this.loadSpecimen(); },
      error: e => { this.busy.set(false); this.toast.error(e?.error?.message || 'The stamp could not be removed.'); },
    });
  }

  downloadCertificate(): void {
    this.api.receiptCertificate().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: b => BillingApi.save(b, 'receipt-signing-certificate.pem'),
      error: () => this.toast.error('The certificate could not be downloaded.'),
    });
  }
}
