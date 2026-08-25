import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

export interface PromptOptions {
  title: string;
  label: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  hint?: string;
}

@Component({
  selector: 'app-prompt-dialog',
  template: `
    <form class="card shadow-2xl w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden"
          (submit)="submit($event)">
      <div class="px-5 pt-4 pb-3">
        <h2 class="text-base font-semibold">{{ data.title }}</h2>
        <label class="label mt-3" for="value">{{ data.label }}</label>
        <input id="value" class="input" [value]="value()" cdkFocusInitial
               [placeholder]="data.placeholder || ''"
               (input)="value.set($any($event.target).value)" />
        @if (data.hint) {
          <p class="text-xs text-[color:var(--text-muted)] mt-1.5">{{ data.hint }}</p>
        }
      </div>
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-subtle">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" [disabled]="!value().trim()">
          {{ data.confirmLabel || 'Save' }}
        </button>
      </div>
    </form>
  `,
})
export class PromptDialog {
  readonly ref = inject<DialogRef<string>>(DialogRef);
  readonly data = inject<PromptOptions>(DIALOG_DATA);
  readonly value = signal(this.data.initial ?? '');

  submit(event: Event): void {
    event.preventDefault();
    const trimmed = this.value().trim();
    if (trimmed) this.ref.close(trimmed);
  }
}
