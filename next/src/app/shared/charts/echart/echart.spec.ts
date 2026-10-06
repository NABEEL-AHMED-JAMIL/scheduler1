import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EChart, EChartClick, EChartThemeRef } from './echart';
import { ECHARTS_LOADER } from './echart-runtime';

/**
 * The wrapper's wiring, against a stand-in for ECharts that records what it is asked to do: the
 * click handler is bound once per instance and survives every setOption (a kind switch on a tile is
 * a setOption), nothing is called on a disposed instance, and a theme is set only when it changes
 * -- it used to be set on every option, redrawing the outgoing kind under the pointer first.
 */

type Handler = (params: unknown) => void;

class FakeChart {
  handlers = new Map<string, Handler[]>();
  calls: string[] = [];
  disposed = false;
  on(event: string, handler: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]); this.calls.push(`on:${event}`); }
  setOption() { this.assertAlive(); this.calls.push('setOption'); }
  setTheme(key: string) { this.assertAlive(); this.calls.push(`setTheme:${key}`); }
  dispatchAction(action: { type: string }) { this.assertAlive(); this.calls.push(`action:${action.type}`); }
  clear() { this.assertAlive(); this.calls.push('clear'); }
  resize() { this.assertAlive(); this.calls.push('resize'); }
  dispose() { this.assertAlive(); this.disposed = true; this.calls.push('dispose'); }
  isDisposed() { return this.disposed; }
  convertFromPixel(_finder: unknown, pixel: number[]) { return [pixel[0] / 100, 0]; }
  containPixel() { return true; }
  zrHandlers: Handler[] = [];
  getZr() { return { on: (_event: string, handler: Handler) => { this.zrHandlers.push(handler); } }; }
  fire(event: string, params: unknown) { for (const handler of this.handlers.get(event) ?? []) handler(params); }
  private assertAlive() { if (this.disposed) throw new Error('called on a disposed instance'); }
}

const made: FakeChart[] = [];
const registered: string[] = [];
const fakeLib = {
  echarts: {
    init: () => { const chart = new FakeChart(); made.push(chart); return chart; },
    registerTheme: (key: string) => { registered.push(key); },
  },
};

@Component({
  imports: [EChart],
  template: `@if (shown()) { <app-echart [option]="option()" [theme]="theme()" [renderer]="renderer()" (clicked)="clicks.push($event)" /> }`,
})
class Host {
  readonly shown = signal(true);
  readonly option = signal<Record<string, unknown> | null>({ series: [{ type: 'bar' }] });
  readonly theme = signal<EChartThemeRef | null>({ key: 'console-light', object: { color: ['#111'] } });
  readonly renderer = signal<'canvas' | 'svg'>('canvas');
  readonly clicks: EChartClick[] = [];
}

