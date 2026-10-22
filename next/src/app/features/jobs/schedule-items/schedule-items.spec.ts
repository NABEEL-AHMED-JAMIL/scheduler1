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
      changed: 1, masked: ['patient.name'], keyNote: 'The same file from another folder: a/call-a.m4a in #1850, b/call-a.m4a in #1857.',
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
    expect(el.querySelector('[data-test="compare-key"]')?.textContent).toContain('another folder');
  });

  /**
   * ZT-I23 (live: #1860 with #1857, "3 steps · 14 fields changed"): each change once, under the step that made it, the
   * JSON column's name beside it; a case-only change stays listed, marked and lighter; a step that only carried the
   * changes on says so in a line; the title counts the unique changes.
   */
  it('says each change once under the step that made it, marks a case-only one and counts only those', () => {
    const { http, el, fixture } = mount();
    http.match(r => r.url.endsWith('/sourceJob.json/itemRuns')).forEach(r => r.flush({ status: API_SUCCESS, data: PAGE({ fields: [] }) }));
    fixture.detectChanges();
    const boxes = [...el.querySelectorAll('[data-test="across-compare"]')] as HTMLInputElement[];
    boxes[0].click();
    boxes[1].click();
    fixture.detectChanges();
    const c: Comparison = {
      jobId: 1037, key: 'voice-intake/call-a.m4a', label: 'call-a.m4a', a: { jobQueueId: 1857, pipelineVersion: 3 }, b: { jobQueueId: 1850, pipelineVersion: 3 },
      pipeline: { from: 3, to: 3, same: true, changes: [], note: 'Both runs ran pipeline version 3: any change is the data\'s, not the pipeline\'s.' },
      steps: [
        { key: 'insight', name: 'Call insight', same: false, carried: 0, changes: [
          { path: 'followUp', kind: 'changed', before: '"Call on Monday."', after: '"Call on Tuesday."', alsoAt: ['insight_json.followUp'] },
          { path: 'person.program', kind: 'changed', before: '"Synthetic test patient"', after: '"synthetic test patient"', caseOnly: true,
            alsoAt: ['insight_json.person.program'] }] },
        { key: 'fields', name: 'Report fields', same: false, carried: 2, changes: [
          { path: 'patient.program', kind: 'changed', before: '"Synthetic test patient"', after: '"synthetic test patient"', caseOnly: true }] },
        { key: 'save', name: 'Insight file per recording', same: false, carried: 3, changes: [] }],
      changed: 3, masked: [],
    };
    http.expectOne(r => r.url.endsWith('/itemRuns/compare')).flush({ status: API_SUCCESS, data: c });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="compare"]')?.textContent).toContain('2 steps · 3 fields changed');
    expect(el.querySelectorAll('[data-change]').length).toBe(3);
    expect(el.querySelectorAll('[data-change="followUp"]').length).toBe(1);
    expect(el.querySelector('[data-change="followUp"]')?.textContent).toContain('also insight_json.followUp');
    expect(el.querySelector('[data-change="followUp"]')?.classList.contains('is-case-only')).toBe(false);
    const caseOnly = el.querySelector('[data-change="person.program"]')!;
    expect(caseOnly.classList.contains('is-case-only')).toBe(true);
    expect(caseOnly.querySelector('[data-test="case-only"]')?.textContent?.trim()).toBe('case only');
    expect(el.querySelector('[data-compare-step="save"]')).toBeNull();
    expect(el.querySelector('[data-test="compare-carried"]')?.textContent).toContain('Insight file per recording: carries the 3 changes above on, nothing new.');
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

  it('compares the same file from two folders by its name (ZT-I22)', () => {
    const { http, el, fixture } = mount('');
    const two = PAGE({ distinctKeys: 2, fields: [], keys: [{ key: 'voice-intake/mig421-1100/call-a.m4a', label: 'call-a.m4a', runs: 1 },
      { key: 'voice-intake/mig420-0231/call-a.m4a', label: 'call-a.m4a', runs: 1 }],
      items: [row(1860, 'Moderate', { key: 'voice-intake/mig421-1100/call-a.m4a' }), row(1857, 'High', { key: 'voice-intake/mig420-0231/call-a.m4a' })] });
    http.match(r => r.url.endsWith('/sourceJob.json/itemRuns')).forEach(r => r.flush({ status: API_SUCCESS, data: two }));
    fixture.detectChanges();
    expect(el.querySelector('[data-test="across-title"]')?.textContent?.trim()).toBe('call-a.m4a');
    const boxes = [...el.querySelectorAll('[data-test="across-compare"]')] as HTMLInputElement[];
    boxes[0].click();
    boxes[1].click();
    fixture.detectChanges();
    const ask = http.expectOne(r => r.url.endsWith('/itemRuns/compare'));
    expect(ask.request.params.get('key')).toBe('voice-intake/mig421-1100/call-a.m4a');
    expect(ask.request.params.get('bKey')).toBe('voice-intake/mig420-0231/call-a.m4a');
  });
});
