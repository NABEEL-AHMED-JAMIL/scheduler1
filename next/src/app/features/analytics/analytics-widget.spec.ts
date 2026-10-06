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
    expect(mount('queued').text()).toContain('Waiting its turn');
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
