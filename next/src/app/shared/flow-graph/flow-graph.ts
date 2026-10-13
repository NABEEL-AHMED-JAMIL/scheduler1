import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Icon } from '../ui/icon';
import {
  FLOW_KINDS, FLOW_METRICS_PER_ROW, FLOW_NODE_WIDTH, FLOW_ROW, FlowDirection, FlowEdge, FlowNode, FlowTone, fitText, flowIconPaths, layoutFlow,
  nodeRows, sameGraph,
} from './flow-graph.model';

interface View { x: number; y: number; k: number; }
const ZOOM_MIN = 0.2, ZOOM_MAX = 3, STEP = 1.2, MINI_W = 140, MINI_H = 92, FAR_ZOOM = 0.45;
const TONES: FlowTone[] = ['neutral', 'ok', 'warn', 'crit', 'info', 'brand'];
const clamp = (k: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
const raf: (cb: () => void) => number = typeof requestAnimationFrame === 'function'
  ? cb => requestAnimationFrame(cb) : cb => setTimeout(cb, 16) as unknown as number;
const unraf = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));
let seq = 0;

/**
 * An SVG flow graph -- a pipeline, a workflow, a run's plan -- laid out by layoutFlow and drawn
 * without a library: nodes as cards, edges as curves with arrowheads, a vertical zoom toolbar, a
 * minimap, pan by dragging, ctrl/cmd + wheel (or a pinch) to zoom about the cursor.
 *
 * The host has no intrinsic height: give it one (the `height` input, or a flex/grid parent with
 * min-height: 0). Pan and zoom run outside template listeners and write the view at most once per
 * animation frame, so a drag costs one change detection per frame, not one per pointer event.
 */
