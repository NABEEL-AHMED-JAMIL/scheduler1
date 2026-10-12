import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { FlowGraph } from './flow-graph';
import { FlowEdge, FlowNode } from './flow-graph.model';

@Component({
  imports: [FlowGraph],
  template: `
    <app-flow-graph [nodes]="nodes()" [edges]="edges()" [selected]="selected()" [minimap]="minimap()"
                    ariaLabel="Pipeline" height="480px" (select)="picked.push($event)">
      <p empty>Nothing to draw yet</p>
    </app-flow-graph>
  `,
})
class Host {
  readonly nodes = signal<FlowNode[]>([]);
  readonly edges = signal<FlowEdge[]>([]);
  readonly selected = signal<string | null>(null);
  readonly minimap = signal(true);
  readonly picked: (string | null)[] = [];
}

const steps = (n: number): FlowNode[] => Array.from({ length: n }, (_, i) => ({
  id: 's' + i, label: 'Step ' + i, sub: 'task_' + i, kind: i === 0 ? 'trigger' : 'process',
  badges: i === 1 ? ['needs promptId'] : [], metrics: i === 2 ? [{ label: 'time', value: '1.2 s' }] : [], share: i === 2 ? 0.5 : null,
}));
const line = (n: number): FlowEdge[] => Array.from({ length: n - 1 }, (_, i) => ({ from: 's' + i, to: 's' + (i + 1), label: i ? null : 'rows' }));

function render(n: number, edges = line(n)) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.nodes.set(n ? steps(n) : []);
  fixture.componentInstance.edges.set(n ? edges : []);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const world = () => el.querySelector('.fg-world')!.getAttribute('transform');
  const click = (sel: string) => { (el.querySelector(sel) as HTMLElement).click(); fixture.detectChanges(); };
  return { fixture, el, host: fixture.componentInstance, world, click };
}

describe('<app-flow-graph>', () => {
  it('draws one group per node and one path per edge, with labels and arrowheads', () => {
    const { el } = render(5);
    expect(el.querySelectorAll('g[data-node]')).toHaveLength(5);
    expect(el.querySelectorAll('path.fg-edge, path[class^="fg-edge"]')).toHaveLength(4);
    expect(el.querySelectorAll('marker')).toHaveLength(6);
    expect(el.querySelectorAll('.fg-elabel')).toHaveLength(1);
    const first = el.querySelector('g[data-node]')!;
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('role')).toBe('button');
    expect(el.querySelector('g[data-id="s1"]')!.getAttribute('aria-label')).toBe('Step 1, task_1, needs promptId');
    expect(el.querySelector('svg.fg-canvas')!.getAttribute('aria-label')).toBe('Pipeline');
    expect((el.querySelector('app-flow-graph') as HTMLElement).style.height).toBe('480px');
  });

  it('emits the node id on click and on Enter, and null on the background and Escape', () => {
    const { el, host, fixture } = render(3);
    (el.querySelector('g[data-id="s1"]') as unknown as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.querySelector('g[data-id="s2"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    el.querySelector('svg.fg-canvas')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.querySelector('g[data-id="s0"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.picked).toEqual(['s1', 's2', null, null]);

    host.selected.set('s2');
    fixture.detectChanges();
    expect(el.querySelector('g[data-id="s2"]')!.getAttribute('class')).toContain('sel');
    expect(el.querySelector('g[data-id="s1"]')!.getAttribute('class')).not.toContain('sel');
  });

  it('zooms in, out, back to 100% and refits from the toolbar and the keyboard', () => {
    const { el, fixture, world, click } = render(3);
    const start = world();
    click('[data-act="in"]');
    const zoomedIn = world();
    expect(zoomedIn).not.toBe(start);
    expect(zoomedIn).toMatch(/scale\(1\.2\)/);
    click('[data-act="out"]');
    click('[data-act="out"]');
    expect(world()).toMatch(/scale\(0\.83/);
    click('[data-act="reset"]');
    expect(world()).toMatch(/scale\(1\)/);
    click('[data-act="in"]');
    click('[data-act="fit"]');
    expect(world()).toBe(start);

    const key = (k: string) => { el.querySelector('svg.fg-canvas')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); fixture.detectChanges(); };
    key('+');
    expect(world()).toMatch(/scale\(1\.2\)/);
    key('-');
    key('-');
    expect(world()).toMatch(/scale\(0\.83/);
    key('0');
    expect(world()).toBe(start);
    for (const b of Array.from(el.querySelectorAll('.fg-toolbar button'))) {
      expect(b.getAttribute('aria-label')).toBeTruthy();
      expect(b.getAttribute('title')).toBeTruthy();
    }
  });

  it('never zooms past 300% or below 20%', () => {
    const { world, click } = render(2);
    for (let i = 0; i < 20; i++) click('[data-act="in"]');
    expect(world()).toMatch(/scale\(3\)/);
    for (let i = 0; i < 30; i++) click('[data-act="out"]');
    expect(world()).toMatch(/scale\(0\.2\)/);
  });

  it('shows the empty slot when there are no nodes', () => {
    const { el, host, fixture } = render(0);
    expect(el.textContent).toContain('Nothing to draw yet');
    expect(el.querySelector('svg.fg-canvas')).toBeNull();
    host.nodes.set(steps(2));
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Nothing to draw yet');
    expect(el.querySelectorAll('g[data-node]')).toHaveLength(2);
  });

  it('hides the minimap for three nodes or fewer, or when turned off', () => {
    expect(render(3).el.querySelector('.fg-minimap')).toBeNull();
    const big = render(6);
    expect(big.el.querySelector('.fg-minimap')).not.toBeNull();
    expect(big.el.querySelectorAll('.fg-minimap rect').length).toBeGreaterThanOrEqual(6);
    big.host.minimap.set(false);
    big.fixture.detectChanges();
    expect(big.el.querySelector('.fg-minimap')).toBeNull();
  });

  it('keeps the user zoom when the same graph re-renders, and refits when the node set changes', () => {
    const { host, fixture, world, click } = render(3);
    const fitted = world();
    click('[data-act="in"]');
    const mine = world();
    host.nodes.set(steps(3).map(n => ({ ...n, tone: 'ok' as const })));
    fixture.detectChanges();
    expect(world()).toBe(mine);
    host.nodes.set(steps(4));
    fixture.detectChanges();
    expect(world()).toBe(fitted);
  });

  it('draws badges, metrics and the share bar', () => {
    const { el } = render(3);
    expect(el.querySelector('g[data-id="s1"] .fg-badge')!.textContent).toBe('needs promptId');
    expect(el.querySelector('g[data-id="s2"] .fg-mvalue')!.textContent).toBe('1.2 s');
    const bar = el.querySelector('g[data-id="s2"] .fg-bar')!;
    const track = el.querySelector('g[data-id="s2"] .fg-track')!;
    expect(Number(bar.getAttribute('width'))).toBe(Number(track.getAttribute('width')) / 2);
  });
});