async function render() {
  made.length = 0;
  registered.length = 0;
  TestBed.configureTestingModule({ providers: [{ provide: ECHARTS_LOADER, useValue: () => Promise.resolve(fakeLib) }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise(resolve => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, host: fixture.componentInstance };
}

describe('app-echart', () => {
  let width: PropertyDescriptor | undefined;
  let height: PropertyDescriptor | undefined;
  const observer = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  beforeEach(() => {
    // Drawn at once rather than when scrolled to: another spec may have left an observer that never fires.
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    // jsdom does no layout; the wrapper waits for a drawing area with a size.
    width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 220 });
  });
  afterEach(() => {
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = observer;
    if (width) Object.defineProperty(HTMLElement.prototype, 'clientWidth', width);
    if (height) Object.defineProperty(HTMLElement.prototype, 'clientHeight', height);
  });

  it('hands a click on a mark out, from a handler bound once', async () => {
    const { host } = await render();
    expect(made.length).toBe(1);
    expect(made[0].calls.filter(call => call === 'on:click').length).toBe(1);
    made[0].fire('click', { seriesIndex: 0, dataIndex: 2 });
    expect(host.clicks).toEqual([{ seriesIndex: 0, dataIndex: 2 }]);
  });

  it('reads the point under the pointer for a click on a line or an area, which ECharts reports without one', async () => {
    const { host } = await render();
    made[0].fire('click', { componentType: 'series', seriesType: 'line', seriesIndex: 1, event: { offsetX: 240, offsetY: 30 } });
    made[0].fire('click', { componentType: 'series', seriesType: 'bar', seriesIndex: 0, dataIndex: 4 });
    expect(host.clicks.map(click => click.dataIndex)).toEqual([2, 4]);
  });

  it('reads a click on a line\'s path, which ECharts does not report, as the category under the pointer', async () => {
    const { fixture, host } = await render();
    host.option.set({ xAxis: { type: 'category' }, series: [{ type: 'line' }] });
    fixture.detectChanges();
    await fixture.whenStable();
    made[0].zrHandlers.forEach(handler => handler({ target: {}, event: 'native', offsetX: 310, offsetY: 40 }));
    expect(host.clicks).toEqual([{ componentType: 'series', seriesType: 'line', seriesIndex: 0, dataIndex: 3 }]);
    // On empty canvas, or a click ECharts already reported, nothing more.
    made[0].zrHandlers.forEach(handler => handler({ target: null, event: 'other', offsetX: 10, offsetY: 10 }));
    host.option.set({ series: [{ type: 'pie' }] });
    fixture.detectChanges();
    await fixture.whenStable();
    made[0].zrHandlers.forEach(handler => handler({ target: {}, event: 'x', offsetX: 10, offsetY: 10 }));
    expect(host.clicks.length).toBe(1);
  });

  it('keeps that one handler through a kind switch: a setOption, never a re-bind', async () => {
    const { fixture, host } = await render();
    for (const type of ['line', 'pie', 'treemap']) {
      host.option.set({ series: [{ type }] });
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(made.length).toBe(1);
    expect(made[0].calls.filter(call => call === 'setOption').length).toBe(4);
    expect(made[0].calls.filter(call => call === 'on:click').length).toBe(1);
    made[0].fire('click', { dataIndex: 0 });
    expect(host.clicks.length).toBe(1);
  });

  it('drops the old kind\'s tooltip and highlight before the new option lands', async () => {
    const { fixture, host } = await render();
    made[0].calls.length = 0;
    host.option.set({ series: [{ type: 'pie' }] });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(made[0].calls).toEqual(['action:hideTip', 'action:downplay', 'setOption']);
  });

  it('sets a theme only when it changes, not on every new option', async () => {
    const { fixture, host } = await render();
    host.option.set({ series: [{ type: 'line' }] });
    host.theme.set({ key: 'console-light', object: { color: ['#111'] } });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(made[0].calls.some(call => call.startsWith('setTheme'))).toBe(false);
    host.theme.set({ key: 'console-dark', object: { color: ['#eee'] } });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(made[0].calls.filter(call => call.startsWith('setTheme'))).toEqual(['setTheme:console-dark']);
  });

  it('a renderer change makes a new instance with its own one handler, and the old one is let go', async () => {
    const { fixture, host } = await render();
    host.renderer.set('svg');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(made.length).toBe(2);
    expect(made[0].disposed).toBe(true);
    expect(made[1].calls.filter(call => call === 'on:click').length).toBe(1);
    // A click reaching the old instance's handler after it went is not handed out.
    made[0].fire('click', { dataIndex: 9 });
    made[1].fire('click', { dataIndex: 1 });
    expect(host.clicks).toEqual([{ dataIndex: 1 }]);
  });

  it('disposes on destroy and calls nothing on the instance afterwards', async () => {
    const { fixture, host } = await render();
    host.shown.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(made[0].disposed).toBe(true);
    // The FakeChart throws if called once disposed; nothing did.
    expect(made[0].calls.at(-1)).toBe('dispose');
  });

  it('says on the tile when a chart throws, and the board carries on', async () => {
    const { fixture, host } = await render();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    made[0].setOption = () => { throw new Error('bad option'); };
    host.option.set({ series: [{ type: 'nope' }] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('This chart could not be drawn from this result.');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
