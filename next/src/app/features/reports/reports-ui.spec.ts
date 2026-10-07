import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { BillingApi } from '../billing/billing.service';
import { Reports } from './reports';
import { RunData, RunRow } from './pivot';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';

/** Audit 09-22, Reports as drawn: pressed states, honest empties and failures, one wording. */
const DATA: RunData = {
  job: [], tenant: [], task: ['nightly-load', 'hourly-sync'], status: ['Completed', 'Failed'], owner: ['Ada'], day: ['2026-08-01'],
  rows: [
    [0, 0, 0, 0, 44, 'job a', 1, 0, 3],
    [0, 1, 0, 0, 12, 'job a', 2, 0, 2],
    [1, 1, 0, 0, 9, 'job b', 3, 0, 1],
  ] as RunRow[],
};
const failure = (id: number, task: string, message: string) => ({ jobQueueId: id, jobId: 1, job: 'job', task, status: 'Failed', message, when: '2026-08-01 10:00:00', seconds: 3 });

function page(http: { get?: (url: string) => Observable<unknown>; post?: (url: string) => Observable<unknown> } = {},
    canOpen: (page: string) => boolean = () => true) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: HttpClient, useValue: { get: vi.fn(http.get ?? (() => of({ status: 'ERROR', message: '' }))), post: vi.fn(http.post ?? (() => of({ status: 'ERROR', message: '' }))) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: AuthService, useValue: { isTenantAdmin: () => false, isPlatformAdmin: () => false, canOpen } },
    { provide: BillingApi, useValue: { usageByMeter: () => of({ status: 'ERROR', message: '' }) } },
  ] });
  const fixture = TestBed.createComponent(Reports);
  fixture.detectChanges();
  const reports = fixture.componentInstance;
  reports.loading.set(false); reports.error.set(''); reports.rawData.set(DATA);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, reports, el, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

