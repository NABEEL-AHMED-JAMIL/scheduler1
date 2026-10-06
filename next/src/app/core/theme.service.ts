import { EnvironmentProviders, Injectable, effect, inject, provideAppInitializer, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'etl_theme';

function readStored(): Theme | null {
  try {
    return localStorage.getItem(STORAGE_KEY) as Theme | null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  /**
   * Falls back to the OS preference when the user has never chosen explicitly. Storage a browser refuses (a sandboxed or
   * third-party frame, MIG-335's embedded run view; blocked site data) throws: the page then starts from the OS preference.
   */
  private readonly stored = readStored();
  readonly theme = signal<Theme>(
    this.stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );

  constructor() {
    effect(() => {
      const value = this.theme();
      document.documentElement.classList.toggle('dark', value === 'dark');
      try { localStorage.setItem(STORAGE_KEY, value); } catch { /* storage refused: the choice lasts this page */ }
    });
  }

  toggle(): void {
    this.theme.update(t => (t === 'dark' ? 'light' : 'dark'));
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
