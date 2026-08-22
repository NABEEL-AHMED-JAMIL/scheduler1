import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
         role="status" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="card shadow-lg px-3.5 py-2.5 flex items-start gap-2.5 text-sm"
             [class.border-l-4]="true"
             [style.border-left-color]="borderFor(toast.tone)">
          <span class="flex-1">{{ toast.message }}</span>
          <button type="button" class="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  (click)="toasts.dismiss(toast.id)" aria-label="Dismiss">×</button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  readonly toasts = inject(ToastService);

  borderFor(tone: string): string {
    switch (tone) {
      case 'ok':   return 'var(--color-ok-500)';
      case 'crit': return 'var(--color-crit-500)';
      case 'warn': return 'var(--color-warn-500)';
      default:     return 'var(--color-brand-500)';
    }
  }
}
