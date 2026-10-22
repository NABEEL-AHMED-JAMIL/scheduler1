import { describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { BillingApi, UsageQuery } from './billing.service';
import { ModelCalls, callerLabel, promptIdOf, rateSentences } from './model-calls';

/** Cost & usage redesign (2026-10-19): AI model calls -- the month by source and by model, and every call (Riverside, October). */
const SUMMARY = {
  from: '2026-10-01', to: '2026-10-31', zone: 'America/Chicago', currency: 'USD',
  totals: { calls: 2066, runs: 150, tokens_in: '480120', tokens_out: '160333', amount: '36.69', last: '2026-10-20T00:29:00Z' },
  bySource: [
    { subject_type: 'prompt', subject_id: '1075', label: 'Prompt 1075', model: 'qwen3:8b', models: 1, calls: 511, runs: 12, tokens_in: '120000', tokens_out: '40000', amount: '21.40', last: '2026-10-20T00:29:00Z' },
    { subject_type: 'tool_run', subject_id: null, label: 'Tool runs', model: 'qwen3:8b', models: 2, calls: 476, runs: 0, tokens_in: '200000', tokens_out: '60000', amount: '9.10', last: '2026-10-19T12:00:00Z' },
    { subject_type: 'ad-hoc', subject_id: null, label: 'Console calls', model: 'qwen3:8b', models: 1, calls: 4, runs: 0, tokens_in: '120', tokens_out: '33', amount: '0.004', last: '2026-10-02T12:00:00Z' },
  ],
  byModel: [
    { model: 'qwen3:8b', calls: 2000, runs: 150, tokens_in: '470000', tokens_out: '150000', amount: '35.0', last: '2026-10-20T00:29:00Z' },
    { model: 'llama3.2:3b', calls: 66, runs: 0, tokens_in: '10120', tokens_out: '10333', amount: '1.69', last: '2026-10-11T00:29:00Z' },
  ],
  rates: [
    { meter: 'ai.tokens.in', side: 'in', model: null, unit: 'token', per: 1000, unit_price: '0.05' },
    { meter: 'ai.tokens.out', side: 'out', model: null, unit: 'token', per: 1000, unit_price: '0.15' },
  ],
};
const CALL = {
  run: 'ai-run#4913', subject_type: 'prompt', subject_id: '1075', model: 'qwen3:8b', job_queue_id: 8390, job_id: 2907, pipeline: 'Patient 360',
  actor_user_id: null, source: 'runner', first: '2026-10-20T00:29:00Z', last: '2026-10-20T00:29:00Z', tokens_in: '288', tokens_out: '77', amount: '0.02595',
  lines: [{ meter: 'ai.tokens.in', label: 'Model tokens in', quantity: '288', unit: 'token', per: 1000, unit_price: '0.05', amount: '0.0144' },
    { meter: 'ai.tokens.out', label: 'Model tokens out', quantity: '77', unit: 'token', per: 1000, unit_price: '0.15', amount: '0.01155' }],
};
const call = (run: string, last: string, extra: object = {}) => ({ ...CALL, run, last, first: last, ...extra });

@Component({
  imports: [ModelCalls],
  template: `<app-model-calls [query]="q()" timeZone="America/Chicago" />`,
})
class Host {
  readonly q = signal<UsageQuery>({ from: '2026-10-01', to: '2026-10-31', tenantId: null });
}

function mount(rows: object[] = [call('ai-run#4913', '2026-10-20T00:29:00Z'), call('ai-run#4912', '2026-10-20T00:28:00Z'), call('ai-run#4900', '2026-10-19T15:00:00Z', { job_queue_id: 8381 })],
  days: object[] = [{ day: '2026-10-19', runs: 199, amount: '36.69' }], promptNames = new Map<number, string>()) {
  const api = {
    runSummary: vi.fn(() => of({ status: API_SUCCESS, message: '', data: SUMMARY })),
    promptNames: vi.fn(() => of(promptNames)),
    runs: vi.fn((_q: UsageQuery, page: number) => of({ status: API_SUCCESS, message: '', data: { total: 2066, page, limit: 25, rows: page === 1 ? rows : [call('ai-run#1', '2026-10-01T15:00:00Z')], days } })),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: BillingApi, useValue: api }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, api, el: fixture.nativeElement as HTMLElement };
}

