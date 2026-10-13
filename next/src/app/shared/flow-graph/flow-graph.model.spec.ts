import { describe, it, expect } from 'vitest';
import { FLOW_NODE_BASE, FLOW_ROW, FlowEdge, FlowNode, fitText, flowIconPaths, layoutFlow, nodeRows } from './flow-graph.model';

const node = (id: string, extra: Partial<FlowNode> = {}): FlowNode => ({ id, label: id.toUpperCase(), kind: 'process', ...extra });
const chain = (...ids: string[]): FlowEdge[] => ids.slice(1).map((id, i) => ({ from: ids[i], to: id }));
const byId = (l: ReturnType<typeof layoutFlow>) => new Map(l.nodes.map(n => [n.id, n]));

describe('layoutFlow', () => {
  it('puts each step of a chain in its own layer, left to right', () => {
    const l = layoutFlow(['a', 'b', 'c', 'd'].map(id => node(id)), chain('a', 'b', 'c', 'd'));
    expect(l.nodes.map(n => n.layer)).toEqual([0, 1, 2, 3]);
    const xs = l.nodes.map(n => n.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(l.nodes.map(n => n.y)).size).toBe(1);
    expect(l.edges).toHaveLength(3);
  });

  it('layers a fan-out and fan-in by the longest path, and centres the narrow layers', () => {
    const nodes = ['src', 'x', 'y', 'z', 'sink'].map(id => node(id));
    const edges: FlowEdge[] = [
      { from: 'src', to: 'x' }, { from: 'src', to: 'y' }, { from: 'src', to: 'z' },
      { from: 'x', to: 'sink' }, { from: 'y', to: 'sink' }, { from: 'z', to: 'sink' },
      { from: 'src', to: 'sink' }, // a shortcut must not pull the sink forward
    ];
    const m = byId(layoutFlow(nodes, edges));
    expect(m.get('src')!.layer).toBe(0);
    expect(['x', 'y', 'z'].map(id => m.get(id)!.layer)).toEqual([1, 1, 1]);
    expect(m.get('sink')!.layer).toBe(2);
    const mid = (id: string) => m.get(id)!.y + m.get(id)!.h / 2;
    expect(mid('src')).toBeCloseTo(mid('sink'), 5);
    expect(m.get('x')!.y).toBeLessThan(m.get('y')!.y);
    expect(m.get('y')!.y).toBeLessThan(m.get('z')!.y);
    const fanned = byId(layoutFlow(nodes, edges.slice(0, 6)));
    const fmid = (id: string) => fanned.get(id)!.y + fanned.get(id)!.h / 2;
    expect(fmid('src')).toBeCloseTo(fmid('y'), 5);
    expect(fmid('sink')).toBeCloseTo(fmid('y'), 5);
  });

  it('runs an edge that skips layers through a lane of its own, round the nodes in its way, not through them', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(id => node(id));
    for (const direction of ['TB', 'LR'] as const) {
      const l = layoutFlow(nodes, [...chain('a', 'b', 'c', 'd'), { from: 'a', to: 'd', label: 'joined' }], { direction });
      const m = byId(l);
      const skip = l.edges.find(e => e.from === 'a' && e.to === 'd')!;
      const along = [...skip.path.matchAll(/L([\d.-]+),([\d.-]+)/g)].map(x => [Number(x[1]), Number(x[2])]);
      expect(along).toHaveLength(2);
      for (const [px, py] of along) {
        for (const id of ['b', 'c']) {
          const b = m.get(id)!;
          const inside = direction === 'TB' ? px > b.x && px < b.x + b.w : py > b.y && py < b.y + b.h;
          expect(inside, `${direction}: the a>d lane crosses ${id}`).toBe(false);
        }
      }
      const d = m.get('d')!;
      if (direction === 'TB') expect(skip.labelY).toBeGreaterThan(m.get('c')!.y + m.get('c')!.h);
      expect(skip.path.endsWith(direction === 'TB' ? `${d.x + d.w / 2},${d.y}` : `${d.x},${d.y + d.h / 2}`)).toBe(true);
    }
  });

  it('orders a layer by its predecessors to avoid crossings', () => {
    // a -> d and b -> c: without reordering, c (listed first) would sit opposite b's sibling.
    const nodes = ['a', 'b', 'c', 'd'].map(id => node(id));
    const m = byId(layoutFlow(nodes, [{ from: 'a', to: 'd' }, { from: 'b', to: 'c' }]));
    expect(m.get('d')!.y).toBeLessThan(m.get('c')!.y);
  });

  it('survives a cycle by ignoring the edge that closes it, but still draws it', () => {
    const nodes = ['a', 'b', 'c'].map(id => node(id));
    const l = layoutFlow(nodes, [...chain('a', 'b', 'c'), { from: 'c', to: 'a' }]);
    expect(l.nodes.map(n => n.layer)).toEqual([0, 1, 2]);
    expect(l.edges).toHaveLength(3);
    expect(l.edges.every(e => /^M[\d.,-]+ C/.test(e.path))).toBe(true);
  });

  it('handles a graph that is all cycle, and a self-loop', () => {
    const l = layoutFlow([node('a'), node('b')], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'a' }]);
    expect(l.nodes.map(n => n.layer)).toEqual([0, 1]);
    expect(l.edges).toHaveLength(2);
  });

  it('ignores edges whose endpoints are missing, and duplicate ids', () => {
    const l = layoutFlow([node('a'), node('b'), node('a', { label: 'dup' })],
      [{ from: 'a', to: 'b' }, { from: 'a', to: 'ghost' }, { from: 'nope', to: 'b' }]);
    expect(l.nodes.map(n => n.id)).toEqual(['a', 'b']);
    expect(l.nodes[0].label).toBe('A');
    expect(l.edges.map(e => `${e.from}>${e.to}`)).toEqual(['a>b']);
  });

  it('returns an empty layout for no nodes', () => {
    expect(layoutFlow([], [{ from: 'a', to: 'b' }])).toEqual({ nodes: [], edges: [], width: 0, height: 0 });
  });

  it('sizes nodes deterministically from their badges, metrics and share bar', () => {
    const plain = node('p');
    const rich = node('r', { badges: ['Failed'], metrics: [{ label: 'time', value: '1 s' }, { label: 'rows', value: '9' }, { label: 'x', value: 'y' }], share: 0.4 });
    expect(nodeRows(plain).h).toBe(FLOW_NODE_BASE);
    expect(nodeRows(rich).h).toBe(FLOW_NODE_BASE + FLOW_ROW.badges + 2 * FLOW_ROW.metric + 4 + FLOW_ROW.share);
    const once = layoutFlow([plain, rich], chain('p', 'r'));
    const again = layoutFlow([plain, rich], chain('p', 'r'));
    expect(once).toEqual(again);
    expect(once.nodes[1].h).toBe(nodeRows(rich).h);
    expect(once.height).toBeGreaterThanOrEqual(once.nodes[1].h);
  });

  it('runs edges right-to-left for LR and bottom-to-top for TB', () => {
    const nodes = [node('a'), node('b')];
    const lr = layoutFlow(nodes, chain('a', 'b'), { direction: 'LR', nodeWidth: 200, gapX: 50 });
    const [a, b] = lr.nodes;
    expect(b.x).toBe(a.x + 250);
    expect(a.y).toBe(b.y);
    expect(lr.edges[0].path.startsWith(`M${a.x + a.w},${a.y + a.h / 2}`)).toBe(true);
    expect(lr.edges[0].path.endsWith(`${b.x},${b.y + b.h / 2}`)).toBe(true);
    expect(lr.width).toBeGreaterThan(lr.height);

    const tb = layoutFlow(nodes, chain('a', 'b'), { direction: 'TB', gapY: 40 });
    const [ta, tbb] = tb.nodes;
    expect(ta.x).toBe(tbb.x);
    expect(tbb.y).toBe(ta.y + ta.h + 40);
    expect(tb.edges[0].path.startsWith(`M${ta.x + ta.w / 2},${ta.y + ta.h}`)).toBe(true);
    expect(tb.edges[0].labelY).toBeGreaterThan(ta.y + ta.h);
    expect(tb.edges[0].labelY).toBeLessThan(tbb.y);
    expect(tb.height).toBeGreaterThan(lr.height);
    expect(tb.width).toBeLessThan(lr.width);
  });

  it('lays out 200 nodes in a few milliseconds', () => {
    const nodes = Array.from({ length: 200 }, (_, i) => node('n' + i));
    const edges: FlowEdge[] = [];
    for (let i = 1; i < 200; i++) { edges.push({ from: 'n' + Math.floor((i - 1) / 3), to: 'n' + i }); if (i > 5) edges.push({ from: 'n' + (i - 5), to: 'n' + i }); }
    const t = performance.now();
    const l = layoutFlow(nodes, edges);
    expect(performance.now() - t).toBeLessThan(50);
    expect(l.nodes).toHaveLength(200);
    const boxes = new Set(l.nodes.map(n => `${n.x},${n.y}`));
    expect(boxes.size).toBe(200);
  });
});

describe('fitText and icons', () => {
  it('cuts long text with an ellipsis and leaves short text alone', () => {
    expect(fitText('short', 200, 13)).toBe('short');
    const cut = fitText('Validate every single lab result in the batch', 100, 13);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(Math.floor(100 / (13 * 0.56)));
    expect(fitText(null, 100, 13)).toBe('');
  });

  it('uses the named glyph, else the kind glyph', () => {
    expect(flowIconPaths('clock', 'process')[0]).toContain('M12 22a10');
    expect(flowIconPaths('no-such-icon', 'read').join(' ')).toBe(flowIconPaths(null, 'read').join(' '));
    expect(flowIconPaths(null, 'ai')).not.toEqual(flowIconPaths(null, 'read'));
  });
});
