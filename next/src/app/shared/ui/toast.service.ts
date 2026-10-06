import { Injectable, signal } from '@angular/core';

export type ToastTone = 'ok' | 'crit' | 'warn' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

/**
 * Replaces ngx-toastr, which still pins Angular 21. Toasts are a list plus a timer -- not
 * worth a dependency that would hold the framework back.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  success(message: string) { this.push('ok', message); }
  error(message: string)   { this.push('crit', message); }
  warn(message: string)    { this.push('warn', message); }
  info(message: string)    { this.push('info', message); }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  /** The dismiss timer of each toast on screen, so a repeat can restart it. */
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  private dismissLater(id: number, tone: ToastTone): void {
    const running = this.timers.get(id);
    if (running) clearTimeout(running);
    // Errors stay longer: they are more likely to matter and more likely to be
    // read after the fact rather than caught in the moment.
    this.timers.set(id, setTimeout(() => this.dismiss(id), tone === 'crit' ? 7000 : 4000));
  }

  private push(tone: ToastTone, message: string): void {
    // Clicking Save or Run again with the same problem stacked four or five identical toasts.
    // The one already on screen stays, and its time starts over.
    const same = this.toasts().find(t => t.tone === tone && t.message === message);
    if (same) { this.dismissLater(same.id, tone); return; }
    const id = this.nextId++;
    this.toasts.update(list => [...list, { id, tone, message }]);
    this.dismissLater(id, tone);
  }
}
