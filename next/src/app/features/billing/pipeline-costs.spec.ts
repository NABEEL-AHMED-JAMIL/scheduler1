import { describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { BillingApi, RunFilter, UsageQuery } from './billing.service';
import { PIPELINES_SHOWN, PipelineCosts, meterChips, meterSummary, mostly, reconcile, shareOf } from './pipeline-costs';

/** UX review B9 (BL1), redesigned 2026-10-19: what each pipeline and run cost in Cost & usage, adding up to the month (Riverside, 2026-10). */
const pipeline = (id: number, name: string, runs: number, cost: number, meters = [{ meter: 'ai.tokens.out', label: 'Model tokens out', cost }]) =>
  ({ taskDetailId: id, pipeline: name, runs, cost, lastRunAt: '2026-10-20T00:26:00Z', meters });
const COSTS = {
  from: '2026-10-01', to: '2026-10-31', zone: 'America/Chicago', currency: 'USD', total: 205.80331, attributed: 52.91449, notTiedToRun: 152.88882,
  namesResolved: true,
  pipelines: [
    pipeline(1932, 'Patient 360', 18, 15.87, [{ meter: 'ai.tokens.out', label: 'Model tokens out', cost: 8 }, { meter: 'ai.tokens.in', label: 'Model tokens in', cost: 7.8 },
      { meter: 'pipeline.runs', label: 'Pipeline runs', cost: 0.07 }]),
    pipeline(1933, 'X-ray triage', 102, 5.73825, [{ meter: 'convert.documents', label: 'Documents converted', cost: 5.73825 }]),
    ...Array.from({ length: 8 }, (_, i) => pipeline(2000 + i, `PDF bench ${i}`, 2, 0.002, [{ meter: 'pipeline.runs', label: 'Pipeline runs', cost: 0.002 }])),
  ],
  runs: { total: 300, page: 1, limit: 25, cost: 52.91449, statuses: [{ status: 'Completed', runs: 290 }, { status: 'Failed', runs: 10 }], rows: [
    { jobQueueId: 8390, jobId: 2907, schedule: 'Patient 360 (daily)', taskDetailId: 1932, pipeline: 'Patient 360', status: 'Completed',
      startedAt: '2026-10-20T00:26:00Z', cost: 0.82, meters: [
        { meter: 'ai.tokens.out', label: 'Model tokens out', quantity: 2000, unit: 'token', cost: 0.40 },
        { meter: 'ai.tokens.in', label: 'Model tokens in', quantity: 8000, unit: 'token', cost: 0.40 },
        { meter: 'convert.documents', label: 'Documents converted', quantity: 1, unit: 'document', cost: 0.0195 },
        { meter: 'storage.ops.read', label: 'Storage reads', quantity: 10, unit: 'op', cost: 0.0004 },
        { meter: 'pipeline.runs', label: 'Pipeline runs', quantity: 1, unit: 'run', cost: 0.0001 }] },
    { jobQueueId: 8389, jobId: 2911, schedule: 'Call API check task', taskDetailId: 1940, pipeline: 'Call API check task', status: 'Completed',
      startedAt: '2026-10-20T00:16:00Z', cost: 0.002, meters: [{ meter: 'pipeline.runs', label: 'Pipeline runs', quantity: 1, unit: 'run', cost: 0.002 }] },
  ], days: [{ day: '2026-10-19', runs: 9, cost: 1.84 }] },
};

@Component({
  imports: [PipelineCosts],
  template: `<app-pipeline-costs [query]="q()" [runId]="run()" />`,
})
class Host {
  readonly q = signal<UsageQuery>({ from: '2026-10-01', to: '2026-10-31', tenantId: null });
  readonly run = signal<number | null>(null);
}

function mount(run: number | null = null, answer: () => Observable<unknown> = () => of({ status: 'SUCCESS', message: '', data: COSTS })) {
  try { localStorage.clear(); } catch { /* none */ }
  const api = {
    pipelineCosts: vi.fn((_q: UsageQuery, _page: number, _limit: number, _filter?: RunFilter) => answer()),
    runCost: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...COSTS.runs.rows[0], from: '2026-10-01', to: '2026-10-31', currency: 'USD' } })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: BillingApi, useValue: api }] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.run.set(run);
  fixture.detectChanges();
  const costs = fixture.debugElement.query(By.directive(PipelineCosts)).componentInstance as PipelineCosts;
  return { fixture, api, costs, el: fixture.nativeElement as HTMLElement };
}

