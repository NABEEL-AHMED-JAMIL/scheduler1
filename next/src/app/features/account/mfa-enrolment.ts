import { Component, input, output, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { CopyButton } from '../../shared/ui/copy-button';
import { copyText } from '../../shared/ui/clipboard.util';
import { MfaEnrolment } from './account-security.api';

/**
 * MIG-353 part 4: one enrolment's QR code and secret (shown once), and the code that confirms it. Used on My account ›
 * Security and on the sign-in page when the workspace requires two-factor login. The QR code is the server's SVG path,
 * drawn here on a white square so a phone reads it in either theme.
 */
@Component({
  selector: 'app-mfa-enrolment',
  imports: [Icon, CopyButton],
  template: `
    <div class="flex flex-col sm:flex-row gap-4 items-start" data-test="mfa-enrolment">
      <svg class="shrink-0 rounded-md border border-subtle" width="176" height="176" role="img"
           [attr.viewBox]="'-2 -2 ' + (enrolment().qr.size + 4) + ' ' + (enrolment().qr.size + 4)"
           [attr.aria-label]="'QR code to add ' + enrolment().account + ' to an authenticator app'" shape-rendering="crispEdges">
        <!-- Black on white in both themes, as a scanner expects: the code is data, not the console's palette. -->
        <rect x="-2" y="-2" [attr.width]="enrolment().qr.size + 4" [attr.height]="enrolment().qr.size + 4" fill="white" />
        <path [attr.d]="enrolment().qr.path" fill="black" />
      </svg>
      <div class="min-w-0 flex-1 space-y-3">
        <ol class="text-sm list-decimal pl-5 space-y-1 text-[color:var(--text-secondary)]">
          <li>Open an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password, Authy…).</li>
          <li>Scan the code, or type the key below.</li>
          <li>Type the 6-digit code the app shows.</li>
        </ol>
        <div>
          <div class="text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">Key</div>
          <div class="flex items-center gap-1">
            <code class="mono text-sm break-all" data-test="mfa-secret">{{ enrolment().secret }}</code>
            <app-copy-button value="key" [copied]="copied()" copiedLabel="Key copied" (copy)="copy()" />
          </div>
        </div>
        <form class="flex flex-wrap items-end gap-2" (submit)="$event.preventDefault(); submit()">
          <div class="field">
            <label class="label" for="mfa-enrol-code">Code from the app</label>
            <input id="mfa-enrol-code" class="input w-36 mono tracking-widest" inputmode="numeric" autocomplete="one-time-code"
                   maxlength="7" placeholder="123456" [value]="code()" (input)="code.set($any($event.target).value)" />
          </div>
          <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy() || code().replace(' ', '').length !== 6">
            <app-icon name="shield" [busy]="busy()" />Turn on
          </button>
        </form>
        @if (error()) {
          <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
            <app-icon name="alert" size="0.9em" class="mt-px shrink-0" /><span>{{ error() }}</span>
          </p>
        }
      </div>
    </div>
  `,
})
export class MfaEnrolmentPanel {
  readonly enrolment = input.required<MfaEnrolment>();
  readonly busy = input(false);
  readonly error = input('');
  readonly confirmed = output<string>();

  readonly code = signal('');
  readonly copied = signal(false);

  submit(): void {
    const code = this.code().replace(/\s/g, '');
    if (code.length === 6) this.confirmed.emit(code);
  }

  copy(): void {
    void copyText(this.enrolment().secret.replace(/\s/g, '')).then(ok => {
      this.copied.set(ok);
      if (ok) setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