describe('Reports, rendered', () => {
  it('says the filters, not the dates, are why nothing shows, and offers Clear all', () => {
    const { reports, fixture, el, text } = page();
    reports.statusFilter.set('Running');
    fixture.detectChanges();
    expect(text()).toContain('No run matches these filters.');
    expect(text()).not.toContain('No runs started in this range');
    const clear = [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Clear all')!;
    clear.click();
    expect(reports.statusFilter()).toBe('');
  });

  it('marks the chosen task-health chip as pressed', () => {
    const { reports, fixture, el } = page();
    reports.setHealthState('failing');
    fixture.detectChanges();
    const chips = [...el.querySelectorAll<HTMLButtonElement>('button.pill')].filter(b => /failing|in flight|healthy/.test(b.textContent!));
    expect(chips.map(c => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  });

  it('marks the chosen failure reason as pressed, and clears it with "Clear reason"', () => {
    const { reports, fixture, el } = page();
    reports.failures.set([failure(2, 'nightly-load', 'Disk full'), failure(3, 'hourly-sync', 'Timeout talking to host')]);
    fixture.detectChanges();
    const rows = () => [...el.querySelectorAll<HTMLButtonElement>('button.reason-row')];
    expect(rows().length).toBe(2);
    rows()[0].click();
    fixture.detectChanges();
    expect(rows().map(r => r.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    const clear = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Clear reason'));
    expect(clear).toBeTruthy();
  });

  it('labels the filters with the shared .label', () => {
    const { el } = page();
    for (const id of ['r-from', 'r-to', 'r-f-task', 'r-f-job', 'r-f-status', 'r-f-owner']) {
      expect(el.querySelector(`label[for="${id}"]`)!.classList, id).toContain('label');
    }
  });

  it('pairs Try again with the refresh icon', () => {
    const { reports, fixture, el } = page();
    reports.error.set('The report service is down.');
    fixture.detectChanges();
    const retry = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Try again'))!;
    expect(retry.querySelector('app-icon[name="refresh"]')).not.toBeNull();
  });

  it('says the model-call usage could not be read, with Try again, rather than hiding the section', () => {
    let calls = 0;
    const { reports, fixture, text } = page({ get: (url: string) => (url.includes('aiPrompt.json/usage')
      ? of(calls++ === 0 ? { status: 'ERROR', message: 'Usage is unavailable.' } : { status: 'SUCCESS', data: [] })
      : of({ status: 'ERROR', message: '' })) });
    reports.loadAiUsage();
    fixture.detectChanges();
    expect(text()).toContain('Model calls');
    expect(text()).toContain('Usage is unavailable.');
  });

  it('does not ask for model calls without a page that opens them, and draws no section (review 2026-10-07)', () => {
    const asked: string[] = [];
    const { reports, fixture, text } = page({ get: (url: string) => { asked.push(url); return of({ status: 'ERROR', message: 'refused' }); } },
      key => key === 'reports');
    reports.loadAiUsage();
    fixture.detectChanges();
    expect(asked.some(url => url.includes('aiPrompt.json/usage'))).toBe(false);
    expect(reports.aiUsageError()).toBe('');
    expect(text()).not.toContain('Model calls');
  });

  it('drops a failure-detail answer for a range the page has left', () => {
    const reply = new Subject<unknown>();
    const { reports } = page({ post: () => reply });
    (reports as any).loadFailures();
    reports.startDate.set('2020-01-01');
    reply.next({ status: 'SUCCESS', data: { sourceJobQueues: [{ jobQueueId: 2, jobId: 1, jobStatus: 'Failed', jobStatusMessage: 'Disk full' }] } });
    expect(reports.failures()).toEqual([]);
    expect(reports.failuresLoading()).toBe(false);
  });
});

/**
 * "Last call" printed the server's UTC string cut to 16 characters, so a call at 22:59 in Chicago
 * read "2026-09-25 03:59"; the failures' "When" printed the server's wall clock as it came. Both
 * now go through serverTime, in the viewer's own time and the Queue's short style (UI audit, Low).
 */
describe('Reports times', () => {
  const pipe = new ServerTimePipe('en-US');

  it('shows a prompt\'s last call in the viewer\'s own time', () => {
    const { reports, fixture, text } = page();
    const lastAt = '2026-09-25T03:59:27.550+00:00';
    reports.aiUsage.set([{ promptId: 1, promptName: 'Summarise', calls: 2, failed: 0, tries: 0,
      tokensIn: 10, tokensOut: 5, medianMs: 900, lastAt }]);
    fixture.detectChanges();
    expect(text()).not.toContain('2026-09-25 03:59');
    expect(text()).toContain(pipe.transform(lastAt, 'recent')!);
    // The median call reads as a duration, not "0.9 s".
    expect(text()).toContain('900ms');
  });

  it('shows a failure\'s time the way Queue does, and still groups by the latest', () => {
    const { reports, fixture, text } = page();
    const older = { ...failure(2, 'nightly-load', 'Disk full'), when: '2026-08-01T09:00:00' };
    const newer = { ...failure(3, 'nightly-load', 'Disk full'), when: '2026-08-01T10:00:00' };
    reports.failures.set([newer, older]);
    fixture.detectChanges();
    expect(text()).toContain(pipe.transform(newer.when, 'recentSec')!);
    expect(text()).not.toContain('2026-08-01T10:00:00');
    expect(reports.failureReasons()[0].lastWhen).toBe(newer.when);
  });

  it('stands a reason for its runs in the latest run\'s own words, never the "#" key (UI review U6)', () => {
    const { reports, fixture } = page();
    const older = { ...failure(2, 'nightly-load', 'Rejected 24 of 30 rows (80.00%)'), when: '2026-08-01T09:00:00' };
    const newer = { ...failure(3, 'nightly-load', 'Rejected 12 of 30 rows (40.00%)'), when: '2026-08-01T10:00:00' };
    reports.failures.set([older, newer]);
    fixture.detectChanges();
    expect(reports.failureReasons().map(r => [r.count, r.sample])).toEqual([[2, 'Rejected 12 of 30 rows (40.00%)']]);
  });

  /** MIG-295: no raw ISO day on the page; the task's last day reads as the console writes one. */
  it('writes a task\'s last day as a day, not the ISO key it is sorted by', () => {
    const { text } = page();
    expect(text()).toContain('1 Aug 2026');
    expect(text()).not.toContain('2026-08-01');
  });

  it('writes every duration on the page the one way the console does', () => {
    const { reports, fixture, text } = page();
    reports.failures.set([{ ...failure(4, 'nightly-load', 'Disk full'), seconds: 125 }]);
    fixture.detectChanges();
    expect(text()).toContain('2m 5s');                        // the failure's duration
    expect(text()).toContain('44s');                          // a task's slowest run
    expect(reports.durationFoot()).toContain('2s running');   // the median tile's foot
  });
});
