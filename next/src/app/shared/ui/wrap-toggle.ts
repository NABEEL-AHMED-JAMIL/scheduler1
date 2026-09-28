import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * "Wrap text": long values on one clamped line, or on several.
 *
 * The Data grid's switch (owner, 2026-09-24), lifted out so that the result tables -- SQL, Canvas,
 * a dashboard table expanded -- carry the same control rather than a look-alike (owner,
 * 2026-09-28). Pressed state is aria-pressed, as a toggle button's should be; the caller owns the
 * state and where it is remembered.
 */
@Component({
  selector: 'app-wrap-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button type="button" class="btn btn-xs"
            [class.btn-primary]="on()" [class.btn-default]="!on()"
            [attr.aria-pressed]="on()"
            [title]="hint()"
            (click)="toggled.emit(!on())">
      <app-icon name="wrapText" />Wrap text
    </button>
  `,
})
export class WrapToggle {
  readonly on = input(false);
  readonly hint = input('Show long values in full, wrapped inside each column');
  readonly toggled = output<boolean>();
}
