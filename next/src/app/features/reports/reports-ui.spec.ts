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

function page(http: { get?: (url: string) => Observable<unknown>; post?: (url: string) => Observable<unknown> } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: HttpClient, useValue: { get: vi.fn(http.get ?? (() => of({ status: 'ERROR', message: '' }))), post: vi.fn(http.post ?? (() => of({ status: 'ERROR', message: '' }))) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: AuthService, useValue: { isTenantAdmin: () => false, isPlatformAdmin: () => false } },
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