@Component({
  selector: 'app-flow-graph',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flow-graph', '[style.height]': 'height()' },
  template: `
    @if (!vm().nodes.length) {
      <div class="fg-empty"><ng-content select="[empty]" /></div>
    } @else {
      <svg class="fg-canvas" [class.fg-far]="far()" tabindex="0" role="group" [attr.aria-label]="ariaLabel() || null"
           (click)="onCanvasClick($event)" (keydown)="onKey($event)">
        <defs>
          @for (t of tones; track t) {
            <marker [attr.id]="uid + '-' + t" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
                    markerUnits="userSpaceOnUse" orient="auto-start-reverse" [attr.class]="'t-' + t">
              <path d="M0,1 L10,5 L0,9 z" class="fg-arrow" />
            </marker>
          }
        </defs>
        <g class="fg-world" [attr.transform]="transform()">
          @for (e of vm().edges; track $index) {
            <path [attr.class]="'fg-edge t-' + e.tone" [attr.d]="e.path"
                  [attr.marker-end]="'url(#' + uid + '-' + e.tone + ')'" [attr.stroke-dasharray]="e.dashed ? '5 4' : null" />
          }
          @for (e of vm().edges; track $index) {
            @if (e.text) {
              <g class="fg-elabel" [attr.transform]="'translate(' + e.labelX + ',' + e.labelY + ')'">
                <rect [attr.x]="-e.textW / 2" y="-9" [attr.width]="e.textW" height="18" rx="9" />
                <text text-anchor="middle" dy="0.35em">{{ e.text }}</text>
              </g>
            }
          }
          @for (n of vm().nodes; track n.id) {
            <g data-node [attr.data-id]="n.id" [attr.class]="'fg-node t-' + n.tone + (n.hot ? ' hot' : '') + (n.pending ? ' pending' : '') + (n.id === selected() ? ' sel' : '')"
               [attr.transform]="'translate(' + n.x + ',' + n.y + ')'" tabindex="0" role="button"
               [attr.aria-label]="n.aria" [attr.aria-pressed]="n.id === selected()" (click)="pick(n.id, $event)">
              <title>{{ n.aria }}</title>
              <rect class="fg-ring" x="-4" y="-4" [attr.width]="n.w + 8" [attr.height]="n.h + 8" rx="14" />
              <rect class="fg-frame" [attr.width]="n.w" [attr.height]="n.h" rx="10" />
              <g [attr.class]="'p-' + n.accent">
                <rect class="fg-pill-bg" x="12" y="13" width="28" height="28" rx="7" />
                <g class="fg-glyph" transform="translate(18,19) scale(0.6667)">
                  @for (d of n.glyph; track $index) { <path [attr.d]="d" /> }
                </g>
              </g>
              <text class="fg-label" x="50" [attr.y]="n.subText ? 29 : 33">{{ n.title }}</text>
              @if (n.subText) { <text class="fg-sub" x="50" y="46">{{ n.subText }}</text> }
              @if (n.pills.length) {
                <g class="fg-badges">
                  @for (b of n.pills; track $index) {
                    <g [attr.class]="'p-' + n.tone" [attr.transform]="'translate(' + b.x + ',' + (n.rows.badgesY - 4) + ')'">
                      <rect class="fg-pill-bg" [attr.width]="b.w" height="16" rx="8" />
                      <text class="fg-pill-fg fg-badge" [attr.x]="b.w / 2" y="11.5" text-anchor="middle">{{ b.text }}</text>
                    </g>
                  }
                </g>
              }
              @if (n.cells.length) {
                <g class="fg-metrics">
                  <line class="fg-sep" x1="12" [attr.x2]="n.w - 12" [attr.y1]="n.rows.metricsY - 2" [attr.y2]="n.rows.metricsY - 2" />
                  @for (c of n.cells; track $index) {
                    <text [attr.x]="c.x" [attr.y]="c.y"><tspan class="fg-mlabel">{{ c.label }}</tspan><tspan class="fg-mvalue" dx="4">{{ c.value }}</tspan></text>
                  }
                </g>
              }
              @if (n.shareW !== null) {
                <rect class="fg-track" x="12" [attr.y]="n.rows.shareY + 1" [attr.width]="n.w - 24" height="4" rx="2" />
                <rect class="fg-bar" x="12" [attr.y]="n.rows.shareY + 1" [attr.width]="n.shareW" height="4" rx="2" />
              }
            </g>
          }
        </g>
      </svg>

      <div class="fg-toolbar" role="toolbar" aria-label="Graph view">
        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Zoom in" title="Zoom in (+)" data-act="in" (click)="zoomBy(step)">
          <app-icon name="plus" />
        </button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Zoom out" title="Zoom out (-)" data-act="out" (click)="zoomBy(1 / step)">
          <app-icon name="minus" />
        </button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Fit to view" title="Fit to view (0)" data-act="fit" (click)="fit()">
          <app-icon name="maximize" />
        </button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm fg-reset" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" data-act="reset" (click)="resetZoom()">1:1</button>
        @if (canFullscreen) {
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="fullscreen" (click)="toggleFullscreen()"
                  [attr.aria-label]="fullscreen() ? 'Exit full screen' : 'Full screen'" [attr.title]="fullscreen() ? 'Exit full screen' : 'Full screen'"
                  [attr.aria-pressed]="fullscreen()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="fg-tool-glyph">
              <path [attr.d]="fullscreen() ? 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7' : 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7'" />
            </svg>
          </button>
        }
      </div>

      @if (mini(); as m) {
        <svg class="fg-minimap" [attr.width]="miniW" [attr.height]="miniH" aria-hidden="true">
          @for (r of m.nodes; track $index) {
            <rect [attr.class]="'t-' + r.tone" [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.w" [attr.height]="r.h" rx="1.5" />
          }
          @if (viewport(); as v) {
            <rect class="fg-viewport" [attr.x]="v.x" [attr.y]="v.y" [attr.width]="v.w" [attr.height]="v.h" />
          }
        </svg>
      }
    }
  `,
  styles: `
    :host { display: block; position: relative; overflow: hidden; min-height: 0; min-width: 0; background: var(--surface-sunken); }
    :host(:fullscreen) { background: var(--surface-page); }
    .fg-empty { position: absolute; inset: 0; display: grid; place-items: center; padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.875rem; }
    .fg-canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; outline: none; user-select: none; }
    .fg-canvas.panning { cursor: grabbing; }
    .fg-canvas:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
    .t-neutral { --fg-tone: var(--text-muted); }
    .t-ok { --fg-tone: var(--ok-text); }
    .t-warn { --fg-tone: var(--warn-text); }
    .t-crit { --fg-tone: var(--crit-text); }
    .t-info { --fg-tone: var(--info-mark); }
    .t-brand { --fg-tone: var(--accent-mark); }
    .p-neutral { --pb: var(--pill-neutral-bg); --pf: var(--pill-neutral-fg); }
    .p-ok { --pb: var(--pill-ok-bg); --pf: var(--pill-ok-fg); }
    .p-warn { --pb: var(--pill-warn-bg); --pf: var(--pill-warn-fg); }
    .p-crit { --pb: var(--pill-crit-bg); --pf: var(--pill-crit-fg); }
    .p-info { --pb: var(--pill-info-bg); --pf: var(--pill-info-fg); }
    .p-brand { --pb: var(--pill-brand-bg); --pf: var(--pill-brand-fg); }
    .fg-arrow { fill: var(--fg-tone); }
    .fg-edge { fill: none; stroke: var(--fg-tone); stroke-width: 1.5; }
    .fg-elabel rect { fill: var(--surface-raised); stroke: var(--border-subtle); }
    .fg-elabel text { fill: var(--text-secondary); font-size: 11px; }
    .fg-node { cursor: pointer; outline: none; }
    .fg-frame { fill: var(--surface-raised); stroke: var(--fg-tone); stroke-width: 1.25; }
    .fg-node.t-neutral .fg-frame { stroke: var(--border-strong); }
    .fg-node:hover .fg-frame { stroke-width: 1.75; }
    .fg-node.hot .fg-frame { stroke-width: 2.75; }
    .fg-node.pending .fg-frame { stroke-dasharray: 5 3; }
    .fg-node.hot.t-neutral .fg-frame { stroke: var(--accent-mark); }
    .fg-ring { fill: none; stroke: transparent; stroke-width: 2; }
    .fg-node.sel .fg-ring { stroke: var(--accent-mark); }
    .fg-node:focus-visible .fg-ring { stroke: var(--focus-ring); stroke-dasharray: 4 3; }
    .fg-pill-bg { fill: var(--pb); }
    .fg-pill-fg { fill: var(--pf); }
    .fg-glyph { fill: none; stroke: var(--pf); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
    .fg-label { fill: var(--text-primary); font-size: 14px; font-weight: 600; }
    .fg-sub, .fg-mvalue { fill: var(--text-muted); font-family: var(--font-mono); font-size: 12px; }
    .fg-mvalue { fill: var(--text-primary); }
    .fg-mlabel { fill: var(--text-muted); font-size: 12px; }
    .fg-badge { font-size: 11px; font-weight: 600; }
    .fg-sep { stroke: var(--border-subtle); }
    .fg-track { fill: var(--surface-sunken); }
    .fg-bar { fill: var(--fg-tone); }
    .fg-node.t-neutral .fg-bar { fill: var(--accent-mark); }
    .fg-toolbar { position: absolute; top: 0.5rem; right: 0.5rem; display: flex; flex-direction: column; gap: 2px; padding: 2px;
      background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); box-shadow: 0 1px 3px var(--shadow-color); }
    .fg-reset { font-size: 11px; font-weight: 600; min-width: 2rem; }
    .fg-tool-glyph { width: 1em; height: 1em; }
    .fg-minimap { position: absolute; right: 0.5rem; bottom: 0.5rem; background: var(--surface-raised); border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); cursor: crosshair; touch-action: none; box-shadow: 0 1px 3px var(--shadow-color); }
    .fg-minimap rect { fill: var(--fg-tone); opacity: 0.55; }
    .fg-minimap rect.t-neutral { fill: var(--border-strong); opacity: 1; }
    /* Zoomed far out: the words cannot be read, so they are not drawn -- a 100-step flow stays smooth to pan. */
    .fg-far .fg-sub, .fg-far .fg-elabel, .fg-far .fg-badges, .fg-far .fg-metrics { display: none; }
    .fg-minimap .fg-viewport { fill: var(--accent-soft); fill-opacity: 0.35; opacity: 1; stroke: var(--accent-mark); stroke-width: 1.25; }
  `,
})
export class FlowGraph {
  readonly nodes = input<FlowNode[]>([]);
  readonly edges = input<FlowEdge[]>([]);
  readonly direction = input<FlowDirection>('LR');
  readonly selected = input<string | null>(null);
  readonly ariaLabel = input('');
  readonly minimap = input(true);
  readonly height = input('100%');
  /**
   * The smallest zoom Fit goes to: a long flow in a small panel is drawn readable and starts at its beginning (pan or
   * zoom out for the rest) rather than shrunk until nothing can be read. Default: fit everything.
   */
  readonly minFit = input(0.2);
  /** A node's width; a workflow's steps say who and what in their sub line, and take more room. */
  readonly nodeWidth = input(FLOW_NODE_WIDTH);
  readonly select = output<string | null>();

