import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal, viewChild } from '@angular/core';
import type { ECharts } from 'echarts/core';
import { ECHARTS_LOADER, EChartsModule } from './echart-runtime';

/** A registered theme: the name ECharts knows it by, and the object registered under it. */
export interface EChartThemeRef {
  key: string;
  object: Record<string, unknown>;
}

/** How long a resize waits for the next one before the chart redraws. */
const RESIZE_SETTLE_MS = 120;

/**
 * What ECharts hands a click handler: the mark under the pointer. Only the fields the console
 * reads are typed; the option builders' pickers (charts/chart-options.ts) read them.
 */
export interface EChartClick {
  componentType?: string;
  seriesType?: string;
  seriesIndex?: number;
  seriesName?: string;
  dataIndex?: number;
  dataType?: string;
  name?: string;
  value?: unknown;
  data?: unknown;
  treePathInfo?: { name: string; dataIndex?: number }[];
  treeAncestors?: { name: string; dataIndex?: number }[];
}

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
 *   - A click on a mark is handed out as `clicked`. The handler is bound ONCE per instance, when
 *     it is made, and it reads nothing from the option it was made with -- the host maps the
 *     click against the option on screen now -- so a new kind or a new result (a setOption) needs
 *     no re-binding, and a disposed instance takes its handler with it.
 *
 * The hover and switch hazards, and what answers each (2026-10-06 review):
 *   - The theme is registered and set only when it CHANGES. It used to be set on every option
 *     change, before the new option -- a full synchronous redraw of the OUTGOING kind under the
 *     pointer, with its tooltip still live, on every switch.
 *   - The tooltip and any emphasis are dropped before a new option lands, so a tooltip of the old
 *     kind is never left on screen over the new one.
 *   - Nothing is called on a disposed instance, and a resize or a draw waits for the element to
 *     have a size (a chart in a dialog still opening has none, and ECharts then draws nothing).
 *   - Every call into ECharts is caught: a chart that throws says so on its tile, never takes the
 *     board down, and never leaves an uncaught error in an effect.
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

  /** A click on a mark, as ECharts reported it. */
  readonly clicked = output<EChartClick>();

  readonly drawn = signal(false);
  readonly failed = signal('');

  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
  private readonly load = inject(ECHARTS_LOADER);
  private lib: EChartsModule | null = null;
  private chart: ECharts | null = null;
  private madeWith: 'canvas' | 'svg' | null = null;
  /** The theme the instance draws in now: its key and the object registered under it. */
  private themed = '';
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
      if (!this.visible || !this.lib || this.destroyed) return;
      if (!this.chart || this.chart.isDisposed() || this.madeWith !== renderer) { this.make(); return; }
      this.useTheme(theme);
      this.apply(option);
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.watcher?.disconnect();
      this.resizer?.disconnect();
      this.watcher = null;
      this.resizer = null;
      if (this.settle) clearTimeout(this.settle);
      this.settle = null;
      const chart = this.chart;
      this.chart = null;
      try { if (chart && !chart.isDisposed()) chart.dispose(); } catch { /* already gone with its element */ }
    });
  }

  /** The chart instance, for a host that needs to call it (an export). Null until drawn. */
  instance(): ECharts | null {
    return this.chart;
  }

  private reveal(): void {
    this.visible = true;
    this.load().then(lib => {
      if (this.destroyed) return;
      this.lib = lib;
      this.make();
    }, () => this.failed.set('The chart library could not be loaded. Reload the page to try again.'));
  }

  /** Whether the drawing area has a size: ECharts draws nothing into a box of zero. */
  private sized(): boolean {
    const box = this.canvas().nativeElement;
    return box.clientWidth > 0 && box.clientHeight > 0;
  }

  private make(): void {
    if (!this.lib || this.destroyed) return;
    this.watchSize();
    // Not yet laid out (a dialog still opening, a tab not shown): the size watcher makes it.
    if (!this.sized()) return;
    const old = this.chart;
    this.chart = null;
    try { if (old && !old.isDisposed()) old.dispose(); } catch { /* nothing to keep */ }
    try {
      const theme = this.theme();
      if (theme) this.lib.echarts.registerTheme(theme.key, theme.object);
      this.themed = theme ? themeStamp(theme) : '';
      const renderer = this.renderer();
      const chart = this.lib.echarts.init(this.canvas().nativeElement, theme?.key, { renderer });
      this.chart = chart;
      this.madeWith = renderer;
      // 'rendered', not 'finished': a chart with a looping effect (the top-five ripple) never finishes.
      chart.on('rendered', () => { if (!this.drawn()) this.drawn.set(true); });
      // Bound once, here, on this instance: see the class comment.
      let claimed: unknown = null;
      chart.on('click', params => {
        claimed = (params as { event?: { event?: unknown } }).event?.event ?? null;
        if (this.chart === chart) this.clicked.emit(withIndex(chart, params as EChartClick));
      });
      // A line or an area is ONE path, and ECharts reports no click on it -- only on its point
      // markers, which a long or smooth line does not draw. A click on the path that ECharts did
      // not claim is read as the category under the pointer.
      // Read after the dispatch: zrender runs its handlers and ECharts' in no promised order, and a
      // click ECharts did report (a point, a series path) must not be emitted a second time.
      chart.getZr().on('click', event => {
        if (this.chart !== chart || !event.target) return;
        queueMicrotask(() => {
          if (this.chart !== chart || event.event === claimed) return;
          const line = lineClick(chart, this.option(), event.offsetX, event.offsetY);
          if (line) this.clicked.emit(line);
        });
      });
    } catch (error) {
      console.error('A chart could not be drawn', error);
      this.failed.set('This chart could not be drawn from this result.');
      return;
    }
    this.apply(this.option());
  }

  /** Registers and switches to a theme -- only when it is not the one in use. */
  private useTheme(theme: EChartThemeRef | null): void {
    const stamp = theme ? themeStamp(theme) : '';
    if (!theme || !this.chart || !this.lib || stamp === this.themed) return;
    try {
      this.lib.echarts.registerTheme(theme.key, theme.object);
      this.chart.setTheme(theme.key);
      this.themed = stamp;
    } catch (error) {
      console.error('A chart theme could not be applied', error);
    }
  }

  private watchSize(): void {
    if (this.resizer || typeof ResizeObserver === 'undefined') return;
    this.resizer = new ResizeObserver(() => {
      if (this.settle) clearTimeout(this.settle);
      this.settle = setTimeout(() => {
        this.settle = null;
        if (this.destroyed || !this.sized()) return;
        if (!this.chart || this.chart.isDisposed()) { this.make(); return; }
        try { this.chart.resize(); } catch (error) { console.error('A chart could not be resized', error); }
      }, RESIZE_SETTLE_MS);
    });
    this.resizer.observe(this.canvas().nativeElement);
  }

  private apply(option: Record<string, unknown> | null): void {
    const chart = this.chart;
    if (!chart || chart.isDisposed()) return;
    try {
      this.failed.set('');
      // The outgoing kind's tooltip and highlight go first: a tooltip naming a bar of the old
      // chart, left standing over the new one until the pointer moved, read as a broken chart.
      chart.dispatchAction({ type: 'hideTip' });
      chart.dispatchAction({ type: 'downplay' });
      if (!option || !Object.keys(option).length) { chart.clear(); return; }
      chart.setOption(option, { notMerge: true, lazyUpdate: true });
    } catch (error) {
      // Logged, and said on the tile in words: a chart that throws must not take the board down.
      console.error('A chart could not be drawn', error);
      this.failed.set('This chart could not be drawn from this result.');
    }
  }
}

