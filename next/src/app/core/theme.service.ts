import { EnvironmentProviders, Injectable, computed, effect, inject, provideAppInitializer, signal } from '@angular/core';

/** The app themes (styles.css, "App themes"). Ocean and High contrast are light; Midnight is dark. */
export type ThemeId = 'light' | 'dark' | 'ocean' | 'midnight' | 'contrast';
/** What a person (or a workspace) chooses: a theme, or System -- Light or Dark as the device says. */
export type ThemeChoice = ThemeId | 'system';

/** Every choice, in the order the pickers list them (their names: theme-options.ts). */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark', 'ocean', 'midnight', 'contrast'];

const DARK_THEMES: ReadonlySet<ThemeId> = new Set(['dark', 'midnight']);
export const STORAGE_KEY = 'etl_theme';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The theme a choice shows: System is Light or Dark by the device. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ThemeId {
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
}

/**
 * Puts a theme on <html>: the dark class for the dark family, data-theme for any but the two base themes. The same
 * thing index.html's first-paint script does from the stored choice.
 */
export function applyTheme(root: HTMLElement, id: ThemeId): void {
  root.classList.toggle('dark', DARK_THEMES.has(id));
  if (id === 'light' || id === 'dark') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', id);
}

function readStored(): ThemeChoice | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isThemeChoice(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The app theme. localStorage (etl_theme) is the instant cache index.html reads before the first paint; the person's
 * choice is kept on their account (Identity: appUser.json/theme) and a sign-in's answer brings it, or the workspace's
 * default when they never chose, to whatever device they sign in on (adoptSignIn). Saving a pick to the account is
 * ThemePreference's (core/theme-preference.ts), so this stays free of HTTP and builds as the app starts.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  /** The device's light/dark, followed live while the choice is System. */
  readonly systemDark = signal(this.query?.matches ?? false);
  /**
   * The choice. Storage a browser refuses (a sandboxed or third-party frame, MIG-335's embedded run view; blocked site
   * data) throws: the page then starts from System.
   */
  readonly choice = signal<ThemeChoice>(readStored() ?? 'system');
  /** The theme on screen. */
  readonly active = computed<ThemeId>(() => resolveTheme(this.choice(), this.systemDark()));
  /** The family on screen, light or dark: what the sign-in and public pages' sun/moon switch reads. */
  readonly theme = computed<'light' | 'dark'>(() => (DARK_THEMES.has(this.active()) ? 'dark' : 'light'));

  constructor() {
    this.query?.addEventListener?.('change', event => this.systemDark.set(event.matches));
    effect(() => {
      applyTheme(document.documentElement, this.active());
      try { localStorage.setItem(STORAGE_KEY, this.choice()); } catch { /* storage refused: the choice lasts this page */ }
    });
  }

  pick(choice: ThemeChoice): void {
    if (isThemeChoice(choice)) this.choice.set(choice);
  }

  /** The sun/moon on the pages outside the shell: the other family, keeping the palette where it has a partner. */
  toggle(): void {
    const partner: Record<ThemeId, ThemeId> = { light: 'dark', dark: 'light', ocean: 'midnight', midnight: 'ocean', contrast: 'dark' };
    this.choice.set(partner[this.active()]);
  }

  /**
   * A sign-in's answer: the person's own choice, else their workspace's default. Neither (the person never chose and
   * the workspace has no default) leaves this device's choice as it is.
   */
  adoptSignIn(own: string | null | undefined, workspaceDefault: string | null | undefined): void {
    const chosen = isThemeChoice(own) ? own : isThemeChoice(workspaceDefault) ? workspaceDefault : null;
    if (chosen) this.choice.set(chosen);
  }
}

/**
 * Builds ThemeService as the app starts. The constructor is what applies the theme, and until
 * this only screens that injected the service built it: the shell did, the sign-in page did not,
 * so /login opened light for someone who had chosen dark.
 */
export function provideTheme(): EnvironmentProviders {
  return provideAppInitializer(() => { inject(ThemeService); });
}
