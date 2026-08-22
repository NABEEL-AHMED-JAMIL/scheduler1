import { Component, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * Shell for the short create/edit dialogs that sit beside a list. Keeps the header, scrolling
 * body and footer identical across them, so every one of these forms behaves the same way at
 * any window height.
 */
@Component({
  selector: 'app-form-dialog',
  imports: [Icon],
  template: `
    <div class="card shadow-2xl w-[34rem] max-w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col overflow-hidden">
      <div class="px-5 py-3.5 border-b shrink-0" style="border-color: var(--border-subtle);">
        <h2 class="text-base font-semibold">{{ heading() }}</h2>
        @if (subtitle()) {
          <p class="text-sm text-[color:var(--text-secondary)] mt-0.5">{{ subtitle() }}</p>
        }
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-5 min-h-0">
        <ng-content />
      </div>

      <div class="flex items-center gap-2 px-5 py-3.5 border-t shrink-0"
           style="border-color: var(--border-subtle);">
        <ng-content select="[footer-start]" />
        <div class="ml-auto flex gap-2">
          <button type="button" class="btn btn-default btn-sm" [disabled]="saving()"
                  (click)="cancelled.emit()">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="saving()"
                  (click)="confirmed.emit()">
            @if (saving()) { <app-icon name="refresh" class="spin" /> }
            {{ saving() ? 'Saving…' : confirmLabel() }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FormDialog {
  readonly heading = input.required<string>();
  readonly subtitle = input('');
  readonly confirmLabel = input('Save');
  readonly saving = input(false);
  readonly cancelled = output<void>();
  readonly confirmed = output<void>();
}
