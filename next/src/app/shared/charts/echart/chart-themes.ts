import { Injectable, inject } from '@angular/core';
import { ChartTokens } from './chart-tokens';
import { ChartTokenSet, buildTheme, ordered, paletteFor, themeKey } from './echart-theme';
import type { EChartThemeRef } from './echart';

/** A theme resolved for the mode on screen: what a chart is handed. */
export interface ResolvedTheme {
  id: string;
  palette: string[];
  tokens: ChartTokenSet;
  ref: EChartThemeRef;
  derived: boolean;
  adjusted: number;
}

/**
 * Themes, resolved against the tokens on screen now.
 *
 * Reads ChartTokens' signal, so a caller inside a computed is recomputed when the console flips
 * between light and dark, and the charts switch with it.
 *
 * @author Nabeel Ahmed
 */
@Injectable({ providedIn: 'root' })
export class ChartThemes {
  private readonly tokens = inject(ChartTokens).tokens;

  resolve(themeId: string | null | undefined, order?: number[]): ResolvedTheme {
    const tokens = this.tokens();
    const base = paletteFor(themeId, tokens);
    const palette = ordered(base.colors, order);
    const key = themeKey(themeId, tokens.mode);
    return {
      id: themeId || 'console', palette, tokens, derived: base.derived, adjusted: base.adjusted,
      // The registered theme carries the theme's own order; a widget's custom order is in its option.
      ref: { key, object: buildTheme(tokens, base.colors) },
    };
  }

  /** The swatches a picker shows for a theme, in this mode. */
  swatches(themeId: string): { colors: string[]; derived: boolean; adjusted: number } {
    const { colors, derived, adjusted } = paletteFor(themeId, this.tokens());
    return { colors, derived, adjusted };
  }
}
