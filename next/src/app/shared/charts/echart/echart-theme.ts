import THEME_FILE from './echart-themes.json';
import { CHART_SLOTS } from '../status-color';

/**
 * The colours an ECharts chart is drawn in, from the console's tokens -- and the named themes.
 *
 * ECharts draws to a canvas, and a canvas cannot read `var(--chart-0)`: every colour has to be
 * handed over resolved. So the tokens are READ (ChartTokens does that, and again whenever the
 * theme flips), and the pure functions here turn them into an ECharts theme object: the series
 * palette, and the chrome -- text, axes, grid lines, tooltip surface, toolbox -- in the console's
 * own type.
 *
 * A NAMED theme (echart-themes.json: palettes from the theme files that ship in the echarts
 * package, Apache-2.0) changes the series colours only. The chrome stays the console's, so a tile
 * in "Vintage" still sits on the console's card with the console's axis text, in either mode.
 *
 * Every palette is held to the console's own rule for chart fills: 3:1 against the card it is
 * drawn on (WCAG 1.4.11; styles.css records the ratio beside each --chart-N). A colour that falls
 * short -- Roma's cream on a white card, Infographic's dark teal on the navy one -- is moved
 * toward the ink of that mode until it passes, keeping its hue. A theme drawn for the other mode
 * is therefore a DERIVED variant, and the picker says so rather than presenting it as the
 * author's design.
 *
 * @author Nabeel Ahmed
 */

export type Mode = 'light' | 'dark';

/** The resolved token values a chart needs. Every colour is a CSS colour string. */
export interface ChartTokenSet {
  mode: Mode;
  palette: string[];
  text: string;
  textSecondary: string;
  muted: string;
  border: string;
  surface: string;
  sunken: string;
  heat: string;
  up: string;
  down: string;
  font: string;
}

export interface NamedTheme {
  id: string;
  label: string;
  /** The echarts package file the palette comes from. */
  file: string;
  designedFor: Mode;
  colors: string[];
}

/** The console's own theme: the --chart-N tokens. Always first, and the default. */
export const CONSOLE_THEME = 'console';

export const NAMED_THEMES: NamedTheme[] = (THEME_FILE as { themes: NamedTheme[] }).themes;

/** Every theme id the pickers offer, the console's first. */
export const THEME_IDS: string[] = [CONSOLE_THEME, ...NAMED_THEMES.map(theme => theme.id)];

export function themeLabel(id: string | null | undefined): string {
  if (!id || id === CONSOLE_THEME) return 'Console';
  return NAMED_THEMES.find(theme => theme.id === id)?.label ?? 'Console';
}

// ---- colour arithmetic ----------------------------------------------------------------------

export type Rgb = [number, number, number];

/** #rgb, #rrggbb or rgb()/rgba() to channels; null for anything else (a caller resolves first). */
export function toRgb(colour: string): Rgb | null {
  const text = (colour ?? '').trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1];
    return [0, 2, 4].map(at => parseInt(digits.slice(at, at + 2), 16)) as Rgb;
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null;
}

export function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The WCAG contrast ratio between two colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The fill floor for a series against the card, as styles.css holds --chart-N to. */
export const MIN_FILL_CONTRAST = 3;

/**
 * A colour moved toward the mode's ink (dark on a light card, light on a dark one) in 5% steps
 * until it reaches 3:1 on the surface. Unchanged when it already does.
 */
export function legibleOn(colour: string, surface: string, mode: Mode): string {
  const rgb = toRgb(colour);
  const ground = toRgb(surface);
  if (!rgb || !ground) return colour;
  if (contrast(rgb, ground) >= MIN_FILL_CONTRAST) return colour;
  const ink: Rgb = mode === 'dark' ? [255, 255, 255] : [0, 0, 0];
  for (let t = 0.05; t <= 1; t += 0.05) {
    // Measured after rounding to the hex that is actually drawn, which can lose the last 0.01.
    const moved = toHex(mix(rgb, ink, t));
    if (contrast(toRgb(moved)!, ground) >= MIN_FILL_CONTRAST) return moved;
  }
  return toHex(ink);
}

export interface ResolvedPalette {
  colors: string[];
  /** How many colours had to be moved to read on this card. */
  adjusted: number;
  /** The theme was drawn for the other mode, so this variant is the console's derivation. */
  derived: boolean;
}

/** The palette a theme draws in this mode, on this card. The console theme is the tokens as-is. */
export function paletteFor(themeId: string | null | undefined, tokens: ChartTokenSet): ResolvedPalette {
  const named = NAMED_THEMES.find(theme => theme.id === themeId);
  if (!named) return { colors: tokens.palette.slice(0, CHART_SLOTS), adjusted: 0, derived: false };
  const colors = named.colors.map(colour => legibleOn(colour, tokens.surface, tokens.mode));
  return {
    colors,
    adjusted: colors.filter((colour, i) => colour !== named.colors[i]).length,
    derived: named.designedFor !== tokens.mode,
  };
}