/** An element's text as it reads, a space between elements (textContent runs "2026" and "9 runs" together). */
const text = (e: Element | null) => {
  if (!e) return '';
  const parts: string[] = [];
  const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) parts.push(n.textContent ?? '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

describe('Cost & usage: AI model calls', () => {
  it('ZT-B8: names a saved prompt by its name, reading the names once, and keeps the id when there is none', async () => {
    const { fixture, el, api } = mount(undefined, undefined, new Map([[1075, 'Visit note one-line summary']]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.promptNames).toHaveBeenCalledTimes(1);
    const link = el.querySelector('[data-test="model-source-prompt"]');
    expect(text(link)).toBe('Visit note one-line summary');
    expect(link?.getAttribute('href')).toBe('/pipelines/prompts/1075/edit');

    const unnamed = mount();
    await unnamed.fixture.whenStable();
    expect(text(unnamed.el.querySelector('[data-test="model-source-prompt"]'))).toBe('Prompt 1075');
  });


  it('opens on the month in four figures and By source, the dearest first, without reading every call', async () => {
    const { fixture, el, api } = mount();
    await fixture.whenStable();
    expect(api.runSummary).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31', tenantId: null });
    expect(api.runs).not.toHaveBeenCalled();
    const kpis = text(el.querySelector('[data-test="model-call-kpis"]'));
    expect(kpis).toContain('2,066');
    expect(kpis).toContain('480,120');
    expect(kpis).toContain('$36.69');
    expect(kpis).toContain('in 150 pipeline runs');
    expect(text(el.querySelector('[data-test="model-call-note"]'))).toContain('before the month\'s allowances and tiers');
    expect(text(el.querySelector('[data-test="run-rates"]'))).toBe('Rates: in $0.05 / out $0.15 per 1,000 tokens (qwen3:8b, llama3.2:3b)');

    const sources = [...el.querySelectorAll('[data-test="model-source"]')];
    expect(sources.map(r => text(r.querySelector('td')))).toEqual(['Prompt 1075 Saved prompt', 'Tool runs Every tool run, the AI Assistant\'s included',
      'Console calls Model calls made from the console']);
    expect(sources[0].querySelector('a')?.getAttribute('href')).toBe('/pipelines/prompts/1075/edit');
    expect(text(sources[0])).toContain('$21.40');
    expect(text(sources[0])).toContain('58%');
    // The last call in the workspace's zone, 24-hour.
    expect(text(sources[0])).toContain('19 Oct, 19:29');
    // Two models: the dearest named, the other counted.
    expect(text(sources[1].querySelectorAll('td')[1])).toBe('qwen3:8b +1');
    // A sub-cent source total stays exact; its share is "<1%", never "0%".
    expect(text(sources[2])).toContain('$0.0040');
    expect(text(sources[2])).toContain('<1%');
    // Three sources: no "Show all" until there are more than eight.
    expect(el.querySelector('[data-test="all-sources"]')).toBeNull();
    const models = [...el.querySelectorAll('[data-test="model-row"]')].map(r => text(r));
    expect(models[0]).toContain('qwen3:8b');
    expect(models[0]).toContain('620,000');
    expect(models[1]).toContain('$1.69');
  });

  it('reads Every call when it is first shown, by billing day, says what called each model and which run, and pages on', async () => {
    const { fixture, el, api } = mount();
    await fixture.whenStable();
    const every = [...el.querySelectorAll('[data-test="model-call-view"] button')].find(b => text(b) === 'Every call') as HTMLButtonElement;
    every.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.runs).toHaveBeenCalledTimes(1);
    // 00:29 UTC on the 20th is 19:29 on the 19th in Chicago: one day, every call of it counted (Billing's, every page).
    expect([...el.querySelectorAll('[data-test="day-group"]')].map(h => text(h))).toEqual(['Mon 19 Oct 2026 199 calls · $36.69']);
    const rows = [...el.querySelectorAll('[data-test="model-calls"] tbody tr:not(.day-group)')];
    expect(text(rows[0].querySelectorAll('td')[1])).toBe('Prompt 1075 ai-run#4913');
    expect(rows[0].querySelectorAll('td')[1].querySelector('a')?.getAttribute('href')).toBe('/pipelines/prompts/1075/edit');
    // The pipeline run, linked; the next call of the same run says so instead of the pipeline again.
    const run = rows[0].querySelector('[data-test="call-run"]')!;
    expect(run.querySelector('a')?.getAttribute('href')).toBe('/pipelines/schedules/2907/runs/8390');
    expect(text(run)).toBe('#8390 Patient 360');
    expect(text(rows[1].querySelector('[data-test="call-run"]'))).toBe('#8390 same run');
    expect(text(rows[2].querySelector('[data-test="call-run"]'))).toBe('#8381 Patient 360');
    expect([...el.querySelectorAll('[data-test="run-time"]')].map(t => text(t))).toEqual(['19:29', '19:28', '10:00']);
    expect(text(rows[0].querySelectorAll('td')[6])).toBe('$0.03');
    const more = el.querySelector('[data-test="more-calls"]') as HTMLButtonElement;
    expect(text(more)).toBe('Show more calls');
    more.click();
    fixture.detectChanges();
    expect((api.runs.mock.calls[1] as unknown[])[1]).toBe(2);
    // Back to By source: nothing is read again.
    ([...el.querySelectorAll('[data-test="model-call-view"] button')].find(b => text(b) === 'By source') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.runSummary).toHaveBeenCalledTimes(1);
  });

  it('starts again with the month: the summary read again, Every call only when shown', async () => {
    const { fixture, api } = mount();
    await fixture.whenStable();
    fixture.componentInstance.q.set({ from: '2026-09-01', to: '2026-09-30', tenantId: '2960' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.runSummary).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-30', tenantId: '2960' });
    expect(api.runs).not.toHaveBeenCalled();
  });

  it('says what called a model in words, and a saved prompt\'s id for its link', () => {
    expect(callerLabel({ subject_type: 'prompt', subject_id: '1075' })).toBe('Prompt 1075');
    expect(callerLabel({ subject_type: 'prompt', subject_id: 'prompt' })).toBe('Prompt with no saved id');
    expect(callerLabel({ subject_type: 'tool_run', subject_id: 'tools#1025' })).toBe('Tool run');
    expect(callerLabel({ subject_type: 'document', subject_id: 'document#4#extract' })).toBe('Document extraction');
    expect(callerLabel({ subject_type: 'ask', subject_id: 'ask#1' })).toBe('Question (Ask your data)');
    expect(callerLabel({ subject_type: 'ad-hoc', subject_id: 'qwen3:8b' })).toBe('Console call');
    expect(promptIdOf({ subject_type: 'prompt', subject_id: '1075' })).toBe(1075);
    expect(promptIdOf({ subject_type: 'prompt', subject_id: 'prompt' })).toBeNull();
    expect(promptIdOf({ subject_type: 'tool_run', subject_id: '12' })).toBeNull();
  });

  it('says a model priced on items of its own apart from the meter\'s rate and the models it priced', () => {
    const rates = [
      { meter: 'ai.tokens.in@qwen3:8b', side: 'in' as const, model: 'qwen3:8b', unit: 'token', per: 1000, unit_price: 0.4 },
      { meter: 'ai.tokens.out@qwen3:8b', side: 'out' as const, model: 'qwen3:8b', unit: 'token', per: 1000, unit_price: 1.2 },
      { meter: 'ai.tokens.in', side: 'in' as const, model: null, unit: 'token', per: 1000, unit_price: 0.05 },
      { meter: 'ai.tokens.out', side: 'out' as const, model: null, unit: 'token', per: 1000, unit_price: 0.15 },
    ];
    expect(rateSentences(rates, ['qwen3:8b', 'llama3.2:3b'])).toEqual([
      'in $0.40 / out $1.20 per 1,000 tokens (qwen3:8b)', 'in $0.05 / out $0.15 per 1,000 tokens (llama3.2:3b)']);
    expect(rateSentences([], [])).toEqual([]);
  });

  it('shows the dearest eight sources, then all of them', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...SUMMARY.bySource[0], subject_id: String(1080 + i), label: `Prompt ${1080 + i}`, amount: String(11 - i) }));
    const { fixture, el, api } = mount();
    api.runSummary.mockReturnValue(of({ status: API_SUCCESS, message: '', data: { ...SUMMARY, bySource: many } }));
    fixture.componentInstance.q.set({ from: '2026-09-01', to: '2026-09-30', tenantId: null });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelectorAll('[data-test="model-source"]')).toHaveLength(8);
    const all = el.querySelector('[data-test="all-sources"]') as HTMLButtonElement;
    expect(text(all)).toBe('Show all 11 sources');
    all.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-test="model-source"]')).toHaveLength(11);
  });
});
