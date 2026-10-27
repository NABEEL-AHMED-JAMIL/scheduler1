import { Injectable, TemplateRef, signal } from '@angular/core';

export type ToastTone = 'ok' | 'crit' | 'warn' | 'info';

/** A button on a toast: what it says, and what it does. Answering false says the action did not work ("Copy" refused). */
export interface ToastAction {
  label: string;
  /** What the button says once the action worked ("Copied"). */
  doneLabel?: string;
  run: () => boolean | void | Promise<boolean | void>;
}

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** A bold first line, when the message needs one. */
  title?: string;
  action?: ToastAction;
  /** How long it stays, in ms; 0 stays until dismissed. */
  duration: number;
  /** Called once when it goes, however it goes (timer, dismiss, replaced). */
  onClose?: () => void;
}

/** What a caller may say about a toast beyond its words. */
export interface ToastOptions {
  title?: string;
  action?: ToastAction;
  duration?: number;
  onClose?: () => void;
}

/** How long a toast stays when nobody says: errors longer, since they are more often read after the fact. */
export function defaultDuration(tone: ToastTone): number {
  return tone === 'crit' ? 7000 : 4000;
}

/**
 * Every notification the console shows over a page -- a save, a refusal, a reset password's "Copy password" -- in one
 * place, drawn by the one ToastHost at the top right (owner 2026-10-19 #29: one position on every screen). A toast can
 * carry a title, one action and its own duration; the timer stops while it is hovered or focused (ToastHost), so a
 * reader is never cut off mid-sentence.
 *
 * Replaces ngx-toastr, which still pins Angular 21. Toasts are a list plus a timer -- not worth a dependency.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  /**
   * A notice that is not a toast but belongs where toasts are: one that lives as long as its owner says, with its own
   * buttons and semantics -- the idle sign-out warning (core/auth/idle-guard.ts, an alertdialog with a countdown). The
   * owner's template is drawn first in the stack, so it never covers a toast and a toast never covers it.
   */
  readonly pinned = signal<TemplateRef<unknown> | null>(null);

  pin(template: TemplateRef<unknown>): void {
    this.pinned.set(template);
  }

  /** Only the template that was pinned is taken off: another owner's stays. */
  unpin(template: TemplateRef<unknown>): void {
    if (this.pinned() === template) this.pinned.set(null);
  }

  success(message: string, options?: ToastOptions): number { return this.show('ok', message, options); }
  error(message: string, options?: ToastOptions): number   { return this.show('crit', message, options); }
  warn(message: string, options?: ToastOptions): number    { return this.show('warn', message, options); }
  info(message: string, options?: ToastOptions): number    { return this.show('info', message, options); }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    const gone = this.toasts().find(t => t.id === id);
    if (!gone) return;
    this.toasts.update(list => list.filter(t => t.id !== id));
    gone.onClose?.();
  }

  /** The newest toast goes (Escape in the stack). */
  dismissLatest(): void {
    const list = this.toasts();
    if (list.length) this.dismiss(list[list.length - 1].id);
  }

  /** Its timer stops (hovered, or focused from the keyboard)... */
  hold(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  /** ...and starts over when the reader leaves it. */
  release(id: number): void {
    const toast = this.toasts().find(t => t.id === id);
    if (toast) this.dismissLater(toast);
  }

  /** The dismiss timer of each toast on screen, so a repeat can restart it. */
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  private dismissLater(toast: Toast): void {
    const running = this.timers.get(toast.id);
    if (running) clearTimeout(running);
    if (toast.duration > 0) this.timers.set(toast.id, setTimeout(() => this.dismiss(toast.id), toast.duration));
  }

  show(tone: ToastTone, message: string, options: ToastOptions = {}): number {
    // Clicking Save or Run again with the same problem stacked four or five identical toasts. The one already on screen
    // stays, and its time starts over -- unless it carries an action, which is about one moment and one object.
    const same = !options.action && this.toasts().find(t => t.tone === tone && t.message === message && t.title === options.title && !t.action);
    if (same) { this.dismissLater(same); return same.id; }
    const toast: Toast = { id: this.nextId++, tone, message, title: options.title, action: options.action,
      duration: options.duration ?? defaultDuration(tone), onClose: options.onClose };
    this.toasts.update(list => [...list, toast]);
    this.dismissLater(toast);
    return toast.id;
  }
}
