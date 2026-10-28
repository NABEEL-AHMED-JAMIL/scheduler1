import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { FailedRuns } from './failed-runs';
import { FailedRunPanel } from './failed-run-panel';
import { FailedRun, FailedRunsAnswer, dayLabel, retryableHere, windowOf } from './failed-runs.api';

/**
 * MIG-355: Runs › Failed -- the failed runs of the dates with their facets and error patterns, a facet or a pattern
 * narrowing the list, a row opening its detail on the right, and the bulk retry offered to a workspace administrator only.
 */

const URL = `${API_BASE}/message.json/failedRuns`;

const run = (id: number, extra: Partial<FailedRun> = {}): FailedRun => ({
  runId: id, tenantId: 2960, workspace: null, jobId: 10, schedule: 'Claims intake (daily)', taskDetailId: 5, pipeline: 'Claims intake',
  status: 'Failed', endReason: 'WORKER', attempt: 1, startedAt: '2026-10-13T13:00:00Z', endedAt: '2026-10-13T13:01:00Z', stepIndex: 1,
  stepKey: 'pick', task: 'select', error: 'The input has no column no_such_column.', timedOut: false, kind: 'data', kindLabel: 'The data',
  signature: 'aaaaaaaaaaaa', pattern: 'The input has no column no_such_column.', link: `/pipelines/schedules/10/runs/${id}`, retryable: true,
  ...extra,
});

const ANSWER: FailedRunsAnswer = {
  from: '2026-10-06T05:00:00Z', to: '2026-10-14T05:00:00Z', total: 2, scanned: 2, truncated: false, page: 0, pageSize: 50, platform: false,
  facets: {
    pipelines: [{ key: '5', name: 'Claims intake', count: 2 }], schedules: [{ key: '10', name: 'Claims intake (daily)', count: 2 }],
    steps: [{ key: 'select', name: 'select', count: 2 }], kinds: [{ key: 'data', name: 'The data', count: 2 }],
    days: [{ key: '2026-10-13', name: '2026-10-13', count: 2 }],
  },
  groups: [{ signature: 'aaaaaaaaaaaa', pattern: 'The input has no column no_such_column.', task: 'select', kind: 'data', kindLabel: 'The data',
    count: 2, firstSeen: '2026-10-13T12:00:00Z', lastSeen: '2026-10-13T13:01:00Z', sampleRunId: 8001, sampleJobId: 10, sampleError: 'x',
    schedules: 1 }],
  items: [run(8001), run(8000, { status: 'Interrupt', retryable: false, kind: 'timed_out', kindLabel: 'Timed out or stopped responding' })],
};

function screen(role: string, opened: unknown[] = [], query: Record<string, string> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [FailedRuns],
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: AuthService, useValue: { role: signal(role), canOpen: () => true, builderLocked: signal(false), user: signal({ appUserId: 4640 }) } },
      { provide: Dialog, useValue: { open: (_: unknown, config: { data: unknown }) => { opened.push(config.data); return { closed: of(false) }; } } },
    ],
  });
  const fixture = TestBed.createComponent(FailedRuns);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, http };
}

function answer(s: ReturnType<typeof screen>, data: FailedRunsAnswer = ANSWER) {
  const req = s.http.expectOne(r => r.url === URL);
  req.flush({ status: API_SUCCESS, message: '', data });
  s.fixture.detectChanges();
  return req;
}