/** An element's text as it reads, a space between elements (textContent runs "2026" and "9 runs" together). */
const text = (e: Element | null) => {
  if (!e) return '';
  const parts: string[] = [];
  const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) parts.push(n.textContent ?? '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

describe('Cost & usage: cost by pipeline and run', () => {
  it('splits the month into a bar whose figures add up to its total as shown', async () => {
    const { fixture, el, api } = mount();
    await fixture.whenStable();
    expect(api.pipelineCosts).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31', tenantId: null }, 1, 25, { taskDetailId: null, q: '', status: null }, null);
    expect(text(el.querySelector('[data-test="recon-run"]'))).toBe('From pipeline runs $52.91 · 26%');
    expect(text(el.querySelector('[data-test="recon-other"]'))).toBe('Not tied to a run $152.89 · 74% (storage kept, analytics, the console\'s reads, API calls)');
    expect(text(el.querySelector('[data-test="recon-total"]'))).toBe('Month\'s total $205.80');
    // Cents that add up as shown, whichever way the fifth places round.
    const r = reconcile(10.005, 3.335);
    expect(Math.round((r.run + r.other) * 100)).toBe(Math.round(r.total * 100));
    expect(reconcile(100, 0.2).runShare).toBe('<1%');
    expect(reconcile(100, 0.2).otherShare).toBe('>99%');
    expect(reconcile(0, 0)).toMatchObject({ run: 0, other: 0, runWidth: 0 });
  });

  it('lists the dearest eight pipelines full width with their average, share and what the money went on, then all of them', async () => {
    const { fixture, el } = mount();
    await fixture.whenStable();
    let rows = [...el.querySelectorAll('[data-test="pipeline-row"]')];
    expect(rows).toHaveLength(PIPELINES_SHOWN);
    expect(text(rows[0])).toContain('Patient 360');
    expect(text(rows[0])).toContain('last run 19 Oct, 19:26');
    expect(text(rows[0])).toContain('$15.87');
    expect(text(rows[0].querySelector('[data-test="per-run"]'))).toBe('$0.88');
    expect(text(rows[0])).toContain('8%');
    expect(text(rows[0].querySelector('[data-test="mostly"]'))).toBe('mostly model tokens');
    // A pipeline total under a cent stays exact; its average reads "<$0.01".
    expect(text(rows[2])).toContain('$0.0020');
    expect(text(rows[2].querySelector('[data-test="per-run"]'))).toBe('<$0.01');
    expect(text(rows[2])).toContain('<1%');
    const all = el.querySelector('[data-test="all-pipelines"]') as HTMLButtonElement;
    expect(text(all)).toBe('Show all 10 pipelines');
    all.click();
    fixture.detectChanges();
    rows = [...el.querySelectorAll('[data-test="pipeline-row"]')];
    expect(rows).toHaveLength(10);
  });

  it('narrows By run to a pipeline picked above, with a chip that takes it off, on the server', async () => {
    const { fixture, el, api } = mount();
    await fixture.whenStable();
    (el.querySelectorAll('[data-test="pipeline-runs"]')[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.pipelineCosts).toHaveBeenLastCalledWith(expect.anything(), 1, 25, { taskDetailId: 1932, q: '', status: null }, null);
    expect(text(el.querySelector('[data-test="pipeline-chip"]'))).toContain('Patient 360 · $15.87');
    expect(el.querySelectorAll('[data-test="pipeline-row"]')[0].classList.contains('is-picked')).toBe(true);
    (el.querySelector('[data-test="pipeline-chip-clear"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.pipelineCosts).toHaveBeenLastCalledWith(expect.anything(), 1, 25, { taskDetailId: null, q: '', status: null }, null);
    expect(el.querySelector('[data-test="pipeline-chip"]')).toBeNull();
    // A click on the row does the same; the pipeline's own link does not.
    (el.querySelectorAll('[data-test="pipeline-row"]')[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(api.pipelineCosts).toHaveBeenLastCalledWith(expect.anything(), 1, 25, { taskDetailId: 1933, q: '', status: null }, null);
  });

  it('filters By run by status and by a search, the search once typing stops', async () => {
    const { fixture, el, api } = mount();
    await fixture.whenStable();
    vi.useFakeTimers();
    try {
      const select = el.querySelector('[data-test="run-status"]') as HTMLSelectElement;
      expect([...select.options].map(o => o.textContent!.trim())).toEqual(['All statuses', 'Completed (290)', 'Failed (10)']);
      select.value = 'Failed';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(api.pipelineCosts).toHaveBeenLastCalledWith(expect.anything(), 1, 25, { taskDetailId: null, q: '', status: 'Failed' }, null);
      const calls = api.pipelineCosts.mock.calls.length;
      const search = el.querySelector('[data-test="run-search"]') as HTMLInputElement;
      search.value = '#8390';
      search.dispatchEvent(new Event('input'));
      expect(api.pipelineCosts.mock.calls.length).toBe(calls);
      vi.advanceTimersByTime(400);
      expect(api.pipelineCosts).toHaveBeenLastCalledWith(expect.anything(), 1, 25, { taskDetailId: null, q: '#8390', status: 'Failed' }, null);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows each run\'s cost as at most three chips that never cut a word, sub-cent amounts as <$0.01', async () => {
    const { fixture, el } = mount();
    await fixture.whenStable();
    const rows = [...el.querySelectorAll('[data-test="cost-by-run"] tbody tr:not(.day-group)')];
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/pipelines/schedules/2907/runs/8390');
    const chips = [...rows[0].querySelectorAll('[data-test="run-meters"] .meter-chip')].map(c => text(c));
    // Model tokens in and out are one chip; the four chips that leaves are three and "+1".
    expect(chips).toEqual(['Model tokens $0.80', 'Documents converted $0.02', 'Storage reads <$0.01', '+1']);
    expect(rows[0].querySelector('[data-test="more-meters"]')?.getAttribute('title')).toBe('Pipeline runs $0.00010');
    expect(text(rows[0].querySelectorAll('td')[5])).toBe('$0.82');
    expect(text(rows[1].querySelectorAll('td')[5])).toBe('<$0.01');
    expect(rows[1].querySelectorAll('td')[5].getAttribute('title')).toBe('$0.00200');
    // The day header keeps its exact total, over the whole day (Billing's, every page).
    expect(text(el.querySelector('[data-test="run-day-group"]'))).toBe('Mon 19 Oct 2026 9 runs · $1.84');
    expect([...el.querySelectorAll('[data-test="run-started"]')].map(t => text(t))).toEqual(['19:26', '19:16']);
    expect(el.querySelector('[data-test="more-run-costs"]')).not.toBeNull();
  });

  it('shows a run opened from its run page on its own first', async () => {
    const { fixture, el, api } = mount(8390);
    await fixture.whenStable();
    expect(api.runCost).toHaveBeenCalledWith(8390, null);
    expect(text(el.querySelector('[data-test="run-cost"]'))).toContain('Run #8390');
    expect(text(el.querySelector('[data-test="run-cost"]'))).toContain('$0.82');
  });

  it('words a run\'s meters and a pipeline\'s, the costliest first, and a share of the total', () => {
    expect(meterSummary(COSTS.runs.rows[0] as never)).toBe('Model tokens $0.80 · Documents converted $0.02 · Storage reads <$0.01 · 1 more');
    expect(meterChips([]).length).toBe(0);
    expect(mostly(COSTS.pipelines[1] as never)).toBe('mostly documents converted');
    expect(mostly({ ...COSTS.pipelines[1], meters: [{ meter: 'api.calls', label: 'API calls', cost: 1 }] } as never)).toBe('mostly API calls');
    expect(mostly({ ...COSTS.pipelines[1], meters: [] } as never)).toBe('');
    expect(shareOf(9.8153, 75.4916)).toBe(13);
    expect(shareOf(1, 0)).toBe(0);
  });
});

describe('Cost by pipeline -- sorting (owner 2026-10-27)', () => {
  it('keeps the dearest-first order until a heading is picked, then sorts by runs both ways, before the cut to eight', async () => {
    const { fixture, costs } = mount();
    await fixture.whenStable();
    expect(costs.shownPipelines()[0].pipeline).toBe('Patient 360');
    costs.sort.toggle('runs');
    expect(costs.shownPipelines().map(p => p.runs).slice(0, 2)).toEqual([102, 18]);
    costs.sort.toggle('runs');
    expect(costs.shownPipelines()[0].runs).toBe(2);
    expect(costs.shownPipelines()).toHaveLength(PIPELINES_SHOWN);
  });

  it('sorts the pipeline names A to Z', async () => {
    const { fixture, costs } = mount();
    await fixture.whenStable();
    costs.sort.toggle('pipeline');
    expect(costs.sortedPipelines().map(p => p.pipeline).slice(0, 2)).toEqual(['Patient 360', 'PDF bench 0']);
  });
});

describe('By run -- sorts on the server (owner 2026-10-27)', () => {
  const order = (api: { pipelineCosts: { mock: { calls: unknown[][] } } }, n: number) => api.pipelineCosts.mock.calls[n];

  it('sends no sort before a heading is picked, then the column and its direction from the first page, the filters kept', async () => {
    const { fixture, api, costs, el } = mount();
    await fixture.whenStable();
    expect(order(api, 0)[4]).toBeNull();
    expect(el.querySelectorAll('[data-test="cost-by-run"] th button.th-sort').length).toBe(5);
    costs.setStatus('Failed');
    costs.runSort.toggle('cost');
    fixture.detectChanges();
    const sorted = order(api, api.pipelineCosts.mock.calls.length - 1);
    expect(sorted[1]).toBe(1);
    expect(sorted[3]).toEqual({ taskDetailId: null, q: '', status: 'Failed' });
    expect(sorted[4]).toEqual({ sort: 'cost', dir: 'desc' });
    costs.runSort.toggle('cost');
    expect(order(api, api.pipelineCosts.mock.calls.length - 1)[4]).toEqual({ sort: 'cost', dir: 'asc' });
    costs.runSort.toggle('pipeline');
    expect(order(api, api.pipelineCosts.mock.calls.length - 1)[4]).toEqual({ sort: 'pipeline', dir: 'asc' });
    costs.loadMore();
    const more = order(api, api.pipelineCosts.mock.calls.length - 1);
    expect(more[1]).toBe(2);
    expect(more[4]).toEqual({ sort: 'pipeline', dir: 'asc' });
  });

  it('keeps the day headers in start order only; sorted by anything else the runs are one list', async () => {
    const { fixture, costs, el } = mount();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-test="run-day-group"]').length).toBeGreaterThan(0);
    costs.runSort.toggle('run');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelectorAll('[data-test="run-day-group"]').length).toBe(0);
    expect(el.querySelectorAll('[data-test="run-cost-row"]').length).toBe(2);
    costs.runSort.toggle('started');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelectorAll('[data-test="run-day-group"]').length).toBeGreaterThan(0);
  });
});

describe('Cost by pipeline -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading, not empty, until the month answers', async () => {
    const { fixture, costs, el } = mount(null, () => NEVER);
    await fixture.whenStable();
    expect(costs.loading()).toBe(true);
    expect(costs.state.pending()).toBe(true);
    expect(el.textContent).not.toContain('No pipeline run was billed');
  });

  it('is empty once an empty month answers', async () => {
    const empty = { ...COSTS, total: 0, attributed: 0, pipelines: [], runs: { total: 0, page: 1, limit: 25, rows: [], days: [] } };
    const { fixture, costs } = mount(null, () => of({ status: 'SUCCESS', message: '', data: empty }));
    await fixture.whenStable();
    expect(costs.loading()).toBe(false);
    expect(costs.state.pending()).toBe(false);
    expect(costs.pipelines()).toEqual([]);
  });

  it('says the costs could not be read, in plain words, when the read fails', async () => {
    const { fixture, costs } = mount(null, () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' })));
    await fixture.whenStable();
    expect(costs.loading()).toBe(false);
    expect(costs.error()).toBe('What the pipelines cost could not be read.');
  });

  it('says when more runs could not be read, instead of doing nothing', async () => {
    const { fixture, costs, api } = mount();
    await fixture.whenStable();
    api.pipelineCosts.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })) as never);
    costs.loadMore();
    expect(costs.loadingMore()).toBe(false);
    expect(costs.moreError()).toBe('More runs could not be read.');
  });
});
