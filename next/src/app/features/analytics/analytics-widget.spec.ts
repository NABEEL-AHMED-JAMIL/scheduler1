import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { AnalyticsWidget, WidgetState } from './analytics-widget';

/** One chrome for every analytics tile: each state reads the same wherever the tile sits. */
@Component({ imports: [AnalyticsWidget], template: `<app-analytics-widget title="Rows by region" subtitle="Which values" [state]="state()" error="The engine refused." (refresh)="refreshed = refreshed + 1"><p>THE CHART</p><div foot>THE FOOT</div></app-analytics-widget>` })
class Host { state = signal<WidgetState>('ready'); refreshed = 0; }

function mount(state: WidgetState) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.state.set(state);
  fixture.detectChanges();
  return { fixture, text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ') };
}

describe('AnalyticsWidget', () => {
  it('shows the chart only when ready, and names every other state', () => {
    expect(mount('ready').text()).toContain('THE CHART');
    expect(mount('running').text()).not.toContain('THE CHART');
    expect(mount('running').fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(mount('queued').text()).toContain('Waiting to run');
    expect(mount('failed').text()).toContain('The engine refused.');
    expect(mount('failed').text()).toContain('Try again');
    expect(mount('empty').text()).toContain('No rows in this result');
    expect(mount('stopped').text()).toContain('Stopped before it ran');
    expect(mount('idle').text()).toContain('Not run yet');
  });

  it('keeps the title, the line under it and the foot in every state', () => {
    for (const state of ['ready', 'running', 'failed'] as WidgetState[]) {
      const screen = mount(state).text();
      expect(screen).toContain('Rows by region');
      expect(screen).toContain('Which values');
      expect(screen).toContain('THE FOOT');
    }
  });

  it('refresh asks the host to run again, from the header and from a failure', () => {
    const { fixture } = mount('failed');
    (fixture.nativeElement as HTMLElement).querySelectorAll('button').forEach(b => b.click());
    expect(fixture.componentInstance.refreshed).toBe(2);
  });
});

/** MIG-416 (CLS 0.27 at 1024): a waiting or running tile holds the height its drawing will take, when the board knows it. */
@Component({ imports: [AnalyticsWidget], template: `<app-analytics-widget title="Rows" [state]="state()" [reserve]="reserve()"><p>THE CHART</p></app-analytics-widget>` })
class Reserving { state = signal<WidgetState>('running'); reserve = signal<number | null>(260); }

describe('AnalyticsWidget holding its drawing\'s height (MIG-416)', () => {
  it('gives the skeleton the reserved height while queued and running, and nothing when none is known', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Reserving] });
    const fixture = TestBed.createComponent(Reserving);
    fixture.detectChanges();
    const busy = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[aria-busy="true"]');
    expect(busy()!.style.minHeight).toBe('260px');
    fixture.componentInstance.state.set('queued');
    fixture.detectChanges();
    expect(busy()!.style.minHeight).toBe('260px');
    fixture.componentInstance.reserve.set(null);
    fixture.detectChanges();
    expect(busy()!.style.minHeight).toBe('');
  });
});

/** ZT §3.11 (CLS 0.12-0.62 at 1024): a figure tile's skeleton holds the figure card's own size, unseen. */
@Component({ imports: [AnalyticsWidget], template: `<app-analytics-widget title="Rows" [state]="state()" [reserveKpi]="size()"><p>THE FIGURE</p></app-analytics-widget>` })
class FigureReserving { state = signal<WidgetState>('queued'); size = signal<'lg' | 'md' | null>('lg'); }

describe('AnalyticsWidget holding a figure\'s size (ZT §3.11)', () => {
  it('holds an unseen figure card of the size asked while queued and running, and none for other tiles', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [FigureReserving] });
    const fixture = TestBed.createComponent(FigureReserving);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const card = () => el.querySelector<HTMLElement>('[aria-busy="true"] app-kpi-card.kpi-reserve');
    expect(card()?.getAttribute('aria-hidden')).toBe('true');
    expect(card()?.querySelector('.kpi-figure')?.classList.contains('is-lg')).toBe(true);
    expect(el.querySelector('[aria-busy="true"]')!.classList.contains('py-3')).toBe(false);
    fixture.componentInstance.state.set('running');
    fixture.componentInstance.size.set('md');
    fixture.detectChanges();
    expect(card()?.querySelector('.kpi-figure')?.classList.contains('is-lg')).toBe(false);
    fixture.componentInstance.size.set(null);
    fixture.detectChanges();
    expect(card()).toBeNull();
    expect(el.querySelector('[aria-busy="true"]')!.classList.contains('py-3')).toBe(true);
    fixture.componentInstance.state.set('ready');
    fixture.detectChanges();
    expect(el.textContent).toContain('THE FIGURE');
  });
});