describe('Runs › Failed', () => {
  it('asks for the dates\' failed runs and shows their patterns and rows', () => {
    const s = screen('TENANT_ADMIN');
    const req = answer(s);
    expect(req.request.body.page).toBe(0);
    expect(Date.parse(req.request.body.to) - Date.parse(req.request.body.from)).toBeGreaterThanOrEqual(7 * 86_400_000);
    expect(s.el.querySelector('[data-signature="aaaaaaaaaaaa"]')?.textContent).toContain('The input has no column');
    expect(s.el.querySelectorAll('[data-run]').length).toBe(2);
    expect(s.el.querySelector('[data-test="failed-total"]')?.textContent).toContain('2 failed runs');
  });

  it('a facet and a pattern narrow the list, and Clear every filter takes them back', () => {
    const s = screen('TENANT_ADMIN');
    answer(s);
    (s.el.querySelector('[data-facet="kinds"] input') as HTMLInputElement).dispatchEvent(new Event('change'));
    const byKind = s.http.expectOne(r => r.url === URL);
    expect(byKind.request.body.kinds).toEqual(['data']);
    byKind.flush({ status: API_SUCCESS, message: '', data: ANSWER });
    s.fixture.detectChanges();
    (s.el.querySelector('[data-signature="aaaaaaaaaaaa"]') as HTMLButtonElement).click();
    const bySignature = s.http.expectOne(r => r.url === URL);
    expect(bySignature.request.body.signature).toBe('aaaaaaaaaaaa');
    bySignature.flush({ status: API_SUCCESS, message: '', data: ANSWER });
    s.fixture.detectChanges();
    (s.el.querySelector('[data-test="failed-clear-all"]') as HTMLButtonElement).click();
    const cleared = s.http.expectOne(r => r.url === URL);
    expect(cleared.request.body.kinds).toEqual([]);
    expect(cleared.request.body.signature).toBeNull();
  });

  it('the bell\'s link names the schedule: the list opens filtered to it', () => {
    const s = screen('TENANT_ADMIN', [], { pipeline: '10' });
    const req = answer(s);
    expect(req.request.body.jobIds).toEqual([10]);
  });

  it('a row opens its detail on the right, with retry offered only for a failed (not interrupted) run', () => {
    const opened: { run: FailedRun; canRetry: boolean }[] = [];
    const s = screen('TENANT_ADMIN', opened);
    answer(s);
    (s.el.querySelector('[data-run="8001"]') as HTMLElement).click();
    (s.el.querySelector('[data-run="8000"]') as HTMLElement).click();
    expect(opened.map(o => [o.run.runId, o.canRetry])).toEqual([[8001, true], [8000, false]]);
  });

  it('a workspace administrator picks failed runs for a bulk retry; a member does not', () => {
    const admin = screen('TENANT_ADMIN');
    answer(admin);
    expect(admin.el.querySelectorAll('[data-run] input[type="checkbox"]').length).toBe(1);
    (admin.el.querySelector('[data-run="8001"] input') as HTMLInputElement).dispatchEvent(new Event('change'));
    admin.fixture.detectChanges();
    expect(admin.el.querySelector('[data-bulk-retry-runs]')?.textContent).toContain('Retry from failed step');
    const member = screen('TENANT_USER');
    answer(member);
    expect(member.el.querySelectorAll('[data-run] input[type="checkbox"]').length).toBe(0);
  });

  it('a backfill\'s run is listed with its backfill, never picked for a bulk retry, and its detail offers no retry (UX review 2026-10-13)', () => {
    const opened: { run: FailedRun; canRetry: boolean }[] = [];
    const s = screen('TENANT_ADMIN', opened);
    answer(s, { ...ANSWER, items: [run(8001), run(8002, { backfillId: 12, retryable: false })] });
    expect(s.el.querySelector('[data-run="8002"] [data-test="failed-backfill"]')?.textContent).toContain('backfill #12');
    expect(s.el.querySelector('[data-run="8002"] input[type="checkbox"]')).toBeNull();
    expect(s.component.retryableOnPage().map(r => r.runId)).toEqual([8001]);
    // Even were Core to call it retryable, the console keeps a backfill's run out of a retry.
    expect(retryableHere({ retryable: true, backfillId: 12 })).toBe(false);
    (s.el.querySelector('[data-run="8002"]') as HTMLElement).click();
    expect(opened[0].canRetry).toBe(false);
  });

  it('a platform administrator sees the workspace of each run and no retry', () => {
    const opened: { canRetry: boolean }[] = [];
    const s = screen('PLATFORM_ADMIN', opened);
    answer(s, { ...ANSWER, platform: true, facets: { ...ANSWER.facets, workspaces: [{ key: '2960', name: 'Riverside Health', count: 2 }] },
      items: [run(8001, { workspace: 'Riverside Health' })] });
    expect(s.el.querySelector('[data-facet="tenantIds"]')?.textContent).toContain('Riverside Health');
    expect(s.el.querySelector('[data-run="8001"]')?.textContent).toContain('Riverside Health');
    (s.el.querySelector('[data-run="8001"]') as HTMLElement).click();
    expect(opened[0].canRetry).toBe(false);
  });

  it('says days the console\'s way and turns local days into an instant window', () => {
    expect(dayLabel('2026-10-13')).toBe('Tue 13 Oct');
    const w = windowOf('2026-10-13', '2026-10-13');
    expect(Date.parse(w.to) - Date.parse(w.from)).toBe(86_400_000);
  });
});

