import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { ScheduleItems } from './schedule-items';
import { AcrossPage, AcrossRow, Comparison } from './schedule-items.model';

/**
 * MIG-421, a schedule's Items tab (the design's screen 3): an item's key from "All runs of this item" lists every run that
 * processed it, newest first, with the risk column picked; ticking two runs compares them step by step.
 */
const row = (run: number, risk: string, over: Partial<AcrossRow> = {}): AcrossRow => ({
  jobQueueId: run, ref: '1', key: 'voice-intake/call-a.m4a', label: 'call-a.m4a', startedAt: '2026-10-21T14:00:00Z', triggerLabel: 'by schedule',
  pipelineVersion: 3, status: 'done', fields: { 'status.risk': risk }, report: { label: 'RPT-0018', version: 1, fileRef: 77 }, ...over,
});

const PAGE = (over: Partial<AcrossPage> = {}): AcrossPage => ({
  jobId: 1037, jobName: 'Voice call insight (inbox)', total: 2, page: 0, size: 25,
  keys: [{ key: 'voice-intake/call-a.m4a', label: 'call-a.m4a', runs: 2 }], distinctKeys: 1, fields: ['key', 'status.risk', 'summary'], masked: [],
  items: [row(1857, 'Moderate'), row(1850, 'High', { triggerLabel: 'Run now · retried (attempt 2)', pipelineVersion: 2 })], ...over,
});

function mount(key = 'voice-intake/call-a.m4a') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ScheduleItems], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: () => {} } }] });
  const fixture = TestBed.createComponent(ScheduleItems);
  fixture.componentRef.setInput('jobId', '1037');
  fixture.componentRef.setInput('key', key);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.match(r => r.url.endsWith('/listSourceJob')).forEach(r => r.flush({ status: API_SUCCESS, data: [{ jobId: 1037, jobName: 'Voice call insight (inbox)' }] }));
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('Schedule items tab', () => {
  it('lists every run of the item, newest first, and picks the risk column the items keep', () => {
    const { http, el, fixture } = mount();
    const first = http.expectOne(r => r.url.endsWith('/sourceJob.json/itemRuns'));
    expect(first.request.body).toEqual({ jobId: 1037, page: 0, size: 25, key: 'voice-intake/call-a.m4a' });
    first.flush({ status: API_SUCCESS, data: PAGE() });
    // The design's Risk column: asked again with the field.
    const second = http.expectOne(r => r.url.endsWith('/sourceJob.json/itemRuns'));
    expect(second.request.body.fields).toEqual(['status.risk']);
    second.flush({ status: API_SUCCESS, data: PAGE() });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="across-title"]')?.textContent?.trim()).toBe('call-a.m4a');
    expect(el.textContent).toContain('processed 2 times · latest result first');
    expect([...el.querySelectorAll('tr[data-run]')].map(r => r.getAttribute('data-run'))).toEqual(['1857', '1850']);
    expect(el.querySelector('tr[data-run="1850"]')?.textContent).toContain('Run now · retried (attempt 2)');
    expect(el.querySelector('tr[data-run="1850"]')?.textContent).toContain('High');
    expect(el.querySelector('tr[data-run="1857"]')?.textContent).toContain('RPT-0018');
    expect(el.querySelector('[data-test="across-key"]')?.textContent).toContain('call-a.m4a');
  });

  it('compares the two runs ticked: each changed field, before and after, and the pipeline change', () => {
    const { http, el, fixture } = mount();
    http.match(r => r.url.endsWith('/sourceJob.json/itemRuns')).forEach(r => r.flush({ status: API_SUCCESS, data: PAGE({ fields: [] }) }));
    fixture.detectChanges();
    const boxes = [...el.querySelectorAll('[data-test="across-compare"]')] as HTMLInputElement[];
    boxes[0].click();
    boxes[1].click();
    fixture.detectChanges();
    const ask = http.expectOne(r => r.url.endsWith('/itemRuns/compare'));
    expect(ask.request.params.get('a')).toBe('1857');
    expect(ask.request.params.get('b')).toBe('1850');
    expect(ask.request.params.get('key')).toBe('voice-intake/call-a.m4a');
    const c: Comparison = {
      jobId: 1037, key: 'voice-intake/call-a.m4a', label: 'call-a.m4a', a: { jobQueueId: 1857, pipelineVersion: 3 }, b: { jobQueueId: 1850, pipelineVersion: 2 },
      pipeline: { from: 2, to: 3, same: false, changes: ['insight changed its setting promptId'], note: 'Pipeline v2 to v3: insight changed its setting promptId.' },
      steps: [{ key: 'insight', name: 'Insight JSON', same: false, changes: [{ path: 'status.risk', kind: 'changed', before: '"High"', after: '"Moderate"' }] },
        { key: 'transcribe', name: 'Transcribe audio', same: true, changes: [] }],
      changed: 1, masked: ['patient.name'],
    };
    ask.flush({ status: API_SUCCESS, data: c });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="compare-title"]')?.textContent?.trim()).toBe('Compare #1857 with #1850');
    const step = el.querySelector('[data-compare-step="insight"]')!;
    expect(step.textContent).toContain('status.risk');
    expect(step.textContent).toContain('− "High"');
    expect(step.textContent).toContain('+ "Moderate"');
    expect(el.querySelector('[data-test="compare-pipeline"]')?.textContent).toContain('Pipeline v2 to v3');
    expect(el.querySelector('[data-test="compare-pipeline"]')?.textContent).toContain('Unchanged in both runs: Transcribe audio.');
    expect(el.querySelector('[data-test="compare-masked"]')?.textContent).toContain('patient.name');
  });

  it('searches a value across the runs when no item is named', () => {
    const { http, el, fixture } = mount('');
    http.match(r => r.url.endsWith('/sourceJob.json/itemRuns')).forEach(r => r.flush({ status: API_SUCCESS, data: PAGE({ total: 0, items: [], keys: [], distinctKeys: 0, fields: [] }) }));
    const input = el.querySelector('[data-test="across-search"]') as HTMLInputElement;
    input.value = 'risk = High';
    input.dispatchEvent(new Event('input'));
    fixture.componentInstance.searchNow();
    const ask = http.expectOne(r => r.url.endsWith('/sourceJob.json/itemRuns'));
    expect(ask.request.body.search).toBe('risk = High');
    expect(ask.request.body.key).toBeUndefined();
  });
});
