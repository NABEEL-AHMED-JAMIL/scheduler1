import { describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BillingApi, UsageQuery } from './billing.service';
import { PipelineCosts, meterSummary, shareOf } from './pipeline-costs';

/** UX review B9 (BL1): what each pipeline and run cost in Cost & usage, adding up to the month (Riverside, 2026-10). */
const COSTS = {
  from: '2026-10-01', to: '2026-10-31', zone: 'America/Chicago', currency: 'USD', total: 75.4916, attributed: 22.6418, notTiedToRun: 52.8498,
  namesResolved: true,
  pipelines: [
    { taskDetailId: 1932, pipeline: 'Patient 360', runs: 10, cost: 9.8153, lastRunAt: '2026-10-12T11:09:18Z' },
    { taskDetailId: 1933, pipeline: 'X-ray triage', runs: 102, cost: 5.73825, lastRunAt: '2026-10-07T14:49:59Z' },
  ],
  runs: { total: 200, page: 1, limit: 25, rows: [
    { jobQueueId: 8214, jobId: 2907, schedule: 'Patient 360 (daily)', taskDetailId: 1932, pipeline: 'Patient 360', status: 'Completed',
      startedAt: '2026-10-12T11:08:00Z', cost: 0.84475, meters: [
        { meter: 'ai.tokens.in', label: 'Model tokens in', quantity: 1000, unit: 'token', cost: 0.6 },
        { meter: 'pipeline.runs', label: 'Pipeline runs', quantity: 1, unit: 'run', cost: 0.002 }] },
  ] },
};

@Component({
  imports: [PipelineCosts],
  template: `<app-pipeline-costs [query]="q()" [runId]="run()" />`,
})
class Host {
  readonly q = signal<UsageQuery>({ from: '2026-10-01', to: '2026-10-31', tenantId: null });
  readonly run = signal<number | null>(null);
}

function mount(run: number | null = null) {
  const api = {
    pipelineCosts: vi.fn(() => of({ status: 'SUCCESS', message: '', data: COSTS })),
    runCost: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...COSTS.runs.rows[0], from: '2026-10-01', to: '2026-10-31', currency: 'USD' } })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: BillingApi, useValue: api }] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.run.set(run);
  fixture.detectChanges();
  return { fixture, api, el: fixture.nativeElement as HTMLElement };
}

describe('Cost & usage: cost by pipeline and run', () => {
  it('lists the pipelines by cost and the runs, and says the share-out adds up to the month', async () => {
    const { fixture, el, api } = mount();
    await fixture.whenStable();
    expect(api.pipelineCosts).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31', tenantId: null }, 1, 25);
    expect(el.querySelector('[data-test="costs-reconcile"]')?.textContent).toContain('$22.64 of $75.49 came from pipeline runs; $52.85 is not tied to a run');
    const pipelines = [...el.querySelectorAll('[data-test="cost-by-pipeline"] tbody tr')].map(r => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(pipelines[0]).toContain('Patient 360');
    expect(pipelines[0]).toContain('$9.82');
    expect(pipelines[0]).toContain('13%');
    const run = el.querySelector('[data-test="cost-by-run"] tbody tr')!;
    expect(run.querySelector('a')?.getAttribute('href')).toBe('/pipelines/schedules/2907/runs/8214/logs');
    expect(run.textContent).toContain('$0.84');
    expect(el.querySelector('[data-test="more-run-costs"]')).not.toBeNull();
  });

  it('shows a run opened from its run page on its own first', async () => {
    const { fixture, el, api } = mount(8214);
    await fixture.whenStable();
    expect(api.runCost).toHaveBeenCalledWith(8214, null);
    expect(el.querySelector('[data-test="run-cost"]')?.textContent).toContain('Run #8214');
    expect(el.querySelector('[data-test="run-cost"]')?.textContent).toContain('$0.84');
  });

  it('words a run\'s meters, the costliest first, and a share of the total', () => {
    expect(meterSummary(COSTS.runs.rows[0] as any)).toBe('Model tokens in $0.60 · Pipeline runs $0.0020');
    expect(shareOf(9.8153, 75.4916)).toBe(13);
    expect(shareOf(1, 0)).toBe(0);
  });
});
