import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { ChartThemes } from './chart-themes';
import { CONSOLE_THEME } from './echart-theme';

/**
 * Re-points --chart-0..7 on one element at a theme's palette, so the console's own SVG charts
 * inside it draw in that theme. The console theme (or none) removes the overrides and the element
 * reads the page's tokens again. Follows light and dark with ChartThemes.
 *
 * @author Nabeel Ahmed
 */
@Directive({ selector: '[appChartPalette]' })
export class ChartPalette {
  readonly appChartPalette = input<string | null | undefined>(null);
  /** A custom order of the theme's colours (ChartSettings.colors.order). */
  readonly paletteOrder = input<number[] | undefined>(undefined);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const themes = inject(ChartThemes);
    effect(() => {
      const id = this.appChartPalette() ?? CONSOLE_THEME;
      const order = this.paletteOrder();
      const theme = themes.resolve(id, order);
      const override = id !== CONSOLE_THEME || !!order?.length;
      theme.palette.forEach((colour, i) => {
        if (override) host.style.setProperty(`--chart-${i}`, colour);
        else host.style.removeProperty(`--chart-${i}`);
      });
    });
  }
}
