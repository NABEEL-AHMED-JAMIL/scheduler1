/**
 * The data behind <app-flow-graph>, and the layout that places it. Pure: no DOM, no Angular, so the
 * placement is unit-tested on its own and a screen can lay out a graph without rendering one.
 *
 * The layout is a layered DAG (Sugiyama-lite): a node's layer is the longest path to it from a
 * source, back edges found by a depth-first walk are left out of that so a cycle cannot loop it,
 * nodes in a layer are ordered by the barycentre of their neighbours (down, up, down) to cut
 * crossings, and every layer is centred on the widest one.
 */
export type FlowNodeKind = 'trigger' | 'read' | 'process' | 'ai' | 'output' | 'review' | 'legacy' | 'other';
export type FlowTone = 'neutral' | 'ok' | 'warn' | 'crit' | 'info' | 'brand';
export interface FlowMetric { label: string; value: string; }
export interface FlowNode {
  id: string;
  label: string;
  sub?: string | null;
  kind: FlowNodeKind;
  /** Overrides the kind's glyph; a name from FLOW_ICONS (the app-icon names this graph carries). */
  icon?: string | null;
  tone?: FlowTone | null;
  badges?: string[];
  metrics?: FlowMetric[];
  /** 0..1: a bar along the node's foot, e.g. its share of the run's time. */
  share?: number | null;
  hot?: boolean;
}
export interface FlowEdge { from: string; to: string; label?: string | null; tone?: FlowTone | null; dashed?: boolean; }

export type FlowDirection = 'LR' | 'TB';
export interface FlowLayoutOptions { direction?: FlowDirection; nodeWidth?: number; nodeHeight?: number; gapX?: number; gapY?: number; }
export type PlacedFlowNode = FlowNode & { x: number; y: number; w: number; h: number; layer: number };
export type PlacedFlowEdge = FlowEdge & { path: string; labelX: number; labelY: number };
export interface FlowLayout { nodes: PlacedFlowNode[]; edges: PlacedFlowEdge[]; width: number; height: number; }

/** Margin kept around the drawing, so a selected node's ring is never clipped. */
export const FLOW_PAD = 16;
export const FLOW_NODE_WIDTH = 224;
/** Icon, label and sub line. */
export const FLOW_NODE_BASE = 54;
export const FLOW_ROW = { badges: 22, metric: 18, share: 10 } as const;
export const FLOW_METRICS_PER_ROW = 2;

/** Where each optional row of a node starts, and the node's total height. Shared with the renderer. */
export function nodeRows(node: FlowNode, base = FLOW_NODE_BASE): { badgesY: number; metricsY: number; shareY: number; h: number } {
  let y = base;
  const badgesY = y;
  if (node.badges?.length) y += FLOW_ROW.badges;
  const metricsY = y;
  const metricRows = Math.ceil((node.metrics?.length ?? 0) / FLOW_METRICS_PER_ROW);
  if (metricRows) y += metricRows * FLOW_ROW.metric + 4;
  const shareY = y;
  if (node.share != null) y += FLOW_ROW.share;
  return { badgesY, metricsY, shareY, h: y };
}

