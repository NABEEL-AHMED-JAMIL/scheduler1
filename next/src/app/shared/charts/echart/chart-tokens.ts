import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { CHART_SLOTS } from '../status-color';
import { ChartTokenSet, Mode, toRgb } from './echart-theme';

/**
 * The console's colour tokens, resolved, and re-read the moment the theme flips.
 *
 * Watches the root element's class rather than ThemeService's signal: ThemeService applies the
 * class in an effect, and an effect here reading the same signal could run first and read the
 * outgoing theme's values. The class changing IS the moment the tokens change.
 *
 * Each value is resolved to a plain colour by painting it to a 1x1 canvas and reading the pixel
 * back, because a token may be written as oklch() or color-mix(), which canvas understands and
 * contrast arithmetic does not. Where there is no canvas (the unit tests' jsdom) the computed
 * text is passed through.
 *
 * @author Nabeel Ahmed
 */
@Injectable({ providedIn: 'root' })
export class ChartTokens {
  readonly tokens = signal<ChartTokenSet>(readTokens());

  constructor() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      const next = readTokens();
      if (JSON.stringify(next) !== JSON.stringify(this.tokens())) this.tokens.set(next);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}

let probe: CanvasRenderingContext2D | null | undefined;

/** A CSS colour as rgb(), or the text unchanged when it cannot be resolved here. */
export function resolveColour(value: string): string {
  const text = value.trim();
  // Already a plain colour: nothing to resolve, and no canvas to make.
  if (!text || toRgb(text)) return text;
  if (probe === undefined) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      probe = canvas.getContext('2d', { willReadFrequently: true });
    } catch {
      probe = null;
    }
  }
  if (!probe) return text;
  try {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = text;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    return a === 0 ? text : `rgb(${r}, ${g}, ${b})`;
  } catch {
    return text;
  }
}

export function readTokens(): ChartTokenSet {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const style = root ? getComputedStyle(root) : null;
  const read = (name: string) => resolveColour(style?.getPropertyValue(name) ?? '');
  const mode: Mode = root?.classList.contains('dark') ? 'dark' : 'light';
  return {
    mode,
    palette: Array.from({ length: CHART_SLOTS }, (_, i) => read(`--chart-${i}`)),
    text: read('--text-primary'),
    textSecondary: read('--text-secondary'),
    muted: read('--text-muted'),
    border: read('--border-subtle'),
    surface: read('--surface-raised'),
    sunken: read('--surface-sunken'),
    heat: read('--heat'),
    up: read('--series-ok'),
    down: read('--series-crit'),
    font: (style?.getPropertyValue('--font-sans') ?? '').trim() || 'sans-serif',
  };
}
