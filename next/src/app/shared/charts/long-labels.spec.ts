import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { BarChart, Bar } from './bar-chart';
import { RankedBar } from './ranked-bar';
import { Donut } from './donut';
import { GroupedBar } from './grouped-bar';
import { LineChart } from './line-chart';
import { LABEL_MAX, shortLabel } from './short-label';
import { TITLE_MAX } from '../ui/long-text';

/**
 * A category that is a paragraph.
 *
 * Owner, 2026-09-28: a chart of a ledger's notes column wrote every category in full -- 3,000 to
 * 4,400px of text under each bar -- and the labels piled on top of each other. A label is a name
 * for a mark, so it is shortened to a few words by one helper; the whole value, capped like any
 * tooltip, is in the mark's hint.
 */

const NOTE = 'Remittance advice received from vendor; reconciled against purchase order. '.repeat(300).slice(0, 20_000);
const notes = (count: number): Bar[] =>
  Array.from({ length: count }, (_, at) => ({ name: `${at} ${NOTE}`, value: 10 + at }));

describe('shortLabel', () => {
  it('leaves a short name alone', () => {
    expect(shortLabel('North')).toBe('North');
  });

  it('cuts a long one to the label length, with an ellipsis', () => {
    const label = shortLabel(NOTE);
    expect(Array.from(label).length).toBeLessThanOrEqual(LABEL_MAX);
    expect(label.endsWith('…')).toBe(true);
    expect(NOTE.startsWith(label.slice(0, -1))).toBe(true);
  });

  it('reads a line break as a space, which is how the label is drawn anyway', () => {
    expect(shortLabel('two\nlines')).toBe('two lines');
  });

  it('takes a null as an empty label', () => {
    expect(shortLabel(null)).toBe('');
  });
});

@Component({ imports: [BarChart], template: `<app-bar-chart [data]="data()" [height]="120" />` })
class BarHost { readonly data = signal<Bar[]>([]); }

function barChart(data: Bar[], width = 0) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [BarHost] }).createComponent(BarHost);
  fixture.componentInstance.data.set(data);
  fixture.detectChanges();
  const chart = fixture.debugElement.children[0].componentInstance as BarChart;
  if (width) {
    (chart as any).measured.set(width);
    fixture.detectChanges();
  }
  return { chart, host: fixture.nativeElement as HTMLElement };
}

describe('bar chart over long categories', () => {
  it('writes each label short under its bar, and the whole value in its hint', () => {
    const { host } = barChart(notes(3));
    const labels = [...host.querySelectorAll('button span.whitespace-nowrap')].map(node => node.textContent!.trim());
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(Array.from(label).length).toBeLessThanOrEqual(LABEL_MAX);
    const hint = host.querySelector('button')!.getAttribute('title')!;
    expect(hint.startsWith('0 Remittance advice received from vendor')).toBe(true);
    expect(hint.length).toBeLessThan(TITLE_MAX + 40);
  });

  it('thins the axis by the SHORTENED label, not by the 20,000 characters behind it', () => {
    // Measured on the full value, one label needs 120,000px and only the two ends are ever drawn.
    const { chart } = barChart(notes(11), 1600);
    expect(chart.bars().filter(bar => bar.labelled).length).toBeGreaterThan(2);
  });

  it('keys a stack\'s colours with short names too', () => {
    const { host } = barChart([{ name: 'a', value: 3, segments: [
      { label: NOTE, value: 2, color: 'var(--chart-0)' }, { label: 'b', value: 1, color: 'var(--chart-1)' },
    ] }]);
    const legend = [...host.querySelectorAll('ul li')].map(node => node.textContent!.trim());
    expect(Array.from(legend[0]).length).toBeLessThanOrEqual(LABEL_MAX);
  });

  it('keeps a screen reader\'s summary to a sentence', () => {
    const { chart } = barChart(notes(3));
    expect((chart as any).summary().length).toBeLessThan(400);
  });
});

describe('ranked bars, ring and clusters over long categories', () => {
  it('ranked bar: a short name on the row, the capped value in its title', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(RankedBar);
    fixture.componentRef.setInput('data', [{ name: NOTE, value: 5 }, { name: 'b', value: 2 }]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const name = host.querySelector('li span.truncate')!.textContent!.trim();
    expect(Array.from(name).length).toBeLessThanOrEqual(LABEL_MAX);
    expect(host.querySelector('li button')!.getAttribute('title')!.length).toBeLessThan(TITLE_MAX + 40);
  });

  it('ring: a short legend, and a capped name on the slice', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Donut);
    fixture.componentRef.setInput('data', [{ name: NOTE, value: 5 }, { name: 'b', value: 2 }]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const legend = host.querySelector('li span.truncate')!.textContent!.trim();
    expect(Array.from(legend).length).toBeLessThanOrEqual(LABEL_MAX);
    expect(host.querySelector('li')!.getAttribute('title')!.length).toBeLessThan(TITLE_MAX + 40);
    expect(host.querySelector('circle title')!.textContent!.length).toBeLessThan(TITLE_MAX + 40);
    expect(host.querySelector('svg')!.getAttribute('aria-label')!.length).toBeLessThan(2 * (TITLE_MAX + 40));
  });

  it('clusters: short group and series names', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(GroupedBar);
    fixture.componentRef.setInput('groupNames', [NOTE]);
    fixture.componentRef.setInput('series', [{ name: NOTE, values: [3] }, { name: 'b', values: [1] }]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const group = host.querySelector('span.truncate')!;
    expect(Array.from(group.textContent!.trim()).length).toBeLessThanOrEqual(LABEL_MAX);
    expect(group.getAttribute('title')!.length).toBeLessThan(TITLE_MAX + 40);
    const series = host.querySelector('.flex-wrap > span')!.textContent!.trim();
    expect(Array.from(series).length).toBeLessThanOrEqual(LABEL_MAX);
  });

  it('line: short axis labels', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(LineChart);
    fixture.componentRef.setInput('data', [{ label: NOTE, value: 1 }, { label: 'b', value: 2 }]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const label = host.querySelector('div span.truncate')!.textContent!.trim();
    expect(Array.from(label).length).toBeLessThanOrEqual(LABEL_MAX);
    expect(host.querySelector('circle title')!.textContent!.length).toBeLessThan(TITLE_MAX + 40);
  });
});
