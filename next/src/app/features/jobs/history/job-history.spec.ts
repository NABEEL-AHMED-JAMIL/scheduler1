import { AuthService } from '../../../core/auth/auth.service';
import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { JobHistory } from './job-history';
import { ToastService } from '../../../shared/ui/toast.service';
import { JobEventsService } from '../../../core/socket/job-events.service';

function history(route: { jobId?: string; targetDate?: string; targetHr?: string } = { jobId: '41' }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: {} }) } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: AuthService, useValue: { canManageTasks: () => true } },
    { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new JobHistory());
  (component as any).jobId = () => route.jobId ?? '';
  (component as any).targetDate = () => route.targetDate ?? '';
  (component as any).targetHr = () => route.targetHr ?? '';
  return component;
}

const runs = (n: number) => Array.from({ length: n }, (_, i) => ({
  jobQueueId: i + 1, jobId: 41, jobStatus: i % 2 ? 'Failed' : 'Completed', jobStatusMessage: '',
})) as any[];

describe('Run history paging', () => {
  /**
   * The runs table rendered every run a job ever made in one piece; Jobs, Tasks and Queue all
   * page (UI audit, Medium). A long-lived job's history is thousands of rows.
   */
  it('shows one page of runs at a time', () => {
    const h = history();
    h.runs.set(runs(120));
    expect(h.paged().length).toBe(50);
    h.goToPage(3);
    expect(h.paged().map(r => r.jobQueueId)).toEqual(runs(120).slice(100).map(r => r.jobQueueId));
  });

  it('goes back to the first page when a filter changes what the pages hold', () => {
    const h = history();
    h.runs.set(runs(120));
    h.goToPage(2);
    h.setStatusFilter('Failed');
    expect(h.pager.page()).toBe(1);
    h.goToPage(2);
    h.setSearch('1');
    expect(h.pager.page()).toBe(1);
  });
});

describe('Run history empty message', () => {
  /** "This job has never run." was said for a search that matched nothing, and for an empty hour. */
  it('says a filter matched nothing when one is on', () => {
    const h = history();
    h.setSearch('zzz');
    expect(h.emptyMessage()).toBe('No runs match the current filters.');
    const s = history();
    s.setStatusFilter('Failed');
    expect(s.emptyMessage()).toBe('No runs match the current filters.');
  });

  it('says the hour was empty on a drill-down', () => {
    expect(history({ targetDate: '2026-09-20', targetHr: '9' }).emptyMessage()).toBe('No runs in this hour.');
    expect(history({ jobId: '41', targetDate: '2026-09-20', targetHr: '9' }).emptyMessage()).toBe('No runs in this hour.');
  });

  it('says the job never ran only when that is what it means', () => {
    expect(history().emptyMessage()).toBe('This job has never run.');
  });
});

describe('Run history stat strips', () => {
  it('draws all eight statuses as tiles, zeros kept and muted, with the total below', () => {
    const h = history();
    h.runs.set(runs(3));
    expect(h.runTiles().map(t => t.label)).toEqual(['Queue', 'Start', 'Running', 'Completed', 'Failed', 'Skip', 'Interrupt', 'Missed']);
    const completed = h.runTiles().find(t => t.label === 'Completed')!;
    const failed = h.runTiles().find(t => t.label === 'Failed')!;
    const skip = h.runTiles().find(t => t.label === 'Skip')!;
    expect([completed.value, completed.quiet]).toEqual([2, false]);
    expect([failed.value, failed.quiet]).toEqual([1, false]);
    expect([skip.value, skip.quiet]).toEqual([0, true]);
    expect(h.runTotal()).toEqual({ label: 'Total', value: 3 });
  });

  it('draws fastest, median and slowest as formatted durations', () => {
    const h = history();
    const at = (seconds: number) => new Date(Date.UTC(2026, 8, 24, 9, 0, seconds)).toISOString();
    h.runs.set([
      { jobQueueId: 1, jobId: 41, jobStatus: 'Completed', startTime: at(0), endTime: at(5) },
      { jobQueueId: 2, jobId: 41, jobStatus: 'Completed', startTime: at(0), endTime: at(90) },
      { jobQueueId: 3, jobId: 41, jobStatus: 'Failed', startTime: at(0), endTime: at(3700 - 0) },
    ] as any[]);
    expect(h.durationTiles()).toEqual([
      { label: 'Fastest', value: '5s' },
      { label: 'Median',  value: '1m 30s' },
      { label: 'Slowest', value: '1h 2m' },
    ]);
  });

  it('draws no duration strip when no run has both a start and an end', () => {
    const h = history();
    h.runs.set(runs(4));
    expect(h.durationTiles()).toEqual([]);
  });
});

describe('Run history with no job chosen', () => {
  /** Tenant-user review: with no job picked the page showed a red error with "Try again" -- it only needs a pick. */
  it('is a neutral prompt, not an error', () => {
    const h = history({});
    h.load();
    expect(h.error()).toBe('');
    expect(h.emptyMessage()).toBe('Open a job, or pick an hour on the dashboard, to see its runs.');
  });
});

/**
 * UI review jobs#23: the dashboard's all-jobs hour drill-down listed runs by job number only,
 * though the screen already fetched every job's name -- it kept one only when a job was open.
 */
describe('Run history across every job', () => {
  function drillDown() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [JobHistory], providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: { get: (url: string) => of(url.includes('listSourceJob')
        ? { status: 'SUCCESS', data: [{ jobId: 7, jobName: 'Nightly ledger check' }] }
        : { status: 'SUCCESS', data: { jobQueues: [
            { jobQueueId: 1, jobId: 7, jobStatus: 'Completed' },
            { jobQueueId: 2, jobId: 8, jobStatus: 'Failed' },
          ] } }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: AuthService, useValue: { canManageTasks: () => true } },
      { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
    ] });
    const fixture = TestBed.createComponent(JobHistory);
    fixture.componentRef.setInput('targetDate', '2026-09-28');
    fixture.componentRef.setInput('targetHr', '9');
    fixture.detectChanges();
    return fixture;
  }

  it('names each run\'s job beside its number, and keeps the bare number for one it cannot name', () => {
    const fixture = drillDown();
    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')]
      .map(tr => tr.textContent!.replace(/\s+/g, ' '));
    expect(rows.find(r => r.includes('#7'))).toContain('Nightly ledger check');
    expect(rows.find(r => r.includes('#8'))).toBeDefined();
    expect(fixture.componentInstance.jobName()).toBe('');
  });
});

/** Layout the test DOM cannot measure, so these read the templates (UI review jobs#23). */
describe('Run history and assistant dock on a phone', () => {
  async function read(file: string): Promise<string> {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    return fs.readFileSync(`${root}/src/app/features/jobs/${file}`, 'utf8');
  }

  it('keeps "Full page" on one line in the dock header', async () => {
    const source = await read('assistant/assistant-dock.ts');
    const at = source.indexOf('title="Open the full page"');
    const tag = source.slice(source.lastIndexOf('<a', at), at);
    expect(tag).toContain('whitespace-nowrap');
    expect(tag).toContain('shrink-0');
  });

  it('shortens "Ask about this job" below sm so the card heading is not cut to "Job &…"', async () => {
    const source = await read('history/job-history.html');
    const at = source.indexOf('<app-icon name="chat" />');
    const button = source.slice(source.lastIndexOf('<button', at), source.indexOf('</button>', at));
    expect(button).toContain('aria-label="Ask about this job"');
    expect(button).toMatch(/<span class="hidden sm:inline">Ask about this job<\/span>/);
    expect(button).toMatch(/<span class="sm:hidden">Ask<\/span>/);
  });
});
