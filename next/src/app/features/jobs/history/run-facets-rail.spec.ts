import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RunFacetsRail } from './run-facets-rail';
import { ExplorerFilter, NO_FILTER, RunFacets } from './run-explorer';

/** UX review 2026-10-12 (B3): the facets rail -- the server's counts beside each choice; a pick says the new filter. */
const FACETS: RunFacets = {
  total: 42,
  statuses: [{ key: 'Completed', count: 30 }, { key: 'Failed', count: 9 }, { key: 'Interrupt', count: 3 }],
  pipelines: Array.from({ length: 10 }, (_, i) => ({ taskDetailId: 1900 + i, taskName: `Pipeline ${i}`, count: 10 - i })),
  triggers: [{ key: 'schedule', label: 'Schedule', count: 35 }, { key: 'manual', label: 'Run now', count: 7 }],
  histogram: { bucket: 'hour', buckets: [] },
};

function rail(filter: ExplorerFilter = NO_FILTER, facets: RunFacets | null = FACETS) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(RunFacetsRail);
  fixture.componentRef.setInput('filter', filter);
  fixture.componentRef.setInput('facets', facets);
  fixture.detectChanges();
  const emitted: ExplorerFilter[] = [];
  fixture.componentInstance.filterChange.subscribe(f => emitted.push(f));
  return { fixture, el: fixture.nativeElement as HTMLElement, emitted };
}

describe('Runs facets rail', () => {
  it('lists each status with its count, in people\'s words', () => {
    const { el } = rail();
    const row = el.querySelector('[data-facet-status="Interrupt"]')!;
    expect(row.textContent).toContain('Interrupted');
    expect(row.querySelector('.facet-count')!.textContent!.trim()).toBe('3');
  });

  it('says the filter with a status ticked, and keeps the other facets', () => {
    const { el, emitted } = rail({ ...NO_FILTER, pipelines: [1901] });
    el.querySelector<HTMLInputElement>('[data-facet-status="Failed"] input')!.dispatchEvent(new Event('change'));
    expect(emitted.pop()).toEqual({ ...NO_FILTER, pipelines: [1901], statuses: ['Failed'] });
  });

  it('shows the busiest eight pipelines, then all on request; a picked one beyond them stays', () => {
    const { el, fixture } = rail({ ...NO_FILTER, pipelines: [1909] });
    const shown = () => Array.from(el.querySelectorAll('[data-facet-pipeline]')).map(r => r.getAttribute('data-facet-pipeline'));
    expect(shown()).toHaveLength(9);
    expect(shown()).toContain('1909');
    const more = Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Show all 10'))!;
    more.click();
    fixture.detectChanges();
    expect(shown()).toHaveLength(10);
  });

  it('keeps a picked value the server no longer counts, at 0, so it can be taken back', () => {
    const { el } = rail({ ...NO_FILTER, triggers: ['file'] });
    expect(el.querySelector('[data-facet-trigger="file"] .facet-count')!.textContent!.trim()).toBe('0');
  });

  it('changes the window, and clears one facet', () => {
    const { el, emitted } = rail({ ...NO_FILTER, statuses: ['Failed'] });
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    radios[2].dispatchEvent(new Event('change'));
    expect(emitted.pop()!.window).toBe('7d');
    Array.from(el.querySelectorAll('button')).find(b => b.textContent!.trim() === 'Clear')!.click();
    expect(emitted.pop()!.statuses).toEqual([]);
  });

  it('says when the counts could not be read', () => {
    const { el, fixture } = rail(NO_FILTER, null);
    fixture.componentRef.setInput('unavailable', true);
    fixture.detectChanges();
    expect(el.textContent).toContain('The counts could not be read');
  });
});