  protected readonly uid = `fg${++seq}`;
  protected readonly tones = TONES;
  protected readonly step = STEP;
  protected readonly miniW = MINI_W;
  protected readonly miniH = MINI_H;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled
    && typeof this.host.requestFullscreen === 'function';
  protected readonly fullscreen = signal(false);

  readonly view = signal<View>({ x: 0, y: 0, k: 1 });
  protected readonly transform = computed(() => { const v = this.view(); return `translate(${v.x},${v.y}) scale(${v.k})`; });
  private readonly size = signal({ w: 0, h: 0 });

  /**
   * What is laid out: the inputs, kept as they were while a screen hands over the same graph again (a signal that ticks
   * with nothing drawn changed -- a selection, a typed setting the nodes do not show) so the layout is not run again.
   */
  private readonly graph = computed(() => ({ nodes: this.nodes() ?? [], edges: this.edges() ?? [], direction: this.direction(), width: this.nodeWidth() }),
    { equal: (a, b) => a.direction === b.direction && a.width === b.width && sameGraph(a.nodes, a.edges, b.nodes, b.edges) });

  /** Zoomed out past reading: the sub lines, badges, metrics and edge labels are left out (CSS), the frames stay. */
  protected readonly far = computed(() => this.view().k < FAR_ZOOM);