/** Cuts text to fit `px` at an estimated `fontPx * ratio` per character, ending in an ellipsis. */
export function fitText(text: string | null | undefined, px: number, fontPx: number, ratio = 0.56): string {
  const s = text ?? '';
  const max = Math.max(1, Math.floor(px / (fontPx * ratio)));
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

const r = (n: number) => Math.round(n * 10) / 10;

export function layoutFlow(nodes: FlowNode[], edges: FlowEdge[], opts: FlowLayoutOptions = {}): FlowLayout {
  const dir = opts.direction ?? 'LR';
  const nodeW = opts.nodeWidth ?? FLOW_NODE_WIDTH;
  const base = opts.nodeHeight ?? FLOW_NODE_BASE;
  const gapX = opts.gapX ?? (dir === 'LR' ? 80 : 28);
  const gapY = opts.gapY ?? (dir === 'LR' ? 28 : 64);

  // First occurrence of an id wins; a duplicate would otherwise be drawn on top of it.
  const list: FlowNode[] = [];
  const index = new Map<string, number>();
  for (const n of nodes) if (!index.has(n.id)) { index.set(n.id, list.length); list.push(n); }
  const n = list.length;
  if (!n) return { nodes: [], edges: [], width: 0, height: 0 };

  const kept = edges.filter(e => index.has(e.from) && index.has(e.to) && e.from !== e.to);
  const out: number[][] = list.map(() => []);
  for (const e of kept) out[index.get(e.from)!].push(index.get(e.to)!);

  // Depth-first walk (iterative, in input order) marks the edges that close a cycle.
  const state = new Uint8Array(n); // 0 new, 1 on stack, 2 done
  const back = new Set<string>();
  for (let s = 0; s < n; s++) {
    if (state[s]) continue;
    const stack: [number, number][] = [[s, 0]];
    state[s] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [v, i] = top;
      if (i < out[v].length) {
        top[1]++;
        const w = out[v][i];
        if (state[w] === 1) back.add(v + '>' + w);
        else if (!state[w]) { state[w] = 1; stack.push([w, 0]); }
      } else { state[v] = 2; stack.pop(); }
    }
  }
  const preds: number[][] = list.map(() => []);
  const succs: number[][] = list.map(() => []);
  for (let v = 0; v < n; v++) for (const w of out[v]) {
    if (back.has(v + '>' + w)) continue;
    succs[v].push(w); preds[w].push(v);
  }

  // Longest path from a source, in topological order (Kahn, ties by input order).
  const layer = new Array<number>(n).fill(0);
  const indeg = preds.map(p => p.length);
  const queue: number[] = [];
  for (let v = 0; v < n; v++) if (!indeg[v]) queue.push(v);
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q];
    for (const w of succs[v]) {
      layer[w] = Math.max(layer[w], layer[v] + 1);
      if (--indeg[w] === 0) queue.push(w);
    }
  }
  const layerCount = Math.max(...layer) + 1;
  const layers: number[][] = Array.from({ length: layerCount }, () => []);
  for (let v = 0; v < n; v++) layers[layer[v]].push(v);

  // Barycentre ordering. Positions are centred (index minus half the layer), as the layers are drawn.
  const pos = new Float64Array(n);
  const place = (l: number[]) => l.forEach((v, i) => (pos[v] = i - (l.length - 1) / 2));
  layers.forEach(place);
  const sweep = (order: number[], neighbours: number[][]) => {
    for (const li of order) {
      const l = layers[li];
      const key = new Map<number, number>();
      for (const v of l) {
        const nb = neighbours[v];
        key.set(v, nb.length ? nb.reduce((a, u) => a + pos[u], 0) / nb.length : pos[v]);
      }
      l.sort((a, b) => key.get(a)! - key.get(b)! || pos[a] - pos[b] || a - b);
      place(l);
    }
  };
  const down = layers.map((_, i) => i).slice(1);
  const up = layers.map((_, i) => i).reverse().slice(1);
  sweep(down, preds); sweep(up, succs); sweep(down, preds);

  // Coordinates.
  const heights = list.map(v => nodeRows(v, base).h);
  const x = new Float64Array(n), y = new Float64Array(n);
  let width: number, height: number;
  if (dir === 'LR') {
    const extent = layers.map(l => l.reduce((a, v) => a + heights[v], 0) + gapY * (l.length - 1));
    const tallest = Math.max(...extent);
    layers.forEach((l, li) => {
      let cy = FLOW_PAD + (tallest - extent[li]) / 2;
      for (const v of l) { x[v] = FLOW_PAD + li * (nodeW + gapX); y[v] = cy; cy += heights[v] + gapY; }
    });
    width = FLOW_PAD * 2 + layerCount * nodeW + (layerCount - 1) * gapX;
    height = FLOW_PAD * 2 + tallest;
  } else {
    const extent = layers.map(l => l.length * nodeW + gapX * (l.length - 1));
    const widest = Math.max(...extent);
    let cy = FLOW_PAD;
    layers.forEach((l, li) => {
      const rowH = Math.max(...l.map(v => heights[v]));
      let cx = FLOW_PAD + (widest - extent[li]) / 2;
      for (const v of l) { x[v] = cx; y[v] = cy + (rowH - heights[v]) / 2; cx += nodeW + gapX; }
      cy += rowH + gapY;
    });
    width = FLOW_PAD * 2 + widest;
    height = cy - gapY + FLOW_PAD;
  }

  const placed: PlacedFlowNode[] = list.map((node, v) => ({ ...node, x: r(x[v]), y: r(y[v]), w: nodeW, h: heights[v], layer: layer[v] }));
  const placedEdges: PlacedFlowEdge[] = kept.map(e => {
    const a = placed[index.get(e.from)!], b = placed[index.get(e.to)!];
    let sx, sy, ex, ey, c1x, c1y, c2x, c2y;
    if (dir === 'LR') {
      sx = a.x + a.w; sy = a.y + a.h / 2; ex = b.x; ey = b.y + b.h / 2;
      const d = Math.max(Math.abs(ex - sx) / 2, 32);
      c1x = sx + d; c1y = sy; c2x = ex - d; c2y = ey;
    } else {
      sx = a.x + a.w / 2; sy = a.y + a.h; ex = b.x + b.w / 2; ey = b.y;
      const d = Math.max(Math.abs(ey - sy) / 2, 32);
      c1x = sx; c1y = sy + d; c2x = ex; c2y = ey - d;
    }
    // The curve's own midpoint (t = 0.5), not the chord's: a back edge bulges away from it.
    const labelX = r((sx + 3 * c1x + 3 * c2x + ex) / 8);
    const labelY = r((sy + 3 * c1y + 3 * c2y + ey) / 8);
    const path = `M${r(sx)},${r(sy)} C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(ex)},${r(ey)}`;
    return { ...e, path, labelX, labelY };
  });
  return { nodes: placed, edges: placedEdges, width: r(width), height: r(height) };
}

