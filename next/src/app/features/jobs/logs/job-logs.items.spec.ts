import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { JobLogs } from './job-logs';
import { JobEventsService } from '../../../core/socket/job-events.service';
import { API_SUCCESS } from '../../../core/api/api.config';
import { runTabFromUrl, runTabUrl } from '../run-steps/run-page.model';

/**
 * MIG-420: the run page has an Items tab only for a run of a pipeline that works item by item -- Core's first page of
 * the run's items says so (itemRun) -- and ?tab=items&status=failed opens it filtered to the failed ones.
 */
const LOGS = {
  auditLogs: [{ jobAuditLogId: 1, logsDetail: 'Job completed successfully', dateCreated: '2026-10-21 10:38:00' }],
  sourceJob: { jobId: 2808, jobName: 'Voice call insight', jobStatus: 'Active', taskDetail: { taskName: 'insight' } },
  sourceJobQueue: { jobQueueId: 8814, jobStatus: 'Completed', startTime: '2026-10-21 09:00:00', endTime: '2026-10-21 10:38:00' },
};
const ENGINE = { jobQueueId: 8814, jobId: 2808, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false, aiSteps: [],
  steps: [{ stepExecutionId: 1, index: 0, key: 'read', task: 'read_s3', status: 'Completed', durationMs: 5, recordsIn: 0, recordsOut: 50, tries: 1, datasets: [], log: 'step' }] };
const ITEMS = (itemRun: boolean) => ({ jobQueueId: 8814, itemRun, total: itemRun ? 50 : 0, page: 0, size: 50, fields: [], masked: [],
  summary: { items: itemRun ? 50 : 0, done: 48, failed: 2, running: 0, failedItems: 2, files: 146, runStatus: 'Completed', retryable: true },
  steps: [{ index: 0, key: 'read', name: 'Read S3', task: 'read_s3', role: 'source' }, { index: 1, key: 'ai', name: 'AI prompt', task: 'ai_prompt', role: 'each' }],
  items: itemRun ? [{ ref: '2', key: 'call-b.m4a', label: 'call-b.m4a', status: 'failed', cells: { ai: { status: 'failed', hasData: true } } }] : [] });

function at(query: Record<string, string>, itemRun: boolean | 'refused') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [JobLogs], providers: [provideRouter([]), provideLocationMocks(), provideHttpClient(), provideHttpClientTesting(),
    { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } },
    { provide: ActivatedRoute, useValue: { snapshot: { url: [{ path: '8814' }], firstChild: { url: [] }, queryParamMap: convertToParamMap(query) } } }] });
  const fixture = TestBed.createComponent(JobLogs);
  fixture.componentRef.setInput('jobId', '2808');
  fixture.componentRef.setInput('jobQueueId', '8814');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog')).flush({ status: API_SUCCESS, data: LOGS });
  http.match(r => r.url.endsWith('/aiPrompt.json/runsForJob')).forEach(r => r.flush({ status: API_SUCCESS, data: [] }));
  fixture.detectChanges();
  http.match(r => r.url.endsWith('/sourceJob.json/stepExecutions')).forEach(r => r.flush({ status: API_SUCCESS, data: ENGINE }));
  http.match(r => r.url.endsWith('/sourceJob.json/runOutputs')).forEach(r => r.flush({ status: API_SUCCESS, data: { outputs: [] } }));
  http.match(r => r.url.endsWith('/sourceJob.json/review')).forEach(r => r.flush({ status: API_SUCCESS, data: { reviewStatus: 'NOT_REQUIRED' } }));
  const asks = http.match(r => r.url.endsWith('/sourceJob.json/runItems'));
  if (itemRun === 'refused') asks.forEach(a => a.flush({ status: 'ERROR', message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' }));
  else asks.forEach(a => a.flush({ status: API_SUCCESS, data: ITEMS(itemRun) }));
  fixture.detectChanges();
  TestBed.tick();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const tabs = () => [...el.querySelectorAll('[data-test="run-tabs"] [role="tab"]')].map(t => t.getAttribute('data-tab'));
  return { fixture, el, http, asks, tabs, component: fixture.componentInstance, location: TestBed.inject(Location) };
}

describe('Run page: the Items tab', () => {
  it('asks once, with the first page of 50, and shows the tab with the count for a run that works item by item', () => {
    const { asks, tabs, el } = at({}, true);
    expect(asks).toHaveLength(1);
    expect(asks[0].request.body).toEqual({ jobQueueId: 8814, status: 'all', page: 0, size: 50 });
    expect(tabs()).toEqual(['steps', 'map', 'items', 'outputs', 'log']);
    expect(el.querySelector('[data-tab="items"]')?.textContent).toContain('Items (50)');
  });

  it('has no Items tab for a run that does not work item by item, nor when Core refuses the reader', () => {
    expect(at({}, false).tabs()).toEqual(['steps', 'map', 'outputs', 'log']);
    expect(at({}, 'refused').tabs()).toEqual(['steps', 'map', 'outputs', 'log']);
  });

  it('opens ?tab=items&status=failed on the Items tab, filtered to the failed ones', () => {
    const { asks, component, el } = at({ tab: 'items', status: 'failed' }, true);
    expect(asks[0].request.body).toEqual({ jobQueueId: 8814, status: 'failed', page: 0, size: 50 });
    expect(component.tab()).toBe('items');
    expect(el.querySelector('[data-tab="items"]')?.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('[data-test="run-items"] [data-filter="failed"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-test="run-items"] tr[data-ref="2"]')).not.toBeNull();
  });

  it('goes to the Steps when the address asks for Items on a run without them', () => {
    const { component, location } = at({ tab: 'items' }, false);
    expect(component.tab()).toBe('steps');
    expect(location.path()).toBe('/pipelines/schedules/2808/runs/8814');
  });

  it('keeps the filter in the address', () => {
    expect(runTabUrl(2808, 8814, 'items', 'failed').queryParams).toEqual({ tab: 'items', status: 'failed' });
    expect(runTabUrl(2808, 8814, 'items', 'all').queryParams).toEqual({ tab: 'items' });
    expect(runTabFromUrl(null, 'items')).toBe('items');
    const { component, location } = at({ tab: 'items' }, true);
    component.itemStatusChanged('failed');
    expect(location.path()).toBe('/pipelines/schedules/2808/runs/8814?tab=items&status=failed');
  });
});
