import { Injectable, effect, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'etl_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Falls back to the OS preference when the user has never chosen explicitly. */
  private readonly stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  readonly theme = signal<Theme>(
    this.stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );

  constructor() {
    effect(() => {
      const value = this.theme();
      document.documentElement.classList.toggle('dark', value === 'dark');
      localStorage.setItem(STORAGE_KEY, value);
    });
  }

  toggle(): void {
    this.theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }
}
