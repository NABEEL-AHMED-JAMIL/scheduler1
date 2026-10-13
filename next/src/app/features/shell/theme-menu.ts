import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { ThemeChoice, ThemeService } from '../../core/theme.service';
import { SWATCH_CSS, THEME_OPTIONS, themeLabel } from '../../core/theme-options';
import { ThemePreference } from '../../core/theme-preference';

/**
 * The top bar's theme menu (owner 2026-10-13): the sun/moon opens a menu of the app themes, each with a small preview
 * and its name, the current one ticked. A WAI-ARIA menu of radio items: arrows, Home and End move, Enter or Space
 * picks, Escape closes back to the button. A pick is on screen at once and kept on the account (ThemePreference).
 */
@Component({
  selector: 'app-theme-menu',
  imports: [Icon],
  template: `
    <div class="relative" (focusout)="onFocusOut($event)" (keydown)="onKey($event)">
      <button #trigger type="button" class="btn btn-ghost btn-icon" (click)="toggle()"
              aria-haspopup="menu" [attr.aria-expanded]="open()" aria-controls="theme-menu"
              [title]="'Theme: ' + label()">
        <app-icon [name]="themes.theme() === 'dark' ? 'moon' : 'sun'" size="1.05em" [label]="'Theme: ' + label()" />
      </button>
      @if (open()) {
        <div #panel id="theme-menu" role="menu" aria-label="Theme"
             class="absolute right-0 top-full mt-1 w-60 rounded-lg border shadow-lg py-1 z-50 bg-raised border-subtle">
          <div class="px-3 pt-1.5 pb-1 text-xs font-medium text-[color:var(--text-muted)]" aria-hidden="true">Theme</div>
          @for (option of options; track option.id) {
            <button type="button" role="menuitemradio" class="menu-item text-sm theme-item" tabindex="-1"
                    [attr.aria-checked]="option.id === themes.choice()" [attr.data-theme-choice]="option.id"
                    (click)="choose(option.id)">
              <span class="theme-chip" [attr.data-swatch]="option.id" aria-hidden="true"><span></span><span></span></span>
              <span class="flex-1 min-w-0 truncate">{{ option.label }}</span>
              @if (option.id === themes.choice()) { <app-icon name="check" size="0.95em" /> }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [SWATCH_CSS, `
    .theme-item { display: flex; align-items: center; gap: 0.625rem; width: 100%; text-align: left; }
    .theme-item[aria-checked="true"] { font-weight: 500; }
    /* A card on its page, with the accent and the text colour as two bars: enough to tell five themes apart. The
       colours are the theme's own --swatch-<id>-* (styles.css, [data-swatch]). */
    .theme-chip { position: relative; flex: none; width: 1.75rem; height: 1.25rem; border-radius: var(--radius-sm);
      background: var(--chip-page); border: 1px solid var(--border-strong); overflow: hidden; }
    .theme-chip::before { content: ''; position: absolute; inset: 0.1875rem 0.1875rem 0.1875rem 0.4375rem;
      border-radius: var(--radius-sm); background: var(--chip-card); }
    .theme-chip > span { position: absolute; left: 0.5625rem; height: 0.1875rem; }
    .theme-chip > span:first-child { top: 0.375rem; width: 0.75rem; background: var(--chip-accent); }
    .theme-chip > span:last-child { top: 0.6875rem; width: 0.5rem; background: var(--chip-text); }
  `],
})
export class ThemeMenu {
  readonly themes = inject(ThemeService);
  private readonly preference = inject(ThemePreference);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  readonly options = THEME_OPTIONS;
  readonly open = signal(false);
  readonly label = computed(() => themeLabel(this.themes.choice()));

  toggle(): void {
    if (this.open()) { this.close(true); return; }
    this.open.set(true);
    // The checked item takes focus, so the arrows start from where the person is.
    setTimeout(() => this.focusItem(this.items().findIndex(i => i.getAttribute('aria-checked') === 'true')));
  }

  choose(id: ThemeChoice): void {
    this.preference.choose(id).subscribe();
    this.close(true);
  }

  close(refocus: boolean): void {
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

  onKey(event: KeyboardEvent): void {
    if (!this.open()) return;
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 };
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    } else if (event.key in move) {
      event.preventDefault();
      this.focusItem((move[event.key] + items.length) % items.length);
    } else if (event.key === 'Tab') {
      this.close(false);
    }
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.open() && !this.host.nativeElement.contains(next)) this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  private items(): HTMLElement[] {
    return Array.from(this.panel()?.nativeElement.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
  }

  private focusItem(index: number): void {
    const items = this.items();
    items[Math.max(0, index)]?.focus();
  }
}
