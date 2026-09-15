import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ScatterPlot, ScatterPoint } from './scatter-plot';

/**
 * The axis labels, which the component computed and then did not draw.
 *
 * bounds() produces four things: the two raw bounds the geometry divides by, and the two
 * FORMATTED strings meant for the axis. The template printed the raw pair, so a money column read
 * out of a CSV -- which DuckDB types as DOUBLE -- put "103909527.57999787" across the plot area in
 * 10px type, eighteen characters over the dots, while highYLabel sat beside it holding "104M" and
 * was rendered nowhere. The dots' own tooltips went through the formatter all along, so the axis
 * and the hover text disagreed by the whole magnitude of the answer.
 *
 * @author Nabeel Ahmed
 */
describe('scatter plot axis labels', () => {

  function plot(inputs: Record<string, unknown>): ComponentFixture<ScatterPlot> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ScatterPlot);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  /** The three axis labels, which are the only <text> children the svg has. */
  function axisText(fixture: ComponentFixture<ScatterPlot>): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('svg > text'))
      .map(node => (node.textContent ?? '').trim());
  }

  /** The hover text on each dot, which was always formatted. */
  function dotText(fixture: ComponentFixture<ScatterPlot>): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('circle title'))
      .map(node => (node.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  /** Money as a CSV reader typed it: the trailing digits are the DOUBLE, not the data. */
  const money: ScatterPoint[] = [
    { label: 'east', x: 1267.19353428047, y: 103909527.57999787 },
    { label: 'west', x: 12.5, y: 5 },
  ];

  it('prints the compacted bounds, not the raw floats the geometry divides by', () => {
    // Low x, high x, high y -- in the order the svg lays them out.
    expect(axisText(plot({ data: money }))).toEqual(['0', '1.3K', '104M']);
  });

  it('leaves no seventeen-digit float anywhere on the drawing', () => {
    const rendered = (plot({ data: money }).nativeElement as HTMLElement).textContent ?? '';
    expect(rendered).not.toContain('103909527.57999787');
    expect(rendered).not.toContain('1267.19353428047');
  });

  it('says on the axis what the dot beside it says, using the caller\'s own formatter', () => {
    // The disagreement is the defect: a reader measuring a dot against the axis was reading a
    // different number from the one the dot's own tooltip gave them.
    const fixture = plot({ data: money, format: (value: number) => `£${value.toFixed(2)}` });

    expect(axisText(fixture)).toEqual(['0', '£1267.19', '£103909527.58']);
    expect(dotText(fixture)).toContain('east: £1267.19, £103909527.58');
  });

  it('labels the vertical axis with the y bound and the horizontal one with x', () => {
    // Two labels of the same shape, one line apart: binding both to highXLabel would pass every
    // test above and put the x bound up the side of the chart.
    const fixture = plot({
      data: [{ label: 'a', x: 500, y: 2_500_000 }, { label: 'b', x: 1, y: 1 }],
    });

    const [, highX, highY] = axisText(fixture);
    expect(highX).toBe('500');
    expect(highY).toBe('2.5M');
  });
});
