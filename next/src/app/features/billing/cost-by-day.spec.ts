import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CostByDay } from './cost-by-day';
import type { CostDay } from './cost-by-day-model';

const OCTOBER: CostDay[] = [
  { day: '2026-10-06', amount: 10.13, byService: { 'Model calls': 9.0, 'Analytics & tools': 1.13, API: 0.0001 } },
  { day: '2026-10-12', amount: 49.25, byService: { 'Model calls': 45.0, 'Analytics & tools': 4.25 } },
];

function mount(days: CostDay[] = OCTOBER) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(CostByDay);
  fixture.componentRef.setInput('month', '2026-10-01');
  fixture.componentRef.setInput('today', '2026-10-12');
  fixture.componentRef.setInput('days', days);
  fixture.componentRef.setInput('monthLabel', 'October 2026');
  fixture.componentRef.setInput('pace', 4);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Cost by day, the component', () => {
  it('lists each service in its fixed colour, the ones under a cent this month greyed', () => {
    const { el } = mount();
    const items = [...el.querySelectorAll('[data-test="cost-by-day-legend"] li')].filter(li => li.querySelector('.cbd-swatch:not(.is-forecast)'));
    expect(items.map(li => li.textContent!.trim())).toEqual(['Model calls', 'Analytics & tools', 'API']);
    expect(items.map(li => li.getAttribute('data-zero'))).toEqual([null, null, 'true']);
  });

  it('picks a clicked day, and unpicks it on a second click; a day to come is not a day to pick', () => {
    const { component } = mount();
    component.pick({ dataIndex: 11 });
    expect(component.selected()).toBe('2026-10-12');
    component.pick({ dataIndex: 11 });
    expect(component.selected()).toBeNull();
    component.pick({ dataIndex: 25 });
    expect(component.selected()).toBeNull();
  });

  it('says a month with nothing metered rather than drawing an empty axis', () => {
    const { el, component } = mount([{ day: '2026-10-03', amount: 0, byService: { Storage: 0 } }]);
    expect(component.empty()).toBe(true);
    expect(el.querySelector('[data-test="cost-by-day-empty"]')?.textContent).toContain('Nothing metered in October 2026');
    expect(el.querySelector('[data-test="cost-by-day-chart"]')).toBeNull();
  });

  it('switches between Daily and Cumulative, and says what each shows on one line', () => {
    const { component, fixture, el } = mount();
    component.setView('daily');
    fixture.detectChanges();
    expect(el.querySelector('[data-test="cost-by-day-subtitle"]')?.textContent).toContain('Each day by service');
    component.setView('cumulative');
    fixture.detectChanges();
    expect(el.querySelector('[data-test="cost-by-day-subtitle"]')?.textContent).toContain('running total');
    expect((component.option()['series'] as { name: string }[]).map(s => s.name)).toEqual(['This month', 'Forecast']);
    component.setView('daily');
  });
});
