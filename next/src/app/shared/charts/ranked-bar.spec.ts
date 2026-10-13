import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RankedBar } from './ranked-bar';

/**
 * The formatter, which used to reach one row in eight.
 *
 * formatValue was applied only to the rolled-up "Other" row, so a caller that passed a formatter
 * and no per-item `display` got raw numbers on every real row while the roll-up underneath read
 * properly. An analytics tile was showing "1267.19353428047" beside its bar. An input called
 * formatValue that formats one row is worse than no input, because the call site looks right.
 *
 * @author Nabeel Ahmed
 */
describe('ranked bar value labels', () => {

  function bar(inputs: Record<string, unknown>): RankedBar {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RankedBar);
    fixture.componentRef.setInput('data', inputs['data']);
    for (const [name, value] of Object.entries(inputs)) {
      if (name !== 'data') fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const money = (value: number) => `£${value.toFixed(2)}`;

  it('formats every row, not just the rolled-up one', () => {
    const chart = bar({
      data: [
        { name: 'a', value: 1267.19353428047 },
        { name: 'b', value: 389.9309467152962 },
      ],
      formatValue: money,
      max: 10,
    });

    expect(chart.rows().map(row => row.display)).toEqual(['£1267.19', '£389.93']);
  });

  it('still formats the roll-up', () => {
    const chart = bar({
      data: [
        { name: 'a', value: 100 }, { name: 'b', value: 50 },
        { name: 'c', value: 25 }, { name: 'd', value: 5 },
      ],
      formatValue: money,
      max: 2,
    });

    const rows = chart.rows();
    expect(rows[rows.length - 1].name).toBe('Other (2)');
    expect(rows[rows.length - 1].display).toBe('£30.00');
  });

  it('lets an explicit display win, which is what keeps file sizes readable elsewhere', () => {
    // The object browser sets display per item AND passes a formatter for the roll-up. Formatting
    // over the top of its own label would undo that.
    const chart = bar({
      data: [{ name: 'a', value: 2048, display: '2 KB' }],
      formatValue: money,
      max: 10,
    });

    expect(chart.rows()[0].display).toBe('2 KB');
  });

  it('leaves rows alone when no formatter is given', () => {
    const chart = bar({ data: [{ name: 'a', value: 42 }], max: 10 });
    expect(chart.rows()[0].display).toBeUndefined();
  });
});

/**
 * A bar that narrows the board looks like it can be clicked: a pointer over it, and none over a
 * bar that cannot (an inert roll-up, or a chart nobody may click). A <button> keeps the arrow by
 * default, so the clickable bars read as decoration.
 */
describe('ranked bar cursor', () => {
  function rendered(clickable: boolean): HTMLButtonElement[] {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RankedBar);
    fixture.componentRef.setInput('data', [{ name: 'a', value: 3 }, { name: 'b', value: 2, inert: true }]);
    fixture.componentRef.setInput('clickable', clickable);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
  }

  it('shows a pointer only over a bar a click narrows', () => {
    const [live, inert] = rendered(true);
    expect(live.classList).toContain('cursor-pointer');
    expect(inert.classList).not.toContain('cursor-pointer');
    expect(rendered(false).some(button => button.classList.contains('cursor-pointer'))).toBe(false);
  });
});
