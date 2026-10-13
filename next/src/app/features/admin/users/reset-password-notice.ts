import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { copyText } from '../../../shared/ui/clipboard.util';
import { Icon } from '../../../shared/ui/icon';
import { ResetPasswordResult } from './reset-password-dialog';

/** How long the notice -- and with it the one copy of the password the console holds -- stays. */
export const RESET_NOTICE_MS = 120_000;

/**
 * What a reset that happened says, after its dialog has closed: whose password it was, that they choose their own at
 * their next sign-in (the server set mustChangePassword on somebody else's account), and "Copy password" -- to the
 * clipboard only. The password is never rendered and never logged; it goes when the notice does (dismissed, two
 * minutes, another reset, or the screen left).
 *
 * A notice of its own rather than a toast: a toast is gone in four seconds and carries no action, and this is the one
 * message about a reset the administrator must not miss.
 */
@Component({
  selector: 'app-reset-password-notice',
  imports: [Icon],
  template: `
    @if (result(); as r) {
      <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[30rem] max-w-[calc(100vw-2rem)]
                  card shadow-lg px-4 py-3 flex items-start gap-3 text-sm border-l-4 tone-edge tone-ok" role="status" aria-live="polite" data-test="reset-password-done">
        <app-icon name="checkCircle" class="text-ok-500 mt-0.5 shrink-0" />
        <div class="flex-1 min-w-0">
          @if (r.own) {
            <p class="font-medium">Your password has been reset.</p>
            <p class="text-[color:var(--text-secondary)] mt-0.5">Use it the next time you sign in.</p>
          } @else {
            <p class="font-medium">Password reset for {{ r.name }}.</p>
            <p class="text-[color:var(--text-secondary)] mt-0.5">They'll be asked to choose a new one at their next sign-in.</p>
          }
          @if (r.password) {
            <button type="button" class="btn btn-default btn-sm mt-2" (click)="copy(r.password)" data-test="copy-reset-password">
              <app-icon [name]="copied() ? 'check' : 'copy'" />{{ copied() ? 'Copied' : 'Copy password' }}
            </button>
            @if (copyFailed()) {
              <p class="field-note text-crit-500 mt-1">The browser did not allow the copy.</p>
            }
          }
        </div>
        <button type="button" class="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                (click)="dismissed.emit()" aria-label="Dismiss" data-test="reset-password-done-dismiss">
          <app-icon name="close" size="0.9em" />
        </button>
      </div>
    }
  `,
})
export class ResetPasswordNotice {
  readonly result = input<ResetPasswordResult | null>(null);
  readonly dismissed = output<void>();
  readonly copied = signal(false);
  readonly copyFailed = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const r = this.result();
      this.copied.set(false);
      this.copyFailed.set(false);
      if (this.timer) clearTimeout(this.timer);
      this.timer = r ? setTimeout(() => this.dismissed.emit(), RESET_NOTICE_MS) : null;
    });
    inject(DestroyRef).onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
  }

  async copy(password: string): Promise<void> {
    const done = await copyText(password);
    this.copied.set(done);
    this.copyFailed.set(!done);
  }
}
