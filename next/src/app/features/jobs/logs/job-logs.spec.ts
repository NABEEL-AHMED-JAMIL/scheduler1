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
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';

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

/**
 * Workers write "Failed: ...", "Attempt 1 of 3 failed", "Completed: ..." -- the tone patterns only
 * matched the bare stems (fail, complete), so every timeline dot came out grey.
 */
describe('JobLogs timeline tone', () => {
  const CRIT = 'var(--color-crit-500)', WARN = 'var(--color-warn-500)', OK = 'var(--color-ok-500)', NONE = 'var(--border-strong)';

  it.each([
    ['Failed: Input CSV not found: x', CRIT],
    ['Attempt 1 of 3 failed: timeout. Queued for attempt 2', CRIT],
    ['Run interrupted', CRIT],
    ['3 errors while parsing', CRIT],
    ['Completed: Checked 40 row(s)', OK],
    ['Job completed successfully', OK],
    ['Skipped: nothing to do', WARN],
    ['Job started', NONE],
    // "rejected" is a count on a good run, not a failure.
    ['Checked 40 row(s): 40 accepted, 0 rejected', NONE],
  ])('%s', (text, tone) => {
    const { component } = page();
    expect(component.toneOf(text)).toBe(tone);
  });
});

/**
 * UI review jobs#25: the timing chart named its bars "Before #16", "Before #9" -- numbers the
 * default Timeline view never shows, and the table's # column renumbered under a search. The bars
 * now carry the entry's time (which every view shows) with its number, and the # column counts
 * the same way the chart does.
 */
describe('JobLogs timing chart names', () => {
  const at = (time: string) => `2026-09-20T${time}`;
  const ENTRIES = [
    { jobAuditLogId: 11, logsDetail: 'Scanning', dateCreated: at('18:15:00') },
    { jobAuditLogId: 12, logsDetail: 'handed to worker', dateCreated: at('18:15:10.000') },
    { jobAuditLogId: 13, logsDetail: 'Reading', dateCreated: at('18:15:10.400') },
    { jobAuditLogId: 14, logsDetail: 'handed back', dateCreated: at('18:17:00') },
  ];

  it('names each bar by the entry\'s time as the views show it, and keeps names unique within a second', () => {
    const { component } = page();
    component.runStartedAt.set(at('18:14:00'));
    component.logs.set(ENTRIES as any);
    const clock = new ServerTimePipe('en-US');
    const names = component.topGaps().map(g => g.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain(`Before ${clock.transform(at('18:17:00'), 'HH:mm:ss')} (#4)`);
    expect(names).toContain(`Before ${clock.transform(at('18:15:10.000'), 'HH:mm:ss')} (#2)`);
    expect(names).toContain(`Before ${clock.transform(at('18:15:10.400'), 'HH:mm:ss')} (#3)`);
  });

  it('keeps each entry\'s own number in the table while a search narrows it', () => {
    const { fixture, el, component } = page();
    component.logs.set([...ENTRIES].reverse() as any);
    component.view.set('table');
    component.search.set('handed');
    fixture.detectChanges();
    const numbers = [...el.querySelectorAll('tbody tr')].map(tr => tr.querySelector('td')!.textContent!.trim());
    expect(numbers.sort()).toEqual(['2', '4']);
  });
});

/**
 * A run that is not there (a stale link, a deleted job, or another person's job for a tenant user)
 * showed the server's "SourceJob not found with 2808." beside a Try again that could only fail the
 * same way, and the live poll kept asking every five seconds.
 */
describe('JobLogs for a run that does not exist', () => {
  function missingRun() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [JobLogs], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } }] });
    const fixture = TestBed.createComponent(JobLogs);
    fixture.componentRef.setInput('jobId', '2808');
    fixture.componentRef.setInput('jobQueueId', '6839');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog'))
      .flush({ status: 'ERROR', message: 'SourceJob not found with 2808.' });
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  it('says the run does not exist and offers a way back, not Try again', () => {
    const { el, component } = missingRun();
    expect(component.error()).toBe('Run #6839 of job #2808 does not exist or was deleted.');
    expect(component.missing()).toBe(true);
    expect([...el.querySelectorAll('button')].some(b => /Try again/.test(b.textContent!))).toBe(false);
    expect([...el.querySelectorAll('a')].some(a => /Back to jobs/.test(a.textContent!))).toBe(true);
  });

  it('stops asking', () => {
    const { component } = missingRun();
    expect(component.autoRefreshing()).toBe(false);
  });
});

/**
 * MIG-295 (UI review jobs#11): the run's duration, the AI step's latency and the gap chart each had
 * a formatter of their own -- "9.9 s" beside "2m 8s" beside "128s" -- and the console printed its
 * entries as "[2026-09-20 18:15:34]" under a header dated "20 Sep 2026".
 */
describe('JobLogs on the console clock', () => {
  it('writes the run and the AI step with the shared duration format', () => {
    const { el, component } = page();
    expect(component.duration()).toBe('2m 8s');
    expect(el.textContent).toContain('9.9s');
    expect(el.textContent).not.toContain('9.9 s');
  });

  it('writes a long wait in minutes', () => {
    const { component } = page();
    const at = (time: string) => `2026-09-20T${time}`;
    component.runStartedAt.set(at('18:00:00'));
    component.logs.set([{ jobAuditLogId: 1, logsDetail: 'waited', dateCreated: at('18:02:05') }] as any);
    expect(component.topGaps()[0].display).toBe('2m 5s');
    expect(component.gapSummary()?.totalLabel).toBe('2m 5s');
  });

  it('dates the console\'s entries as the rest of the console dates things', () => {
    const { fixture, el, component } = page();
    component.view.set('console');
    fixture.detectChanges();
    const stamps = [...el.querySelectorAll('.log-console-time')].map(s => s.textContent!.trim());
    expect(stamps.length).toBe(3);
    for (const stamp of stamps) expect(stamp).toMatch(/^\[\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}:\d{2}\]$/);
  });
});
