import { toneClass } from './tone';
import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ToastService, Toast } from './toast.service';
import { Icon } from './icon';

/**
 * The one place every toast and notice appears: the top right, under the top bar, on every screen (owner 2026-10-19 #29).
 * It used to sit bottom-left while the reset-password notice sat bottom-centre and the idle warning bottom-centre too; a
 * reader had to look in three places. The top right is where the bell is, it is never where a form's Save is, and the
 * floating assistant and file chat stay bottom-right.
 *
 * Accessible: a labelled region; a failure interrupts a screen reader (role=alert, assertive), everything else waits its
 * turn (role=status, polite); every toast has a Dismiss button; Escape dismisses the newest while focus is in the stack;
 * a toast's timer stops while it is hovered or focused, so it never vanishes under the reader. The stack lets clicks
 * through its gaps; only a toast takes them. Above dialogs (z-index), so a dialog's own refusal is never hidden by it.
 */
@Component({
  selector: 'app-toast-host',
  imports: [Icon, NgTemplateOutlet],
  template: `
    <section class="toast-stack fixed right-4 z-[1100] flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)] pointer-events-none"
             aria-label="Notifications" (keydown.escape)="toasts.dismissLatest()" data-test="toast-stack">
      @if (toasts.pinned(); as notice) {
        <div class="pointer-events-auto" data-test="pinned-notice"><ng-container *ngTemplateOutlet="notice" /></div>
      }
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="card shadow-lg px-3.5 py-2.5 flex items-start gap-2.5 text-sm pointer-events-auto border-l-4"
             [attr.role]="toast.tone === 'crit' ? 'alert' : 'status'"
             [attr.aria-live]="toast.tone === 'crit' ? 'assertive' : 'polite'"
             [attr.data-tone]="toast.tone" data-test="toast"
             [class]="'tone-edge ' + toneClass(borderFor(toast.tone))"
             (mouseenter)="toasts.hold(toast.id)" (mouseleave)="toasts.release(toast.id)"
             (focusin)="toasts.hold(toast.id)" (focusout)="toasts.release(toast.id)">
          <app-icon [name]="iconFor(toast.tone)" size="1em" class="mt-0.5 shrink-0" [class]="'icon-' + iconTone(toast.tone)" />
          <div class="flex-1 min-w-0">
            @if (toast.title) {
              <p class="font-medium break-words">{{ toast.title }}</p>
              <p class="text-[color:var(--text-secondary)] mt-0.5 break-words">{{ toast.message }}</p>
            } @else {
              <p class="break-words">{{ toast.message }}</p>
            }
            @if (toast.action; as action) {
              <button type="button" class="btn btn-default btn-sm mt-2" (click)="act(toast)" data-test="toast-action">
                <app-icon [name]="done().has(toast.id) ? 'check' : 'copy'" />{{ done().has(toast.id) ? (action.doneLabel || action.label) : action.label }}
              </button>
              @if (failed().has(toast.id)) {
                <p class="field-note text-crit-500 mt-1">That did not work. Try again.</p>
              }
            }
          </div>
          <button type="button" class="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  (click)="toasts.dismiss(toast.id)" aria-label="Dismiss" data-test="toast-dismiss"><app-icon name="close" size="0.9em" /></button>
        </div>
      }
    </section>
  `,
  styles: `
    /* Under the top bar (3.5rem, sticky), so it never covers the bell or the account menu it sits beside. */
    .toast-stack { top: calc(3.5rem + 0.75rem); }
  `,
})
export class ToastHost {
  /** The class that paints a colour helper's token (MIG-257); see shared/ui/tone.ts. */
  readonly toneClass = toneClass;
  readonly toasts = inject(ToastService);
  /** Toasts whose action worked, and those whose action was refused. */
  readonly done = signal<ReadonlySet<number>>(new Set());
  readonly failed = signal<ReadonlySet<number>>(new Set());

  async act(toast: Toast): Promise<void> {
    if (!toast.action) return;
    let worked: boolean;
    try {
      worked = (await toast.action.run()) !== false;
    } catch {
      worked = false;
    }
    this.done.update(s => toggle(s, toast.id, worked));
    this.failed.update(s => toggle(s, toast.id, !worked));
  }

  borderFor(tone: string): string {
    switch (tone) {
      case 'ok':   return 'var(--color-ok-500)';
      case 'crit': return 'var(--color-crit-500)';
      case 'warn': return 'var(--color-warn-500)';
      default:     return 'var(--accent-mark)';
    }
  }

  iconFor(tone: string): string {
    return tone === 'ok' ? 'checkCircle' : tone === 'crit' ? 'alert' : tone === 'warn' ? 'alert' : 'info';
  }

  iconTone(tone: string): string {
    return tone === 'crit' ? 'crit' : tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'info';
  }
}

function toggle(set: ReadonlySet<number>, id: number, on: boolean): ReadonlySet<number> {
  const next = new Set(set);
  if (on) next.add(id); else next.delete(id);
  return next;
}
