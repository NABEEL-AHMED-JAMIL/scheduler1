import { Component, effect, inject, input, model } from '@angular/core';
import { Icon } from './icon';

export type ListView = 'table' | 'cards';

const STORE_PREFIX = 'etl.view.';

/**
 * Table-or-cards switch for a list screen.
 *
 * Every screen was growing its own copy of the same segmented control, so this owns the markup
 * and the remembering. `key` persists the choice per screen: someone who prefers cards for
 * connections but a table for jobs keeps both, and the preference survives navigation.
 */
@Component({
  selector: 'app-view-toggle',
  imports: [Icon],
  template: `
    <div class="seg" role="group" aria-label="Choose a layout">
      @for (option of options; track option.id) {
        <button type="button" class="seg-btn" [class.seg-on]="value() === option.id"
                [attr.aria-pressed]="value() === option.id"
                [title]="option.id === 'table' ? 'Show as a table' : 'Show as cards'"
                (click)="value.set(option.id)">
          <app-icon [name]="option.icon" size="0.9em" />{{ option.label }}
        </button>
      }
    </div>
  `,
})
export class ViewToggle {
  /** Two-way, so the screen keeps ownership and can read it in its own template. */
  readonly value = model<ListView>('table');
  /** Distinct per screen; omit to opt out of remembering. */
  readonly key = input('');
  /** Cards mean different things per screen, so the glyph is the screen's to choose. */
  readonly cardsIcon = input('layers');

  protected get options(): { id: ListView; label: string; icon: string }[] {
    return [
      { id: 'table', label: 'Table', icon: 'list' },
      { id: 'cards', label: 'Cards', icon: this.cardsIcon() },
    ];
  }

  constructor() {
    let restored = false;
    effect(() => {
      const key = this.key();
      // Read the value on every path, including the restore one, or this effect never depends
      // on it and stops persisting the moment it has restored once.
      const current = this.value();
      if (!key) return;
      if (!restored) {
        restored = true;
        const saved = safeRead(STORE_PREFIX + key);
        if ((saved === 'cards' || saved === 'table') && saved !== current) {
          this.value.set(saved);   // re-runs, and that run does the persisting
          return;
        }
      }
      safeWrite(STORE_PREFIX + key, current);
    });
  }
}

/** Storage throws in private modes and when quota is gone; a layout choice is not worth a crash. */
function safeRead(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeWrite(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* preference simply is not remembered */ }
}
