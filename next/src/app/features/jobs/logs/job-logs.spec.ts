import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { JobLogs, boardsFedBy, runHasAi, runTrail } from './job-logs';
import { AuthService } from '../../../core/auth/auth.service';
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

/** UX review 2026-10-12 (R1): the page opens on Steps; the entries are the Log tab's, the AI answers their own tab's. */
function page(tab: 'steps' | 'map' | 'ai' | 'outputs' | 'log' = 'log') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [JobLogs], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } }] });
  const fixture = TestBed.createComponent(JobLogs);
  fixture.componentRef.setInput('jobId', '2808');
  fixture.componentRef.setInput('jobQueueId', '6839');
  fixture.componentInstance.tab.set(tab);
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
    const links = [...el.querySelectorAll<HTMLAnchorElement>('.run-log-lines a.log-path')];
    expect(links.map(a => a.textContent!.replace(/\s+/g, ''))).toEqual(['etl-bucket/sales/in', 'sales/in/orders_2026-09-a.csv', 'e2e/json/orders_2026-09-a.json']);
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/data/files?bucket=etl-bucket&prefix=sales%2Fin%2F',
      '/data/files?bucket=etl-bucket&prefix=sales%2Fin%2F',
      '/data/files?bucket=etl-bucket&prefix=e2e%2Fjson%2F',
    ]);
    // A long path may wrap, but only between its names.
    expect(links[2].querySelectorAll('wbr').length).toBe(2);
  });

  it('keeps the links when the lines wrap', () => {
    const { fixture, el } = page();
    (el.querySelector('[data-test="log-wrap"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.run-log-lines.is-wrap a.log-path').length).toBe(3);
  });

  it('renders an AI step\'s answer as formatted text, with the chip in sentence case', () => {
    const { el } = page('ai');
    const step = el.querySelector('.ai-step-output')!;
    expect(step.querySelector('strong')?.textContent).toBe('Files');
    expect(step.textContent).not.toContain('**');
    expect(el.textContent).toContain('Answered');
  });

  it('puts the timing toggle in the entries\' own toolbar', () => {
    const { el } = page();
    const toolbar = [...el.querySelectorAll('button')].find(b => /Timing/.test(b.textContent ?? ''));
    expect(toolbar).toBeTruthy();
    expect(toolbar!.closest('app-run-log')).not.toBeNull();
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
    expect(el.querySelectorAll('.run-log-line').length).toBe(3);
    TestBed.inject(HttpTestingController).match(r => r.url.endsWith('/findSourceJobAuditLog')).forEach(r => r.flush({ status: API_SUCCESS, data: LOGS }));
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
    fixture.componentInstance.tab.set('log');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog'))
      .flush({ status: 'ERROR', message: 'SourceJob not found with 2808.' });
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  it('says the run does not exist and offers a way back, not Try again', () => {
    const { el, component } = missingRun();
    expect(component.error()).toBe('Run #6839 of schedule #2808 does not exist or was deleted.');
    expect(component.missing()).toBe(true);
    expect([...el.querySelectorAll('button')].some(b => /Try again/.test(b.textContent!))).toBe(false);
    expect([...el.querySelectorAll('a')].some(a => /Back to schedules/.test(a.textContent!))).toBe(true);
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
    const { el, component } = page('ai');
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

  it('times the log\'s lines on the 24-hour clock, the full date in each one\'s title', () => {
    const { el } = page();
    const stamps = [...el.querySelectorAll('.run-log-time')];
    expect(stamps.length).toBe(3);
    for (const stamp of stamps) {
      expect(stamp.textContent!.trim()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(stamp.getAttribute('title')).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}:\d{2}$/);
    }
  });
});

/**
 * MIG-251: a run the step engine took shows its steps (Timeline and Console) above its entries; a legacy run's page is
 * exactly what it was.
 */
describe('JobLogs with the run\'s steps', () => {
  const ENGINE = { jobQueueId: 6839, jobId: 2808, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false, aiSteps: [],
    steps: [{ stepExecutionId: 1, index: 0, key: 'read', task: 'read_file', status: 'Completed', durationMs: 5, recordsIn: 0, recordsOut: 2,
      tries: 1, onError: 'fail', datasets: [], log: 'step' }] };
  const LEGACY = { jobQueueId: 6839, jobId: 2808, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: true, aiSteps: [],
    steps: [{ stepExecutionId: null, index: 0, key: 'legacy', task: 'legacy', status: 'Completed', datasets: [], log: 'run' }] };

  function withSteps(timeline: unknown) {
    const { fixture, el } = page('steps');
    const http = TestBed.inject(HttpTestingController);
    const asks = http.match(r => r.url.endsWith('/sourceJob.json/stepExecutions'));
    // One question for the steps, even though the run's first read landed while it was out.
    expect(asks).toHaveLength(1);
    expect(asks[0].request.params.get('jobQueueId')).toBe('6839');
    asks[0].flush({ status: API_SUCCESS, data: timeline });
    fixture.detectChanges();
    return { el, fixture };
  }

  it('shows an engine run\'s steps on the Steps tab, and its entries on the Log tab', () => {
    const { el, fixture } = withSteps(ENGINE);
    const steps = el.querySelector('[data-test="run-steps"]')!;
    expect(steps).not.toBeNull();
    expect(steps.querySelectorAll('.exec-step').length).toBe(1);
    expect(el.querySelector('app-run-log')).toBeNull();
    (el.querySelector('[data-tab="log"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-run-log')).not.toBeNull();
    expect(el.querySelector('[data-test="run-steps"]')).toBeNull();
  });

  it('says a legacy run has no steps, and keeps its entries on the Log', () => {
    const { el, fixture } = withSteps(LEGACY);
    expect(el.querySelector('[data-test="run-steps"]')).toBeNull();
    expect(el.querySelector('[data-test="legacy-steps"]')).not.toBeNull();
    (el.querySelector('[data-tab="log"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.run-log-line').length).toBe(3);
  });

  it('opens on Steps, with the AI answers, outputs and log a tab each, and the summary above them', () => {
    const { el } = withSteps(ENGINE);
    expect(Array.from(el.querySelectorAll('[data-test="run-tabs"] [role="tab"]')).map(t => t.getAttribute('data-tab')))
      .toEqual(['steps', 'map', 'ai', 'outputs', 'log']);
    expect(el.querySelector('[data-tab="steps"]')?.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('[data-tab="ai"]')?.textContent).toContain('AI answers (1)');
    const summary = el.querySelector('[data-test="run-summary"]')!;
    expect(summary.textContent).toContain('2m 8s');
    expect(summary.compareDocumentPosition(el.querySelector('[data-test="run-tabs"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/**
 * MIG-214: a page left while its poll is in flight must not poll again. The answer that arrives after destroy used to
 * re-arm the 5-second timer, and the gone page kept asking for the run's logs for as long as the tab lived.
 */
describe('JobLogs after it is gone', () => {
  afterEach(() => vi.useRealTimers());

  it('does not re-arm the poll from an answer that arrives after destroy', () => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [JobLogs], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } }] });
    const fixture = TestBed.createComponent(JobLogs);
    fixture.componentRef.setInput('jobId', '2808');
    fixture.componentRef.setInput('jobQueueId', '6839');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const running = { ...LOGS, sourceJobQueue: { ...LOGS.sourceJobQueue, jobStatus: 'Running', endTime: null } };
    http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog')).flush({ status: API_SUCCESS, data: running });
    http.match(r => r.url.endsWith('/aiPrompt.json/runsForJob')).forEach(r => r.flush({ status: API_SUCCESS, data: [] }));
    fixture.componentInstance.refresh();
    const inFlight = http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog'));

    fixture.destroy();
    inFlight.flush({ status: API_SUCCESS, data: running });
    vi.advanceTimersByTime(30_000);

    expect(http.match(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog'))).toHaveLength(0);
  });
});

/**
 * Scale review P1 #22: the page re-read the whole log every five seconds while the socket was already
 * delivering each line, and drew every entry -- a long run froze the tab.
 */
describe('JobLogs at scale', () => {
  afterEach(() => vi.useRealTimers());

  function running(lines: number, connected: boolean) {
    const live = signal(connected);
    const events = new Subject();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [JobLogs], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: JobEventsService, useValue: { connected: live, events } }] });
    const fixture = TestBed.createComponent(JobLogs);
    fixture.componentRef.setInput('jobId', '2808');
    fixture.componentRef.setInput('jobQueueId', '6839');
    fixture.componentInstance.tab.set('log');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const auditLogs = Array.from({ length: lines }, (_, i) => ({
      jobAuditLogId: i + 1, logsDetail: `line ${i + 1}`, dateCreated: '2026-09-20 18:15:34' }));
    http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog'))
      .flush({ status: API_SUCCESS, data: { ...LOGS, auditLogs, sourceJobQueue: { ...LOGS.sourceJobQueue, jobStatus: 'Running', endTime: null } } });
    http.match(r => r.url.endsWith('/aiPrompt.json/runsForJob')).forEach(r => r.flush({ status: API_SUCCESS, data: [] }));
    fixture.detectChanges();
    const polls = () => http.match(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog')).length;
    return { fixture, live, http, polls, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  it('does not re-read the log while the socket delivers it, and polls again once it drops', () => {
    vi.useFakeTimers();
    const { fixture, live, polls } = running(3, true);

    vi.advanceTimersByTime(15000);
    expect(polls()).toBe(0);

    live.set(false);
    fixture.detectChanges();
    vi.advanceTimersByTime(5000);
    expect(polls()).toBe(1);
  });

  it('draws only the lines in view, however long the log (run page fix: a virtual list)', () => {
    const { el } = running(6000, true);
    expect(el.querySelectorAll('.run-log-line').length).toBeLessThan(200);
    expect((el.querySelector('.run-log-spacer') as HTMLElement).style.height).toBe(`${6000 * 20}px`);
    expect(el.querySelector('[data-tab="log"]')!.textContent).toContain('Log (6,000)');
  });
});

/**
 * UX review 2026-10-12, run page fix: /logs opens the Log and the bare run the Steps; a tab is kept in the address; one
 * header (one status pill, a link row) and a strip of the facts the header does not say.
 */
describe('Run page: the address, the header and the summary', () => {
  const ENGINE = { jobQueueId: 6839, jobId: 2808, runStatus: 'Completed', attempt: 1, attempts: [1], legacy: false, aiSteps: [],
    steps: [
      { stepExecutionId: 1, index: 0, key: 'read', task: 'read_file', status: 'Completed', durationMs: 5, recordsIn: 0, recordsOut: 40, tries: 1, datasets: [], log: 'step' },
      { stepExecutionId: 2, index: 1, key: 'save', task: 'save_file', status: 'Completed', durationMs: 9, recordsIn: 40, recordsOut: 1, tries: 1, datasets: [], log: 'step' },
    ] };
  const REVIEW = { jobQueueId: 6839, jobId: 2808, reviewStatus: 'PENDING', required: ['internal'], decisions: [],
    reviewers: { kind: 'role', value: 'TENANT_ADMIN' }, you: { party: 'internal', canDecide: true } };

  function at(child: string | null, tab: string | null = null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [JobLogs], providers: [provideRouter([]), provideLocationMocks(), provideHttpClient(), provideHttpClientTesting(),
      { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } },
      { provide: ActivatedRoute, useValue: { snapshot: { url: [{ path: '6839' }], firstChild: child === null ? null : { url: child ? [{ path: child }] : [] },
        queryParamMap: convertToParamMap(tab ? { tab } : {}) } } }] });
    const fixture = TestBed.createComponent(JobLogs);
    fixture.componentRef.setInput('jobId', '2808');
    fixture.componentRef.setInput('jobQueueId', '6839');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog')).flush({ status: API_SUCCESS, data: LOGS });
    http.match(r => r.url.endsWith('/aiPrompt.json/runsForJob')).forEach(r => r.flush({ status: API_SUCCESS, data: STEPS }));
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/sourceJob.json/stepExecutions')).forEach(r => r.flush({ status: API_SUCCESS, data: ENGINE }));
    http.match(r => r.url.endsWith('/sourceJob.json/runOutputs')).forEach(r => r.flush({ status: API_SUCCESS, data: { outputs: [] } }));
    http.match(r => r.url.endsWith('/sourceJob.json/review')).forEach(r => r.flush({ status: API_SUCCESS, data: REVIEW }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, component: fixture.componentInstance, location: TestBed.inject(Location) };
  }

  it('opens the Log at /logs and the Steps at the bare run', () => {
    expect(at('logs').component.tab()).toBe('log');
    expect(at('').el.querySelector('[data-tab="steps"]')?.getAttribute('aria-selected')).toBe('true');
    expect(at('logs', 'outputs').component.tab()).toBe('outputs');
  });

  it('keeps the chosen tab in the address, replacing it rather than navigating', () => {
    const { el, fixture, component, location } = at('logs');
    (el.querySelector('[data-tab="outputs"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(location.path()).toBe('/pipelines/schedules/2808/runs/6839?tab=outputs');
    component.setTab('steps');
    expect(location.path()).toBe('/pipelines/schedules/2808/runs/6839');
    component.setTab('log');
    expect(location.path()).toBe('/pipelines/schedules/2808/runs/6839/logs');
  });

  it('says the status once, with the review, and never repeats the title', () => {
    const { el } = at('');
    expect(el.querySelectorAll('[data-test="run-status"]').length).toBe(1);
    expect(el.querySelector('[data-test="run-status"]')?.textContent?.trim()).toBe('Completed · waiting for review');
    expect(el.querySelector('h1')?.textContent).toContain('Run #6839 · orders');
    expect(el.querySelector('.page-subtitle')).toBeNull();
    // The summary adds facts; the schedule, the pipeline and the status are not said again.
    const summary = el.querySelector('[data-test="run-summary"]')!;
    expect([...summary.querySelectorAll('dt')].map(d => d.textContent)).toEqual(['Started', 'Ended', 'Duration', 'Started by', 'Steps', 'Rows in → out']);
    expect(summary.textContent).toContain('2/2');
    expect(summary.textContent).toContain('40 → 1');
    expect(summary.textContent).not.toContain('orders task');
    expect(summary.querySelector('app-status')).toBeNull();
  });

  it('says who the review waits on beside the summary', () => {
    const { el } = at('');
    expect(el.querySelector('[data-test="waiting-on"]')?.textContent).toContain('the workspace administrators');
  });
});

/**
 * Run page polish 2026-10-12: one trail from the menu's tree -- Build › Pipelines › Schedules & triggers › <the schedule's
 * runs> for whoever opens Schedules, Run & review › Runs for a reader who holds only the runs -- never the old "Run &
 * review › Schedules & triggers", which put Schedules under the wrong group.
 */
describe('Run page: the breadcrumb', () => {
  it('walks the menu to the schedule\'s runs for whoever may open Schedules', () => {
    expect(runTrail('2977', 'Bulk approval step test #4', { schedules: true, runs: true, inbox: true })).toEqual([
      { label: 'Build' },
      { label: 'Pipelines', link: '/pipelines' },
      { label: 'Schedules & triggers', link: '/pipelines/schedules' },
      { label: 'Bulk approval step test #4 · runs', link: '/pipelines/schedules/2977/executions' },
    ]);
  });

  it('takes a reader who holds only the runs through Runs, and one with only the inbox through it', () => {
    expect(runTrail('2977', 'x', { schedules: false, runs: true, inbox: true })).toEqual([{ label: 'Run & review' }, { label: 'Runs', link: '/runs' }]);
    expect(runTrail('2977', 'x', { schedules: false, runs: false, inbox: true })).toEqual([{ label: 'Run & review' }, { label: 'Review inbox', link: '/workflows/inbox' }]);
    expect(runTrail('2977', 'x', { schedules: false, runs: false, inbox: false })).toEqual([{ label: 'Run & review' }]);
  });
});

/**
 * Run page polish 2026-10-12: run 8298 waits at its Approval step. Its status message is the Next steps box, not a red
 * line; the strip counts the wait live instead of "Still running" and a dash; the AI answers tab is gone from a run with no
 * AI steps, and ?tab=ai on it opens the Steps.
 */
describe('Run page: a run waiting at an Approval step', () => {
  const HOUR = 3_600_000;
  const requestedAt = new Date(Date.now() - 7 * HOUR - 60_000).toISOString();
  const WAITING = { jobQueueId: 8298, jobId: 2977, runStatus: 'Running', attempt: 1, attempts: [1], legacy: false, aiSteps: [], waitingForApproval: true,
    steps: [
      { stepExecutionId: 1, index: 0, key: 'rows', task: 'sample', status: 'Completed', durationMs: 8, recordsIn: 0, recordsOut: 3, tries: 1, datasets: [], log: 'step' },
      { stepExecutionId: 2, index: 1, key: 'approve', name: 'Approve the test rows', task: 'approval', status: 'Running', recordsIn: 3, tries: 1, datasets: [], log: 'step',
        statusMessage: 'Waiting for approval: Approve 3 bulk-review test rows of run 8298',
        approval: { approvalId: 1006, status: 'PENDING', waiting: true, title: 'Approve 3 bulk-review test rows of run 8298',
          reviewers: { kind: 'group', value: '1063' }, requestedAt, expiresAt: new Date(Date.now() + 65 * HOUR).toISOString() } },
      { stepExecutionId: 3, index: 2, key: 'save', task: 'save_file', status: 'Queue', tries: 0, datasets: [], log: 'step' },
    ] };
  const RUN = {
    auditLogs: [
      { jobAuditLogId: 1, logsDetail: 'Step 2/3 <approve> (approval) waits for approval by the group 1063 (request 1006): Approve 3 bulk-review test rows of run 8298', dateCreated: '2026-10-12 22:08:36' },
    ],
    sourceJob: { jobId: 2977, jobName: 'Bulk approval step test #4', taskDetail: { taskName: 'Bulk approval step test' } },
    sourceJobQueue: { jobQueueId: 8298, jobStatus: 'Running', startTime: '2026-10-12 22:08:35', endTime: null,
      jobStatusMessage: 'Waiting for approval at step 2 <approve>: Approve 3 bulk-review test rows of run 8298' },
  };
  const TASK = { id: 1136, instanceId: 1130, stepKey: 'approve', stepType: 'approval', state: 'Open', assigneeKind: 'group', assigneeValue: '1063' };

  function waiting(tab: string | null, reader: 'reviewer' | 'admin' = 'reviewer') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [JobLogs], providers: [provideRouter([]), provideLocationMocks(), provideHttpClient(), provideHttpClientTesting(),
      { provide: JobEventsService, useValue: { connected: signal(false), events: new Subject() } },
      { provide: AuthService, useValue: {
        canOpen: (p: string) => reader === 'admin' || ['queue', 'task-inbox'].includes(p),
        isTenantAdmin: () => reader === 'admin',
        user: signal({ appUserId: reader === 'admin' ? 4640 : 4641, pageAccessProfileName: reader === 'admin' ? null : 'Reviewer' }),
      } },
      { provide: ActivatedRoute, useValue: { snapshot: { url: [{ path: '8298' }], firstChild: { url: [] },
        queryParamMap: convertToParamMap(tab ? { tab } : {}) } } }] });
    const fixture = TestBed.createComponent(JobLogs);
    fixture.componentRef.setInput('jobId', '2977');
    fixture.componentRef.setInput('jobQueueId', '8298');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/findSourceJobAuditLog')).flush({ status: API_SUCCESS, data: RUN });
    http.match(r => r.url.endsWith('/aiPrompt.json/runsForJob')).forEach(r => r.flush({ status: API_SUCCESS, data: [] }));
    fixture.detectChanges();
    expect(fixture.componentInstance.tab()).toBe(tab === 'ai' ? 'ai' : 'steps');
    http.match(r => r.url.endsWith('/sourceJob.json/stepExecutions')).forEach(r => r.flush({ status: API_SUCCESS, data: WAITING }));
    http.match(r => r.url.endsWith('/sourceJob.json/runOutputs')).forEach(r => r.flush({ status: API_SUCCESS, data: { outputs: [] } }));
    http.match(r => r.url.endsWith('/sourceJob.json/review')).forEach(r => r.flush({ status: API_SUCCESS, data: { jobQueueId: 8298, jobId: 2977, reviewStatus: 'NOT_REQUIRED', required: [] } }));
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/taskInbox.json/forSubject')).forEach(r => r.flush({ status: API_SUCCESS, data: reader === 'admin' ? [] : [TASK] }));
    http.match(r => r.url.endsWith('/pageAccess.json/listProfiles')).forEach(r => r.flush({ status: API_SUCCESS, data: [{ pageAccessProfileId: 1063, profileName: 'Reviewer' }] }));
    http.match(r => r.url.endsWith('/billing.json/runCost')).forEach(r => r.flush({ status: API_SUCCESS, data: { cost: 0, currency: 'USD' } }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, component: fixture.componentInstance, location: TestBed.inject(Location) };
  }

  it('says it in an amber Next steps box beside the summary, never as a red error', () => {
    const { el } = waiting(null);
    expect(el.querySelector('[data-test="run-message"]')).toBeNull();
    const next = el.querySelector('.run-top.has-next [data-test="approval-next"]');
    expect(next?.textContent).toContain('Waiting for approval at step 2 · Approve the test rows');
    expect(el.querySelector('[data-test="run-status"]')?.className).toContain('pill-warn');
    expect(el.querySelector('[data-test="run-status"]')?.textContent?.trim()).toBe('Running · waiting for approval');
  });

  it('counts the wait in the strip, live, and leaves Ended blank', () => {
    const { el, component, fixture } = waiting(null);
    const fact = (label: string) => el.querySelector(`[data-fact="${label}"] dd`)?.textContent?.trim();
    expect(fact('Ended')).toBe('—');
    expect(fact('Duration')).toBe('Running · waiting 7 h');
    component.now.set(Date.now() + 2 * HOUR);
    fixture.detectChanges();
    expect(fact('Duration')).toBe('Running · waiting 9 h');
  });

  it('hides the AI answers tab on a run with no AI steps', () => {
    const { el } = waiting(null);
    expect([...el.querySelectorAll('[data-test="run-tabs"] [role="tab"]')].map(t => t.getAttribute('data-tab'))).toEqual(['steps', 'map', 'outputs', 'log']);
    expect(runHasAi({ steps: [{ task: 'ai_prompt' }] }, 0)).toBe(true);
    expect(runHasAi({ steps: [{ task: 'sample' }], aiSteps: [{}] }, 0)).toBe(true);
    expect(runHasAi(null, 1)).toBe(true);
    expect(runHasAi({ steps: [{ task: 'sample' }, { task: 'approval' }] }, 0)).toBe(false);
  });

  it('opens the Steps for ?tab=ai on it, with no error, and the address follows', () => {
    const { el, component, location } = waiting('ai');
    expect(component.tab()).toBe('steps');
    expect(el.querySelector('[data-tab="steps"]')?.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('[data-tab="ai"]')).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(location.path()).toBe('/pipelines/schedules/2977/runs/8298');
  });

  it('names the group in the log and links the request to the reviewer\'s task', () => {
    const { el, component, fixture } = waiting(null);
    component.setTab('log');
    fixture.detectChanges();
    const line = el.querySelector('.run-log-msg')!;
    expect(line.textContent).toContain('waits for approval by the Reviewer group (request 1006)');
    expect(line.textContent).not.toContain('group 1063');
    expect(line.querySelector('a.log-ref')?.getAttribute('href')).toBe('/workflows/inbox?task=1136');
  });

  it('names the group in the steps table too', () => {
    const { el } = waiting(null, 'admin');
    expect(el.querySelector('[data-test="step-approval"]')?.textContent).toContain('Waiting for approval by the Reviewer group in their Review inbox');
  });

  it('walks the reviewer through Runs, and the administrator through Build › Pipelines', () => {
    const crumbs = (el: HTMLElement) => [...el.querySelectorAll('.breadcrumbs li')].map(li => li.textContent!.trim());
    expect(crumbs(waiting(null).el)).toEqual(['Run & review', 'Runs', 'Run #8298']);
    expect(crumbs(waiting(null, 'admin').el)).toEqual(['Build', 'Pipelines', 'Schedules & triggers', 'Bulk approval step test #4 · runs', 'Run #8298']);
  });

  /** UX review 2026-10-13 (R3): the header's link row names the dashboards this run's outputs feed. */
  it('links the dashboards this schedule\'s outputs feed, by name, in place of the plain Dashboards link', () => {
    const { el, fixture } = waiting(null, 'admin');
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/analyticsWorkspace.json/fetchAllDashboards')).flush({ status: API_SUCCESS, data: [
      { analyticsDashboardId: 1450, dashboardName: 'Readmissions', pipelines: [{ jobId: 2977 }] },
      { analyticsDashboardId: 1448, dashboardName: 'Cohort overview', pipelines: [{ jobId: 2977 }, { jobId: 2903 }] },
      { analyticsDashboardId: 1451, dashboardName: 'Claims', pipelines: [{ jobId: 2903 }] },
    ] });
    fixture.detectChanges();
    const feeds = el.querySelector('[data-link="feeds"]')!;
    expect(feeds.textContent!.replace(/\s+/g, ' ').trim()).toBe('Feeds: Cohort overview,Readmissions');
    // Each board and its comma are one item of the row, which the row's gap spaces apart.
    expect([...feeds.querySelectorAll(':scope > span')].map(item => item.textContent!.trim())).toEqual(['Cohort overview,', 'Readmissions']);
    expect([...feeds.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual([
      '/data/analytics/dashboards?board=1448', '/data/analytics/dashboards?board=1450']);
    expect(el.querySelector('[data-link="dashboards"]')).toBeNull();
  });

  it('keeps the plain Dashboards link when no board names the schedule, and reads no boards for a reader without them', () => {
    const { el, fixture } = waiting(null, 'admin');
    TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/analyticsWorkspace.json/fetchAllDashboards'))
      .flush({ status: API_SUCCESS, data: [{ analyticsDashboardId: 1451, dashboardName: 'Claims', pipelines: [{ jobId: 2903 }] }] });
    fixture.detectChanges();
    expect(el.querySelector('[data-link="feeds"]')).toBeNull();
    expect(el.querySelector('[data-link="dashboards"]')).not.toBeNull();
    waiting(null, 'reviewer');
    TestBed.inject(HttpTestingController).expectNone(r => r.url.endsWith('/analyticsWorkspace.json/fetchAllDashboards'));
    expect(boardsFedBy([{ analyticsDashboardId: null, dashboardName: 'x', pipelines: [{ jobId: 1 }] },
      { analyticsDashboardId: 7, dashboardName: ' ', pipelines: [{ jobId: 1 }] }], 1)).toEqual([{ id: 7, name: 'Dashboard #7' }]);
  });
});