  protected readonly vm = computed(() => {
    const g = this.graph();
    const l = layoutFlow(g.nodes, g.edges, { direction: g.direction, nodeWidth: g.width });
    const nodes = l.nodes.map(n => {
      const tone: FlowTone = n.tone ?? 'neutral';
      const textW = n.w - 62;
      const badges = n.badges ?? [];
      const pills: { text: string; x: number; w: number }[] = [];
      let bx = 12;
      for (let i = 0; i < badges.length; i++) {
        const text = fitText(badges[i], 150, 11, 0.6);
        const w = Math.round(text.length * 6 + 12);
        const rest = badges.length - i - 1;
        if (bx + w > n.w - 12 - (rest ? 30 : 0)) { pills.push({ text: `+${badges.length - i}`, x: bx, w: 26 }); break; }
        pills.push({ text, x: bx, w });
        bx += w + 4;
      }
      const cellW = (n.w - 24) / FLOW_METRICS_PER_ROW;
      const rows = nodeRows(n);
      const cells = (n.metrics ?? []).map((m, i) => {
        const label = fitText(m.label, cellW * 0.45, 12, 0.6);
        return {
          label, value: fitText(m.value, cellW - label.length * 7.2 - 8, 12, 0.62),
          x: 12 + (i % FLOW_METRICS_PER_ROW) * cellW, y: rows.metricsY + Math.floor(i / FLOW_METRICS_PER_ROW) * FLOW_ROW.metric + 13,
        };
      });
      const aria = [n.label, n.sub, ...badges, ...(n.metrics ?? []).map(m => `${m.label} ${m.value}`)].filter(Boolean).join(', ');
      return {
        ...n, tone, rows, pills, cells, aria,
        accent: n.accent ?? (FLOW_KINDS[n.kind] ?? FLOW_KINDS.other).accent,
        glyph: flowIconPaths(n.icon, n.kind),
        title: fitText(n.label, textW, 14),
        subText: n.sub ? fitText(n.sub, textW, 12, 0.62) : '',
        shareW: n.share == null ? null : Math.round((n.w - 24) * Math.min(1, Math.max(0, n.share))),
      };
    });
    const edges = l.edges.map(e => {
      const text = e.label ? fitText(e.label, 168, 11, 0.58) : '';
      return { ...e, tone: (e.tone ?? 'neutral') as FlowTone, text, textW: Math.round(text.length * 6.1 + 14) };
    });
    return { nodes, edges, width: l.width, height: l.height, key: g.direction + '|' + l.nodes.map(n => n.id).sort().join('\n') };
  });

