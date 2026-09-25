import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { JobLogs } from './job-logs';
import { JobEventsService } from '../../../core/socket/job-events.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * MIG-212: the run's log lines name the files it read and wrote, and each opens its folder; an AI
 * step's answer reads as the formatted text the model wrote, not its raw markdown; the timing
 * toggle sits with the entries it describes.
 */
const LOGS = {
  auditLogs: [
    { jobAuditLogId: 1, logsDetail: 'Scanning etl-bucket/sales/in :: found 2 CSV object(s)', dateCreated: '2026-09-20 18:15:34' },
    { jobAuditLogId: 2, logsDetail: 'sales/in/orders_2026-09-a.csv -> e2e/json/orders_2026-09-a.json :: 60 row(s)', dateCreated: '2026-09-20 18:15:34' },
    { jobAuditLogId: 3, logsDetail: 'Job completed successfully', dateCreated: '2026-09-20 18:15:35' },
  ],
  sourceJob: { jobId: 2808, jobName: 'orders', jobStatus: 'Active', taskDetail: { taskName: 'orders task', bucket: 'etl-bucket' } },
  sourceJobQueue: { jobQueueId: 6839, jobStatus: 'Completed', startTime: '2026-09-20 18:13:27', endTime: '2026-09-20 18:15:35' },
};
const STEPS = [{ promptName: 'CSV analyst', run: { runId: 9, status: 'ok', promptVersion: 1, stepTag: 'analysis', output: '**Files** look like sales.\n\n* one\n* two', latencyMs: 9900, tokensIn: 10, tokensOut: 2 } }];

function page() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [JobLogs], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } }] });
  const fixture = TestBed.createComponent(JobLogs);
  fixture.componentRef.setInput('jobId', '2808');
  fixture.componentRef.setInput('jobQueueId', '6839');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog')).flush({ status: API_SUCCESS, data: LOGS });
  http.match(r => r.url.endsWith('/aiPrompt.json/runsForJob')).forEach(r => r.flush({ status: API_SUCCESS, data: STEPS }));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

describe('JobLogs', () => {
  it('links each path a line names to its folder in the task\'s bucket', () => {
    const { el } = page();
    const links = [...el.querySelectorAll<HTMLAnchorElement>('.log-timeline a.log-path')];
    expect(links.map(a => a.textContent!.replace(/\s+/g, ''))).toEqual(['etl-bucket/sales/in', 'sales/in/orders_2026-09-a.csv', 'e2e/json/orders_2026-09-a.json']);
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/objects/files?bucket=etl-bucket&prefix=sales%2Fin%2F',
      '/objects/files?bucket=etl-bucket&prefix=sales%2Fin%2F',
      '/objects/files?bucket=etl-bucket&prefix=e2e%2Fjson%2F',
    ]);
    // A long path may wrap, but only between its names.
    expect(links[2].querySelectorAll('wbr').length).toBe(2);
  });

  it('keeps the links in the table and console views too', () => {
    const { fixture, el, component } = page();
    for (const view of ['table', 'console'] as const) {
      component.view.set(view);
      fixture.detectChanges();
      expect(el.querySelectorAll('a.log-path').length, view).toBe(3);
    }
  });

  it('renders an AI step\'s answer as formatted text, with the chip in sentence case', () => {
    const { el } = page();
    const step = el.querySelector('.ai-step-output')!;
    expect(step.querySelector('strong')?.textContent).toBe('Files');
    expect(step.textContent).not.toContain('**');
    expect(el.textContent).toContain('Answered');
  });

  it('puts the timing toggle in the entries\' own toolbar', () => {
    const { el } = page();
    const toolbar = [...el.querySelectorAll('button')].find(b => /Timing/.test(b.textContent ?? ''));
    expect(toolbar).toBeTruthy();
    expect(toolbar!.closest('app-table-shell')).not.toBeNull();
  });
  /**
   * Two Refresh buttons: the header's called load() (the blanking reload) and the toolbar's
   * refresh() (the quiet one), each with its own spinner, so they span independently. One is
   * kept, in the header, and it is the quiet one (UI audit, Low).
   */
  it('has one Refresh, and it re-reads without blanking the entries', () => {
    const { fixture, el } = page();
    const refreshes = [...el.querySelectorAll('button')].filter(b => b.textContent!.trim() === 'Refresh');
    expect(refreshes).toHaveLength(1);
    refreshes[0].click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.log-timeline li').length).toBe(3);
    TestBed.inject(HttpTestingController).match(() => true).forEach(r => r.flush({ status: API_SUCCESS, data: LOGS }));
  });
});
