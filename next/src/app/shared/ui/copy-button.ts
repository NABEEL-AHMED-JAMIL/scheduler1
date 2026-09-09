import { Component, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * A small icon-only "copy this to the clipboard" affordance, always visible rather than
 * revealed on hover -- a control that only exists under a pointer is unreachable by keyboard
 * and invisible on a touch screen. Three screens had this hand-copied byte-for-byte; this is
 * the one place it lives now. The caller owns the actual clipboard write and the "copied"
 * flag, since that state (and its timeout) is shared with the rest of the row.
 */
@Component({
  selector: 'app-copy-button',
  imports: [Icon],
  template: `
    <button type="button" class="shrink-0 p-0.5 rounded text-[color:var(--text-muted)] hover:text-[color:var(--accent-text)] transition-colors"
            [class.ml-auto]="pushRight()"
            [attr.aria-label]="copied() ? copiedLabel() : 'Copy ' + value()"
            [title]="copied() ? 'Copied' : 'Copy'"
            (click)="copy.emit()">
      <app-icon [name]="copied() ? 'check' : 'copy'" size="0.85em" [class]="copied() ? 'icon-ok' : ''" />
    </button>
  `,
})
export class CopyButton {
  /** The value being copied, only used to build the default aria-label. */
  readonly value = input('');
  readonly copied = input(false);
  /** Announced once copied; e.g. "Address copied". Falls back to a generic label. */
  readonly copiedLabel = input('Copied');
  /** The row layouts push this to the far right of a flex line; profile's does not. */
  readonly pushRight = input(false);
  readonly copy = output<void>();
}