  protected readonly mini = computed(() => {
    const l = this.vm();
    if (!this.minimap() || l.nodes.length <= 3) return null;
    const m = Math.min((MINI_W - 12) / l.width, (MINI_H - 12) / l.height);
    const ox = (MINI_W - l.width * m) / 2, oy = (MINI_H - l.height * m) / 2;
    return { m, ox, oy, nodes: l.nodes.map(n => ({ x: ox + n.x * m, y: oy + n.y * m, w: Math.max(2, n.w * m), h: Math.max(2, n.h * m), tone: n.tone })) };
  });

  protected readonly viewport = computed(() => {
    const mm = this.mini(), v = this.view(), s = this.size();
    if (!mm || !s.w || !s.h) return null;
    return { x: mm.ox - (v.x / v.k) * mm.m, y: mm.oy - (v.y / v.k) * mm.m, w: (s.w / v.k) * mm.m, h: (s.h / v.k) * mm.m };
  });

  /** True once the user pans or zooms; a re-render of the same graph then keeps their view. */
  private userMoved = false;
  private lastKey = '';
  private pending: View | null = null;
  private frame = 0;
  private drag: { mode: 'pan' | 'mini'; id: number; sx: number; sy: number; v: View; moved: boolean; el: Element } | null = null;
  private suppressClick = false;

