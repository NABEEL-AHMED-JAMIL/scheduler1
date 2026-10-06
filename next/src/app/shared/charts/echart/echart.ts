import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, signal, viewChild } from '@angular/core';
import type { ECharts } from 'echarts/core';
import { EChartsModule, loadECharts } from './echart-runtime';

/** A registered theme: the name ECharts knows it by, and the object registered under it. */
export interface EChartThemeRef {
  key: string;
  object: Record<string, unknown>;
}

/** How long a resize waits for the next one before the chart redraws. */
const RESIZE_SETTLE_MS = 120;

/**
 * One ECharts chart, drawn once it is on screen and kept in step with its inputs.
 *
 * Built for a board of many tiles, which is where the cost of a chart library shows:
 *
 *   - NOTHING happens until the element is within a screen of being visible (IntersectionObserver).
 *     The ECharts chunk is not fetched, no instance is made, no option is computed into a scene.
 *     A board of thirty tiles draws the six in view and the rest as they are scrolled to.
 *   - The instance is made ONCE and every later change is a setOption on it -- a new result, a
 *     new kind, a filter -- never a dispose-and-init. The one exception is the renderer, which
 *     ECharts fixes at init: switching canvas and SVG makes a new instance.
 *   - Resizes are debounced (ResizeObserver, RESIZE_SETTLE_MS): dragging a window across a board
 *     would otherwise redraw every tile on every frame.
 *   - A theme change (light and dark, or a named palette) registers the theme and calls
 *     setTheme; the option is not rebuilt for it.
 *   - The instance is disposed when the component is, with its observers.
 *
 * `data-drawn` is set on the host once ECharts reports its first frame finished, so a test or a
 * measurement can wait for "drawn" rather than for a timeout.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-echart',
  template: `
    <div #canvas class="w-full" [style.height.px]="height()" role="img" [attr.aria-label]="label()"></div>
    @if (failed()) { <p class="field-note text-[color:var(--text-muted)]">{{ failed() }}</p> }
  `,
  host: { class: 'block min-w-0', '[attr.data-drawn]': 'drawn() ? "true" : null' },
})
export class EChart {
  readonly option = input<Record<string, unknown> | null>(null);
  readonly theme = input<EChartThemeRef | null>(null);
  readonly renderer = input<'canvas' | 'svg'>('canvas');
  readonly height = input(220);
  readonly label = input('Chart');

  readonly drawn = signal(false);
  readonly failed = signal('');

  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
  private lib: EChartsModule | null = null;
  private chart: ECharts | null = null;
  private madeWith: 'canvas' | 'svg' | null = null;
  private visible = false;
  private destroyed = false;
  private settle: ReturnType<typeof setTimeout> | null = null;
  private resizer: ResizeObserver | null = null;
  private watcher: IntersectionObserver | null = null;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') { this.reveal(); return; }
      this.watcher = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        this.watcher?.disconnect();
        this.watcher = null;
        this.reveal();
      }, { rootMargin: '200px 0px' });
      this.watcher.observe(host);
    });

    // Every input change after the first draw is applied to the instance in hand.
    effect(() => {
      const option = this.option();
      const theme = this.theme();
      const renderer = this.renderer();
      if (!this.visible || !this.lib) return;
      if (!this.chart || this.madeWith !== renderer) { this.make(); return; }
      if (theme) {
        this.lib.echarts.registerTheme(theme.key, theme.object);
        this.chart.setTheme(theme.key);
      }
      this.apply(option);
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.watcher?.disconnect();
      this.resizer?.disconnect();
      if (this.settle) clearTimeout(this.settle);
      this.chart?.dispose();
      this.chart = null;
    });
  }

  /** The chart instance, for a host that needs to call it (an export). Null until drawn. */
  instance(): ECharts | null {
    return this.chart;
  }

  private reveal(): void {
    this.visible = true;
    loadECharts().then(lib => {
      if (this.destroyed) return;
      this.lib = lib;
      this.make();
    }, () => this.failed.set('The chart library could not be loaded. Reload the page to try again.'));
  }

  private make(): void {
    if (!this.lib || this.destroyed) return;
    this.chart?.dispose();
    const theme = this.theme();
    if (theme) this.lib.echarts.registerTheme(theme.key, theme.object);
    const renderer = this.renderer();
    this.chart = this.lib.echarts.init(this.canvas().nativeElement, theme?.key, { renderer });
    this.madeWith = renderer;
    this.chart.on('finished', () => { if (!this.drawn()) this.drawn.set(true); });
    this.apply(this.option());
    if (!this.resizer && typeof ResizeObserver !== 'undefined') {
      this.resizer = new ResizeObserver(() => {
        if (this.settle) clearTimeout(this.settle);
        this.settle = setTimeout(() => this.chart?.resize(), RESIZE_SETTLE_MS);
      });
      this.resizer.observe(this.canvas().nativeElement);
    }
  }

  private apply(option: Record<string, unknown> | null): void {
    if (!this.chart) return;
    try {
      this.failed.set('');
      if (!option || !Object.keys(option).length) { this.chart.clear(); return; }
      this.chart.setOption(option, { notMerge: true, lazyUpdate: true });
    } catch (error) {
      // Logged, and said on the tile in words: a chart that throws must not take the board down.
      console.error('A chart could not be drawn', error);
      this.failed.set('This chart could not be drawn from this result.');
    }
  }
}