/**
 * Glyphs for the graph, drawn inside its own SVG (an <app-icon> cannot sit inside an <svg>, and
 * icon.ts keeps its paths private). Same 24-box, same stroke weight, copied from icon.ts by name,
 * so `icon` on a node takes the app-icon name. An unknown name falls back to the kind's glyph.
 */
export const FLOW_ICONS: Record<string, string> = {
  play: 'M6 3l14 9-14 9V3Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM16 2v4M8 2v4M3 10h18',
  database: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3ZM3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6',
  image: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM21 15l-5-5L5 21',
  layers: 'M12 2 2 7l10 5 10-5-10-5Z M2 17l10 5 10-5 M2 12l10 5 10-5',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3Z',
  code: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  sparkle: 'M12 3l1.9 5.8L20 10.7l-5.1 2 -1.9 5.8-1.9-5.8L6 10.7l5.1-1.9L12 3Z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 7l-10 6L2 7',
  table: 'M3 3h18v18H3V3Z M3 9h18 M3 15h18 M9 3v18',
  chart: 'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  check: 'M20 6 9 17l-5-5',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5M12 7v5l3 2',
  server: 'M20 2H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM20 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2ZM6 6h.01M6 18h.01',
  cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z',
  plug: 'M12 22v-5M9 7V2M15 7V2M6 7h12v4a6 6 0 0 1-12 0V7Z',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01',
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
};

/** Each kind's glyph and accent (a pill tone, so the tile reads its colours from the --pill-* tokens). */
export const FLOW_KINDS: Record<FlowNodeKind, { icon: string; accent: FlowTone }> = {
  trigger: { icon: 'zap', accent: 'brand' },
  read: { icon: 'database', accent: 'info' },
  process: { icon: 'settings', accent: 'neutral' },
  ai: { icon: 'sparkle', accent: 'brand' },
  output: { icon: 'upload', accent: 'ok' },
  review: { icon: 'user', accent: 'warn' },
  legacy: { icon: 'history', accent: 'neutral' },
  other: { icon: 'dots', accent: 'neutral' },
};

/** A glyph's subpaths, split the way icon.ts splits them so each closes cleanly. */
export function flowIconPaths(name: string | null | undefined, kind: FlowNodeKind): string[] {
  const path = (name && FLOW_ICONS[name]) || FLOW_ICONS[(FLOW_KINDS[kind] ?? FLOW_KINDS.other).icon];
  return path.split(/(?<=[Zz])\s+(?=[Mm])/).map(p => p.trim()).filter(Boolean);
}
