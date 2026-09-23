import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-toast-host',
  imports: [Icon],
  template: `
    <!-- Two live regions: a failure interrupts a screen reader (role=alert), everything else
         waits its turn (role=status). One polite region read "Could not save" in the same
         queue as "Saved". -->
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="card shadow-lg px-3.5 py-2.5 flex items-start gap-2.5 text-sm"
             [attr.role]="toast.tone === 'crit' ? 'alert' : 'status'"
             [attr.aria-live]="toast.tone === 'crit' ? 'assertive' : 'polite'"
             [class.border-l-4]="true"
             [style.border-left-color]="borderFor(toast.tone)">
          <span class="flex-1">{{ toast.message }}</span>
          <button type="button" class="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  (click)="toasts.dismiss(toast.id)" aria-label="Dismiss"><app-icon name="close" size="0.9em" /></button>
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
      default:     return 'var(--accent-mark)';
    }
  }
}