/** A palette in the order a widget chose, any colour it did not name following in theme order. */
export function ordered(colors: string[], order: number[] | undefined): string[] {
  if (!order?.length) return colors;
  const picked = order.filter(i => i < colors.length).map(i => colors[i]);
  return [...picked, ...colors.filter((_, i) => !order.includes(i))];
}

/** ECharts' theme name for a theme in a mode; registered under this, switched to with setTheme. */
export function themeKey(themeId: string | null | undefined, mode: Mode): string {
  return `${NAMED_THEMES.some(theme => theme.id === themeId) ? themeId : CONSOLE_THEME}-${mode}`;
}

/**
 * The ECharts theme object: a palette, and the console's chrome around it.
 *
 * Animations are short and eased out -- a tile redraws on every board filter, and a long tween
 * between two results reads as the data moving. Text is the console's 11 and 12px, never smaller.
 */
export function buildTheme(tokens: ChartTokenSet, palette: string[]): Record<string, unknown> {
  const axis = (splitLines: boolean) => ({
    axisLine: { show: true, lineStyle: { color: tokens.border } },
    axisTick: { show: false, lineStyle: { color: tokens.border } },
    axisLabel: { color: tokens.muted, fontSize: 11, fontFamily: tokens.font },
    nameTextStyle: { color: tokens.textSecondary, fontSize: 11, fontFamily: tokens.font },
    splitLine: { show: splitLines, lineStyle: { color: tokens.border, type: 'dashed' } },
    splitArea: { show: false },
  });
  return {
    color: palette,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: tokens.font, color: tokens.textSecondary, fontSize: 12 },
    title: {
      textStyle: { color: tokens.text, fontSize: 13, fontWeight: 600, fontFamily: tokens.font },
      subtextStyle: { color: tokens.muted, fontSize: 11, fontFamily: tokens.font },
    },
    legend: {
      textStyle: { color: tokens.textSecondary, fontSize: 11, fontFamily: tokens.font },
      pageTextStyle: { color: tokens.muted },
      pageIconColor: tokens.textSecondary,
      pageIconInactiveColor: tokens.border,
      inactiveColor: tokens.border,
    },
    tooltip: {
      backgroundColor: tokens.surface,
      borderColor: tokens.border,
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: tokens.text, fontSize: 12, fontFamily: tokens.font },
      axisPointer: {
        lineStyle: { color: tokens.muted },
        crossStyle: { color: tokens.muted },
        shadowStyle: { color: tokens.sunken, opacity: 0.6 },
        label: { backgroundColor: tokens.sunken, color: tokens.text },
      },
    },
    categoryAxis: axis(false),
    valueAxis: { ...axis(true), axisLine: { show: false } },
    logAxis: { ...axis(true), axisLine: { show: false } },
    timeAxis: axis(false),
    grid: { borderColor: tokens.border },
    polar: {},
    radar: {
      axisName: { color: tokens.textSecondary, fontSize: 11 },
      axisLine: { lineStyle: { color: tokens.border } },
      splitLine: { lineStyle: { color: tokens.border } },
      splitArea: { show: false },
    },
    dataZoom: {
      borderColor: tokens.border,
      fillerColor: tokens.sunken,
      textStyle: { color: tokens.muted, fontSize: 11 },
      handleStyle: { color: tokens.surface, borderColor: tokens.muted },
      moveHandleStyle: { color: tokens.border },
      dataBackground: { lineStyle: { color: tokens.muted }, areaStyle: { color: tokens.sunken } },
      selectedDataBackground: { lineStyle: { color: palette[0] }, areaStyle: { color: palette[0], opacity: 0.15 } },
      brushStyle: { color: tokens.sunken },
    },
    visualMap: {
      inRange: { color: [tokens.sunken, tokens.heat] },
      textStyle: { color: tokens.muted, fontSize: 11 },
    },
    toolbox: {
      iconStyle: { borderColor: tokens.muted },
      emphasis: { iconStyle: { borderColor: tokens.text, textFill: tokens.text } },
    },
    calendar: {
      itemStyle: { color: tokens.surface, borderColor: tokens.border },
      splitLine: { lineStyle: { color: tokens.muted } },
      dayLabel: { color: tokens.muted, fontSize: 11 },
      monthLabel: { color: tokens.textSecondary, fontSize: 11 },
      yearLabel: { color: tokens.muted, fontSize: 12 },
    },
    candlestick: {
      itemStyle: { color: tokens.up, color0: tokens.down, borderColor: tokens.up, borderColor0: tokens.down },
    },
    markLine: { label: { color: tokens.textSecondary, fontSize: 11 }, lineStyle: { color: tokens.muted } },
    markPoint: { label: { color: tokens.surface, fontSize: 11 } },
    animationDuration: 280,
    animationDurationUpdate: 220,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
  };
}
