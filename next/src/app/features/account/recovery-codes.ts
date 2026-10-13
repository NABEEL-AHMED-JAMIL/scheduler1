import { Component, input, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { copyText } from '../../shared/ui/clipboard.util';

/**
 * MIG-353 part 4: a person's recovery codes, the one time they are shown: each good for one sign-in when the phone is
 * not at hand. Copy or download them; they are not shown again.
 */
@Component({
  selector: 'app-recovery-codes',
  imports: [Icon],
  template: `
    <div class="rounded-md border border-[color:var(--accent-mark)] p-3" data-test="recovery-codes">
      <p class="text-sm font-medium">Save your recovery codes</p>
      <p class="text-xs text-[color:var(--text-secondary)] mt-0.5">
        Each one signs you in once if your phone is not at hand. They are shown only now.
      </p>
      <ul class="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 mono text-sm">
        @for (code of codes(); track code) { <li>{{ code }}</li> }
      </ul>
      <div class="flex gap-2 mt-3">
        <button type="button" class="btn btn-default btn-sm" (click)="copy()">
          <app-icon [name]="copied() ? 'check' : 'copy'" />{{ copied() ? 'Copied' : 'Copy' }}
        </button>
        <button type="button" class="btn btn-default btn-sm" (click)="download()"><app-icon name="download" />Download</button>
      </div>
    </div>
  `,
})
export class RecoveryCodes {
  readonly codes = input.required<string[]>();
  readonly account = input('');
  readonly copied = signal(false);

  copy(): void {
    void copyText(this.codes().join('\n')).then(ok => {
      this.copied.set(ok);
      if (ok) setTimeout(() => this.copied.set(false), 2000);
    });
  }

  download(): void {
    const text = `Recovery codes${this.account() ? ' for ' + this.account() : ''}\n\n${this.codes().join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recovery-codes.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
