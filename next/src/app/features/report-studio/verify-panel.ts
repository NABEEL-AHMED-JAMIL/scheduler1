import { Component, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { SidePanel } from '../../shared/ui/side-panel';
import { Icon } from '../../shared/ui/icon';
import { RsTimePipe } from './rs-time.pipe';
import { ReportStudioApi, studioError } from './report-studio.api';
import { VerifyResult } from './report-studio.model';

export interface VerifyData { reportId: string; version: number; label: string; }

/**
 * Verify signature (MIG-406, owner #10): the version's stored PDF, or a file someone sent -- does its digital signature
 * hold (nothing changed after it was signed, nothing appended, a certification that allows no change), whose name and time
 * does it carry, is it one of this workspace's approved versions, and was it signed with the certificate recorded at
 * approval. The platform's own check: it does not need a PDF reader's trust list.
 */
@Component({
  selector: 'app-rs-verify-panel',
  imports: [SidePanel, Icon, RsTimePipe],
  template: `
    <app-side-panel [heading]="'Verify signature: ' + data.label" subtitle="Checks the digital signature the approval put on the PDF.">
      <div class="form-stack">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="stored()"><app-icon name="shield" />Check version {{ data.version }}</button>
          <label class="btn btn-default btn-sm"><app-icon name="upload" />Check a file someone sent
            <input type="file" class="sr-only" accept="application/pdf,.pdf" (change)="file($event)" aria-label="A PDF to check" /></label>
        </div>
        @if (busy()) { <span class="spinner" role="status" aria-label="Checking"></span> }
        @if (error()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
        @if (r(); as r) {
          <div class="rs-banner" [class.rs-banner-ok]="r.verified" [class.rs-banner-crit]="!r.verified" role="status">
            <app-icon [name]="r.verified ? 'checkCircle' : 'alert'" [class]="r.verified ? 'icon-ok shrink-0' : 'icon-crit shrink-0'" />
            <div class="min-w-0 flex-1">
              @if (r.verified) { <b>The signature holds.</b> This is {{ r.reportLabel }} v{{ r.version }} as approved, unchanged since. }
              @else { <b>Not verified.</b> @for (p of r.problems; track $index) { {{ p }} } }
            </div>
          </div>
          <dl class="rs-kv">
            <dt>Signed by</dt><dd>{{ r.signature.signatureName || '—' }}</dd>
            <dt>When</dt><dd>{{ r.signature.signedAt | rsTime: 'dateTime' }}</dd>
            <dt>Reason</dt><dd>{{ r.signature.reason || '—' }}</dd>
            <dt>Certificate</dt><dd>{{ r.signature.signerName || '—' }}@if (r.certificateMatches) { · the one recorded at approval } <br>
              <span class="mono text-xs break-all">{{ r.signature.certificateSha256 }}</span></dd>
            <dt>Unchanged</dt><dd>{{ r.signature.intact && r.signature.coversWholeFile ? 'Yes: nothing changed or added after signing' : 'No' }}</dd>
            <dt>Certified</dt><dd>{{ r.signature.certified ? 'Yes: no change is allowed after it' : 'No' }}</dd>
            <dt>In this workspace</dt><dd>{{ r.matchesStored ? 'Yes: ' + r.reportLabel + ' v' + r.version : 'No stored approved version has this file' }}</dd>
            <dt>SHA-256</dt><dd class="mono text-xs break-all">{{ r.sha256 }}</dd>
          </dl>
          <p class="text-xs text-[color:var(--text-muted)]">Adobe Reader shows the signature as intact with "validity unknown" until a trusted certificate replaces the
            platform's test certificate (on AWS). This check does not need that trust.</p>
        }
      </div>
      <div foot class="flex justify-end"><button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button></div>
    </app-side-panel>
  `,
})
export class VerifyPanel implements OnInit {
  readonly data = inject<VerifyData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<void>>(DialogRef);
  private readonly api = inject(ReportStudioApi);
  readonly r = signal<VerifyResult | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  ngOnInit(): void {
    this.stored();
  }

  stored(): void {
    this.run(this.api.verify(this.data.reportId, this.data.version));
  }

  file(event: Event): void {
    const f = (event.target as HTMLInputElement).files?.[0];
    if (f) this.run(this.api.verifyFile(f));
  }

  private run(call: ReturnType<ReportStudioApi['verify']>): void {
    this.busy.set(true);
    this.error.set('');
    call.subscribe({
      next: r => { this.busy.set(false); this.r.set(r); },
      error: e => { this.busy.set(false); this.r.set(null); this.error.set(studioError(e, 'The file could not be checked.').message); },
    });
  }
}
