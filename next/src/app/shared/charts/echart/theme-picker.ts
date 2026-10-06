import { Component, computed, inject, input, output } from '@angular/core';
import { ChartThemes } from './chart-themes';
import { CONSOLE_THEME, NAMED_THEMES } from './echart-theme';

/**
 * The chart themes as a list of swatch rows: the console's own, then the named palettes, and --
 * where a choice can be inherited -- "as the board" first.
 *
 * Swatches are drawn in the mode on screen, after the 3:1 adjustment (echart-theme.ts), so what
 * is shown is what a chart will draw. A palette made for the other mode says it is derived, and
 * how many colours were moved to read on this card.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-theme-picker',
  template: `
    <div class="flex flex-col gap-1" role="radiogroup" [attr.aria-label]="label()">
      @if (inheritLabel()) {
        <button type="button" role="radio" class="theme-row" [class.is-on]="!value()" [attr.aria-checked]="!value()" (click)="changed.emit(null)">
          <span class="theme-name">{{ inheritLabel() }}</span>
          <span class="text-[11px] text-[color:var(--text-muted)]">no override</span>
        </button>
      }
      @for (theme of rows(); track theme.id) {
        <button type="button" role="radio" class="theme-row" [attr.data-theme-id]="theme.id"
                [class.is-on]="value() === theme.id" [attr.aria-checked]="value() === theme.id" (click)="changed.emit(theme.id)">
          <span class="theme-name">{{ theme.label }}</span>
          <span class="theme-swatches" aria-hidden="true">
            @for (colour of theme.colors; track $index) { <span class="theme-swatch" [style.background]="colour"></span> }
          </span>
          <span class="text-[11px] text-[color:var(--text-muted)] whitespace-nowrap">{{ theme.note }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    .theme-row { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr) auto; align-items: center; gap: 0.75rem;
      padding: 0.375rem 0.5rem; border: 1px solid transparent; border-radius: var(--radius-md); text-align: left;
      color: var(--text-primary); }
    .theme-row:hover { background: var(--surface-sunken); }
    .theme-row:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
    .theme-row.is-on { border-color: var(--accent-text); background: var(--accent-soft); }
    .theme-name { font-size: 0.75rem; font-weight: 500; }
    .theme-swatches { display: flex; gap: 2px; min-width: 0; }
    .theme-swatch { width: 1rem; height: 0.875rem; border-radius: var(--radius-sm); flex: none; }
  `],
})
export class ThemePicker {
  private readonly themes = inject(ChartThemes);
  /** The chosen theme id; null means "inherit" when inheritLabel is set. */
  readonly value = input<string | null>(null);
  readonly inheritLabel = input('');
  readonly label = input('Chart theme');
  readonly changed = output<string | null>();

  readonly rows = computed(() => [
    { id: CONSOLE_THEME, label: 'Console', file: '', designedFor: 'both' as const },
    ...NAMED_THEMES,
  ].map(theme => {
    const swatches = this.themes.swatches(theme.id);
    const notes: string[] = [];
    if (swatches.derived) notes.push(theme.designedFor === 'dark' ? 'light variant derived' : 'dark variant derived');
    if (swatches.adjusted) notes.push(`${swatches.adjusted} ${swatches.adjusted === 1 ? 'colour' : 'colours'} adjusted for contrast`);
    return { id: theme.id, label: theme.label, colors: swatches.colors, note: notes.join(' · ') };
  }));
}
