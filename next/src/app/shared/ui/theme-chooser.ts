import { Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { Icon } from './icon';
import { ThemeChoice } from '../../core/theme.service';
import { SWATCH_CSS, THEME_OPTIONS } from '../../core/theme-options';

/**
 * The app themes as large previews, one radio each: Profile › Appearance (a person's own) and Administration ›
 * Appearance (the workspace's default). Each preview is drawn from that theme's --swatch-<id>-* tokens, so it shows the
 * theme whichever one is on. A radio group: Tab reaches the chosen one, the arrows move and pick.
 */
@Component({
  selector: 'app-theme-chooser',
  imports: [Icon],
  template: `
    <div class="tc-grid" role="radiogroup" [attr.aria-label]="label()" (keydown)="onKey($event)">
      @for (option of rows(); track option.id) {
        <button type="button" role="radio" class="tc-option" [attr.data-theme-choice]="option.id"
                [attr.aria-checked]="option.id === value()" [attr.tabindex]="option.id === focusable() ? 0 : -1"
                [disabled]="disabled()" (click)="picked.emit(option.id)">
          <span class="tc-preview" [attr.data-swatch]="option.id" aria-hidden="true">
            <span class="tc-bar"></span>
            <span class="tc-card">
              <span class="tc-line"></span>
              <span class="tc-line tc-short"></span>
              <span class="tc-button"></span>
            </span>
          </span>
          <span class="tc-text">
            <span class="tc-name">{{ option.label }}</span>
            <span class="tc-note">{{ option.note }}</span>
          </span>
          @if (option.id === value()) { <app-icon class="tc-check" name="checkCircle" size="1.1em" /> }
        </button>
      }
    </div>
  `,
  styles: [SWATCH_CSS, `
    /* Owner #4: every option the same height, on the same columns, whatever its note's length. */
    .tc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr)); grid-auto-rows: 1fr; gap: 0.75rem; }
    .tc-option { position: relative; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--surface-raised);
      text-align: left; color: var(--text-primary); cursor: pointer; }
    .tc-option:hover:not(:disabled) { border-color: var(--border-strong); }
    .tc-option[aria-checked="true"] { border-color: var(--accent-mark); box-shadow: 0 0 0 1px var(--accent-mark); }
    .tc-option:disabled { cursor: default; opacity: 0.7; }
    .tc-option:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
    .tc-preview { position: relative; display: block; isolation: isolate; flex: none; height: 4.5rem; border-radius: var(--radius-lg);
      background: var(--chip-page); border: 1px solid var(--border-subtle); overflow: hidden; }
    .tc-bar { position: absolute; inset: 0 0 auto 0; height: 0.75rem; background: var(--chip-card);
      border-bottom: 1px solid color-mix(in oklab, var(--chip-text) 15%, transparent); }
    .tc-card { position: absolute; left: 0.75rem; right: 0.75rem; top: 1.25rem; bottom: 0.625rem;
      border-radius: var(--radius-sm); background: var(--chip-card); padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.3rem; }
    .tc-line { display: block; height: 0.25rem; width: 70%; background: var(--chip-text); opacity: 0.85; }
    .tc-short { width: 45%; opacity: 0.5; }
    .tc-button { display: block; margin-top: auto; height: 0.5rem; width: 2rem; border-radius: var(--radius-full); background: var(--chip-accent); }
    .tc-text { display: flex; flex-direction: column; gap: 0.0625rem; min-width: 0; padding: 0 0.125rem; }
    .tc-name { font-size: 0.8125rem; font-weight: 500; }
    .tc-note { font-size: 0.75rem; line-height: 1.3; color: var(--text-muted); }
    .tc-check { position: absolute; top: 0.875rem; right: 0.875rem; color: var(--accent-text);
      background: var(--surface-raised); border-radius: var(--radius-full); }
  `],
})
export class ThemeChooser {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The chosen theme; null when nothing is (the arrows then start at the first). */
  readonly value = input<ThemeChoice | null>(null);
  readonly label = input('Theme');
  /** A different name for System, where it means something more (a workspace default of none). */
  readonly systemLabel = input<string | null>(null);
  readonly disabled = input(false);
  readonly picked = output<ThemeChoice>();

  readonly rows = computed(() => THEME_OPTIONS.map(option => ({
    ...option,
    label: option.id === 'system' && this.systemLabel() ? this.systemLabel()! : option.label,
  })));
  readonly focusable = computed(() => this.value() ?? THEME_OPTIONS[0].id);

  onKey(event: KeyboardEvent): void {
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(event.key in step) || this.disabled()) return;
    event.preventDefault();
    const ids = THEME_OPTIONS.map(option => option.id);
    const next = ids[(ids.indexOf(this.focusable()) + step[event.key] + ids.length) % ids.length];
    this.picked.emit(next);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-theme-choice="${next}"]`)?.focus());
  }
}