/**
 * A theme's identity: its key and what is registered under it. The object is rebuilt on every
 * resolve, so identity says nothing; its content is a few hundred bytes of colours.
 */
function themeStamp(theme: EChartThemeRef): string {
  return `${theme.key}\u0000${JSON.stringify(theme.object)}`;
}

/**
 * A click on a line or an area (rather than on one of its points) carries no dataIndex: ECharts
 * reports the series and nothing more. The point it stands for is the category under the pointer,
 * read back from the pixel -- so a click anywhere along a line narrows to that point, as a click
 * on a bar narrows to the bar.
 */
/** The click a line's path stands for: the category under the pointer, on the line kinds' grid. */
export function lineClick(chart: Pick<ECharts, 'convertFromPixel' | 'containPixel'>, option: Record<string, unknown> | null,
    x: number, y: number): EChartClick | null {
  const series = (option?.['series'] as { type?: string }[] | undefined) ?? [];
  const lines = series.map((one, i) => (one.type === 'line' ? i : -1)).filter(i => i >= 0);
  const axis = option?.['xAxis'] as { type?: string } | undefined;
  if (!lines.length || Array.isArray(axis) || axis?.type !== 'category') return null;
  try {
    if (!chart.containPixel({ gridIndex: 0 }, [x, y])) return null;
    const point = chart.convertFromPixel({ gridIndex: 0 }, [x, y]);
    const index = Array.isArray(point) ? Math.round(Number(point[0])) : NaN;
    if (!Number.isFinite(index) || index < 0) return null;
    // One line names its series; over a stack of several, the click names the category alone.
    return { componentType: 'series', seriesType: 'line', seriesIndex: lines.length === 1 ? lines[0] : undefined, dataIndex: index };
  } catch {
    return null;
  }
}

function withIndex(chart: ECharts, click: EChartClick & { event?: { offsetX?: number; offsetY?: number } }): EChartClick {
  const at = click.event;
  if (click.dataIndex !== undefined && click.dataIndex !== null) return click;
  if (click.componentType !== 'series' || click.seriesType !== 'line' || at?.offsetX === undefined) return click;
  try {
    const point = chart.convertFromPixel({ seriesIndex: click.seriesIndex ?? 0 }, [at.offsetX, at.offsetY ?? 0]);
    const index = Array.isArray(point) ? Math.round(Number(point[0])) : NaN;
    return Number.isFinite(index) && index >= 0 ? { ...click, dataIndex: index } : click;
  } catch {
    return click;
  }
}