describe('Runs › Failed: a backfill\'s run in the detail (UX review 2026-10-13)', () => {
  it('says its backfill retries it, links there, and asks Core for no retry plan', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FailedRunPanel],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: DIALOG_DATA, useValue: { run: run(8002, { backfillId: 12, retryable: false }), canRetry: false, canRestart: true } },
        { provide: DialogRef, useValue: { close: () => {} } }],
    });
    const fixture = TestBed.createComponent(FailedRunPanel);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const note = el.querySelector('[data-test="failed-backfill-note"]')!;
    expect(note.textContent).toContain('Part of backfill #12: retry failed days from the backfill.');
    expect(note.querySelector('a')!.getAttribute('href')).toBe('/runs/backfills?backfill=12');
    expect(el.querySelector('[data-test="failed-retry-button"]')).toBeNull();
    TestBed.inject(HttpTestingController).expectNone(r => r.url.endsWith('/sourceJob.json/retryPlan'));
  });
});

describe('Runs › Failed -- loading, empty, error (owner 2026-10-27)', () => {
  it('shows no count and no "none" while the first read is out', () => {
    const s = screen('TENANT_ADMIN');
    expect(s.el.querySelector('[data-test="failed-total"]')?.textContent).toContain('Counting…');
    expect(s.el.textContent).not.toContain('No failed runs in these dates.');
    expect(s.el.querySelector('[data-test="failed-empty"]')).toBeNull();
    expect(s.el.querySelector('[data-test="failed-list"] app-loading')).not.toBeNull();
  });

  it('says none once an empty answer arrives', () => {
    const s = screen('TENANT_ADMIN');
    answer(s, { ...ANSWER, total: 0, scanned: 0, groups: [], items: [],
      facets: { pipelines: [], schedules: [], steps: [], kinds: [], days: [] } });
    expect(s.el.querySelector('[data-test="failed-empty"]')?.textContent).toContain('No run failed in these dates.');
    expect(s.el.querySelector('[data-test="failed-patterns"]')?.textContent).toContain('No failed runs in these dates.');
  });

  it('says the read failed in the patterns and the facets too, never "none"', () => {
    const s = screen('TENANT_ADMIN');
    s.http.expectOne(r => r.url === URL).flush('boom', { status: 500, statusText: 'Server Error' });
    s.fixture.detectChanges();
    expect(s.component.error()).toBe('The failed runs could not be read.');
    expect(s.el.querySelector('[data-test="failed-patterns"]')?.textContent).not.toContain('No failed runs in these dates.');
    expect(s.el.querySelector('[data-test="failed-patterns"]')?.textContent).toContain('The failed runs could not be read.');
    expect(s.el.querySelector('[data-test="failed-facets"]')?.textContent).not.toContain('None in these dates');
  });
});

describe('Runs › Failed: the retry plan in the detail (owner 2026-10-27)', () => {
  it('is loading, then says why the plan could not be read, and reads it again on Try again', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FailedRunPanel],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: DIALOG_DATA, useValue: { run: run(8001), canRetry: true, canRestart: true } },
        { provide: DialogRef, useValue: { close: () => {} } }],
    });
    const fixture = TestBed.createComponent(FailedRunPanel);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    expect(fixture.componentInstance.planLoading()).toBe(true);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/retryPlan')).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.planLoading()).toBe(false);
    expect(fixture.componentInstance.planError()).toBe('What a retry would do could not be read.');
    const el = fixture.nativeElement as HTMLElement;
    ([...el.querySelectorAll('[data-test="failed-retry"] button')].find(b => b.textContent!.trim() === 'Try again') as HTMLButtonElement).click();
    expect(fixture.componentInstance.planLoading()).toBe(true);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/retryPlan'));
  });
});
