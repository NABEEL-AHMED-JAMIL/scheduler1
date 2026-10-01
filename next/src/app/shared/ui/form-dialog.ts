import { Component, DestroyRef, ElementRef, Injector, inject, input, output } from '@angular/core';
import { Icon } from './icon';
import { focusFirstInvalid } from './focus-first-invalid';

/**
 * Shell for the short create/edit dialogs that sit beside a list. Keeps the header, scrolling
 * body and footer identical across them, so every one of these forms behaves the same way at
 * any window height.
 */
@Component({
  selector: 'app-form-dialog',
  imports: [Icon],
  template: `
    <!-- width as a style rather than a toggled utility class: Angular class bindings do not
         reliably carry a Tailwind arbitrary value like w-[58rem], and silently applying
         neither left the card sized to its content. -->
    <div class="card shadow-2xl max-w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col overflow-hidden"
         [style.width]="size() === 'xwide' ? 'min(92vw, 76rem)' : size() === 'wide' ? '58rem' : '34rem'">
      <div class="px-5 py-3.5 border-b shrink-0 border-subtle">
        <h2 class="text-base font-semibold">{{ heading() }}</h2>
        @if (subtitle()) {
          <p class="text-sm text-[color:var(--text-secondary)] mt-0.5">{{ subtitle() }}</p>
        }
      </div>

      <div class="form-dialog-body flex-1 overflow-y-auto px-5 py-5 min-h-0">
        <ng-content />
      </div>

      <div class="flex items-center gap-2 px-5 py-3.5 border-t shrink-0 border-subtle"
          >
        <ng-content select="[footer-start]" />
        <div class="ml-auto flex gap-2">
          <button type="button" class="btn btn-default btn-sm" [disabled]="saving()"
                  (click)="cancelled.emit()">{{ cancelLabel() }}</button>
          @if (showConfirm()) {
            <button type="button" class="btn btn-sm" [class.btn-primary]="!danger()" [class.btn-danger]="danger()"
                    [disabled]="saving() || confirmDisabled()" (click)="confirm()">
              @if (saving()) { <app-icon name="refresh" class="spin" /> }
              {{ saving() ? busyLabel() : confirmLabel() }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class FormDialog {
  readonly heading = input.required<string>();
  readonly subtitle = input('');
  readonly confirmLabel = input('Save');
  /** What the confirm says while `saving` is on -- "Sending…", "Deleting…". */
  readonly busyLabel = input('Saving…');
  /** "Close" for a dialog that only shows something; "Cancel" for one that would change it. */
  readonly cancelLabel = input('Cancel');
  /** Off for a read-only dialog: nothing to confirm, so the footer is the dismissal alone. */
  readonly showConfirm = input(true);
  readonly saving = input(false);
  /**
   * 'wide' for forms with enough fields that the default column runs to two screens of
   * scrolling -- the Kafka profile is thirteen fields plus TLS material and a guide. The
   * form grid is container-query driven, so the extra width becomes extra columns on its
   * own, and max-w keeps it inside a tablet viewport.
   *
   * 'xwide' is for a form that builds a *list* of something rather than filling in fields --
   * Pipelines' field builder, where each row is its own card and the win from more width
   * is fitting two cards across rather than more columns inside one.
   */
  readonly size = input<'default' | 'wide' | 'xwide'>('default');
  /** A destructive confirm (void, reject, delete) reads as one. */
  readonly danger = input(false);
  /** Kept off until the form has what it needs -- a required reason, say. */
  readonly confirmDisabled = input(false);
  readonly cancelled = output<void>();
  readonly confirmed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; });
  }

  /**
   * The dialog's save runs first (the output is synchronous); if it marked fields to fix, focus
   * goes to the first of them, so every dialog's "Check the highlighted fields." gets it at once.
   * A handler that closed the dialog has destroyed this shell with it: there is nothing to focus,
   * and asking for the next render of a destroyed view throws NG0911 (MIG-310).
   */
  confirm(): void {
    this.confirmed.emit();
    if (this.destroyed) return;
    focusFirstInvalid(this.host.nativeElement, this.injector);
  }
}
