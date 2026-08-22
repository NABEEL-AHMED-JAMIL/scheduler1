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
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  private push(tone: ToastTone, message: string): void {
    const id = this.nextId++;
    this.toasts.update(list => [...list, { id, tone, message }]);
    // Errors stay longer: they are more likely to matter and more likely to be
    // read after the fact rather than caught in the moment.
    setTimeout(() => this.dismiss(id), tone === 'crit' ? 7000 : 4000);
  }
}