  constructor() {
    effect(() => {
      const key = this.vm().key;
      untracked(() => {
        if (key !== this.lastKey) { this.lastKey = key; this.userMoved = false; }
        if (!this.userMoved) this.fit();
      });
    });

    const h = this.host;
    const on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      h.addEventListener(t, fn as EventListener, o);
      return () => h.removeEventListener(t, fn as EventListener, o);
    };
    const offs = [
      on('pointerdown', e => this.onDown(e)),
      on('pointermove', e => this.onMove(e)),
      on('pointerup', e => this.onUp(e)),
      on('pointercancel', e => this.onUp(e)),
      on('wheel', e => this.onWheel(e), { passive: false }),
    ];
    const onFs = () => {
      this.fullscreen.set(typeof document !== 'undefined' && document.fullscreenElement === h);
    };
    if (typeof document !== 'undefined') document.addEventListener('fullscreenchange', onFs);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        this.size.set({ w: h.clientWidth, h: h.clientHeight });
        if (!this.userMoved) this.fit();
      });
      ro.observe(h);
    }
    inject(DestroyRef).onDestroy(() => {
      offs.forEach(off => off());
      if (typeof document !== 'undefined') document.removeEventListener('fullscreenchange', onFs);
      ro?.disconnect();
      if (this.frame) unraf(this.frame);
    });
  }

  /** Scales and centres the whole graph in the host (never above 100%). */
  fit(): void {
    this.cancelFrame();
    const w = this.host.clientWidth, h = this.host.clientHeight, l = untracked(this.vm);
    this.size.set({ w, h });
    this.userMoved = false;
    if (!w || !h || !l.width || !l.height) { this.view.set({ x: 0, y: 0, k: 1 }); return; }
    const k = clamp(Math.max(this.minFit(), Math.min((w - 32) / l.width, (h - 32) / l.height, 1)));
    // Larger than the canvas at this zoom: its start is shown (top or left), not its middle.
    const x = l.width * k > w - 32 ? 16 : (w - l.width * k) / 2;
    const y = l.height * k > h - 32 ? 16 : (h - l.height * k) / 2;
    this.view.set({ x, y, k });
  }

  zoomBy(factor: number): void {
    const s = this.measure();
    this.setView(this.zoomed(this.current(), factor, s.w / 2, s.h / 2));
  }

  resetZoom(): void {
    const v = this.current();
    this.zoomBy(1 / v.k);
  }

  toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement === this.host) void document.exitFullscreen?.().catch(() => {});
    else void this.host.requestFullscreen?.().catch(() => {});
  }

  protected pick(id: string, e: Event): void {
    e.stopPropagation();
    if (this.suppressClick) { this.suppressClick = false; return; }
    this.select.emit(id);
  }

  protected onCanvasClick(_e: MouseEvent): void {
    if (this.suppressClick) { this.suppressClick = false; return; }
    this.select.emit(null);
  }

  protected onKey(e: KeyboardEvent): void {
    const node = (e.target as Element | null)?.closest?.('[data-node]');
    if (node && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.select.emit(node.getAttribute('data-id'));
    } else if (e.key === 'Escape') {
      this.select.emit(null);
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomBy(STEP); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoomBy(1 / STEP); }
    else if (e.key === '0') { e.preventDefault(); this.fit(); }
  }

  private onDown(e: PointerEvent): void {
    const t = e.target as Element;
    if (e.button !== 0 || !t?.closest || t.closest('.fg-toolbar')) return;
    this.suppressClick = false;
    const mini = t.closest('.fg-minimap');
    const canvas = t.closest('.fg-canvas');
    if (!mini && !canvas) return;
    this.drag = { mode: mini ? 'mini' : 'pan', id: e.pointerId, sx: e.clientX, sy: e.clientY, v: this.current(), moved: false, el: mini ?? canvas! };
    if (mini) { this.capture(e); this.centreOnMini(e); }
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (d.mode === 'mini') { this.centreOnMini(e); return; }
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; this.capture(e); d.el.classList.add('panning'); }
    this.userMoved = true;
    this.schedule({ x: d.v.x + dx, y: d.v.y + dy, k: d.v.k });
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) this.suppressClick = true;
    d.el.classList.remove('panning');
    try { (d.el as Element).releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    this.drag = null;
  }

  private onWheel(e: WheelEvent): void {
    const t = e.target as Element;
    if (!t?.closest?.('.fg-canvas, .fg-minimap')) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const v = this.current();
    this.userMoved = true;
    if (e.ctrlKey || e.metaKey) {
      const r = this.host.getBoundingClientRect();
      this.schedule(this.zoomed(v, Math.exp(-e.deltaY * unit * 0.0025), e.clientX - r.left, e.clientY - r.top));
    } else {
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
      this.schedule({ x: v.x - dx, y: v.y - dy, k: v.k });
    }
  }

  private centreOnMini(e: PointerEvent): void {
    const mm = untracked(this.mini), d = this.drag;
    if (!mm || !d) return;
    const r = d.el.getBoundingClientRect(), s = this.measure(), v = this.current();
    const gx = (e.clientX - r.left - mm.ox) / mm.m, gy = (e.clientY - r.top - mm.oy) / mm.m;
    this.userMoved = true;
    this.schedule({ x: s.w / 2 - gx * v.k, y: s.h / 2 - gy * v.k, k: v.k });
  }

  private capture(e: PointerEvent): void {
    try { this.drag?.el.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
  }

  private zoomed(v: View, factor: number, px: number, py: number): View {
    const k = clamp(v.k * factor);
    return { x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k, k };
  }

  private measure() {
    const s = { w: this.host.clientWidth, h: this.host.clientHeight };
    const old = untracked(this.size);
    if (s.w !== old.w || s.h !== old.h) this.size.set(s);
    return s;
  }

  private current(): View { return this.pending ?? untracked(this.view); }

  private setView(v: View): void {
    this.cancelFrame();
    this.userMoved = true;
    this.view.set(v);
  }

  /** Coalesces pointer and wheel moves into one view write per animation frame. */
  private schedule(v: View): void {
    this.pending = v;
    if (this.frame) return;
    this.frame = raf(() => {
      this.frame = 0;
      if (this.pending) { this.view.set(this.pending); this.pending = null; }
    });
  }

  private cancelFrame(): void {
    if (this.frame) { unraf(this.frame); this.frame = 0; }
    this.pending = null;
  }
}
