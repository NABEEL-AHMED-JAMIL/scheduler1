import { THEME_CHOICES, ThemeChoice } from './theme.service';

/** A theme as the pickers show it: its name, a line about it, and (but System) its --swatch-<id>-* tokens. */
export interface ThemeOption {
  id: ThemeChoice;
  label: string;
  note: string;
}

const NAMES: Record<ThemeChoice, Omit<ThemeOption, 'id'>> = {
  system: { label: 'System', note: 'Light or Dark, as your device is set' },
  light: { label: 'Light', note: 'The console’s own, on white' },
  dark: { label: 'Dark', note: 'Neutral dark' },
  ocean: { label: 'Ocean', note: 'Calm blue and teal on light' },
  midnight: { label: 'Midnight', note: 'Deep navy with teal accents' },
  contrast: { label: 'High contrast', note: 'Black on white, strongest edges' },
};

/** Kept out of theme.service.ts, which is in the first download: only the pickers need the words. */
export const THEME_OPTIONS: readonly ThemeOption[] = THEME_CHOICES.map(id => ({ id, ...NAMES[id] }));

export function themeLabel(choice: string | null | undefined): string {
  return NAMES[choice as ThemeChoice]?.label ?? 'System';
}

/**
 * A picker's preview of one theme ([data-swatch=<id>]): that theme's --swatch-<id>-* tokens (styles.css) as --chip-page,
 * --chip-card, --chip-accent and --chip-text, whichever theme is on. System is half Light, half Dark. In the pickers'
 * own styles rather than styles.css, so it loads with them and not in the first download.
 */
export const SWATCH_CSS = `
  [data-swatch="light"] { --chip-page: var(--swatch-light-page); --chip-card: var(--swatch-light-card); --chip-accent: var(--swatch-light-accent); --chip-text: var(--swatch-light-text); }
  [data-swatch="dark"] { --chip-page: var(--swatch-dark-page); --chip-card: var(--swatch-dark-card); --chip-accent: var(--swatch-dark-accent); --chip-text: var(--swatch-dark-text); }
  [data-swatch="ocean"] { --chip-page: var(--swatch-ocean-page); --chip-card: var(--swatch-ocean-card); --chip-accent: var(--swatch-ocean-accent); --chip-text: var(--swatch-ocean-text); }
  [data-swatch="midnight"] { --chip-page: var(--swatch-midnight-page); --chip-card: var(--swatch-midnight-card); --chip-accent: var(--swatch-midnight-accent); --chip-text: var(--swatch-midnight-text); }
  [data-swatch="contrast"] { --chip-page: var(--swatch-contrast-page); --chip-card: var(--swatch-contrast-card); --chip-accent: var(--swatch-contrast-accent); --chip-text: var(--swatch-contrast-text); }
  [data-swatch="system"] { --chip-page: var(--swatch-light-page); --chip-accent: var(--swatch-light-accent); --chip-text: var(--swatch-light-text); --chip-card: linear-gradient(135deg, var(--swatch-light-card) 50%, var(--swatch-dark-card) 50%); }
`;
