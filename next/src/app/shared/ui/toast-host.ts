import { toneClass } from './tone';
import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-toast-host',
  imports: [Icon],
  template: `
    <!-- Two live regions: a failure interrupts a screen reader (role=alert), everything else
         waits its turn (role=status). One polite region read "Could not save" in the same
         queue as "Saved".
         Bottom-left: bottom-right is where every form and dialog puts Save, so "Check the
         highlighted fields." covered the button it was about, and the floating assistant and
         file chat sit there too. The stack lets clicks through its gaps; only a toast takes them. -->
    <div class="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="card shadow-lg px-3.5 py-2.5 flex items-start gap-2.5 text-sm pointer-events-auto"
             [attr.role]="toast.tone === 'crit' ? 'alert' : 'status'"
             [attr.aria-live]="toast.tone === 'crit' ? 'assertive' : 'polite'"
             [class.border-l-4]="true"
             [class]="'tone-edge ' + toneClass(borderFor(toast.tone))">
          <span class="flex-1">{{ toast.message }}</span>
          <button type="button" class="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  (click)="toasts.dismiss(toast.id)" aria-label="Dismiss"><app-icon name="close" size="0.9em" /></button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  /** The class that paints a colour helper's token (MIG-257); see shared/ui/tone.ts. */
  readonly toneClass = toneClass;
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
