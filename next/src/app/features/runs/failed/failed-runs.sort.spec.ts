import { beforeEach, describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_BASE, API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { FailedRuns } from './failed-runs';
import { FailedRun, FailedRunsAnswer } from './failed-runs.api';

/**
 * Owner 2026-10-27 ("add a sort on each table"): Runs › Failed sorts on the server by Run, Pipeline, Kind and Ended (and
 * Workspace for a platform administrator). Ended, newest first, is the list's own order and sends no sort; a header sends
 * Core's column and direction from the first page, and the page buttons then read Previous / Next.
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

describe('Runs › Failed sorting (server)', () => {
  beforeEach(() => localStorage.clear());

  it('sends no sort for newest first, then the column and direction from the first page', () => {
    const s = screen('TENANT_ADMIN');
    const first = answer(s, { ...ANSWER, total: 120 });
    expect(first.request.body.sort).toBeUndefined();
    expect(first.request.body.dir).toBeUndefined();
    s.component.goTo(1);
    answer(s, { ...ANSWER, total: 120, page: 1 });

    (s.el.querySelector('th[appSort="pipeline"] button') as HTMLButtonElement).click();
    s.fixture.detectChanges();
    const sorted = answer(s, { ...ANSWER, total: 120 });
    expect(sorted.request.body).toMatchObject({ page: 0, sort: 'pipeline', dir: 'asc' });
    const pager = s.el.querySelector('[data-test="failed-pages"]')?.textContent ?? '';
    expect(pager).toContain('Next');
    expect(pager).not.toContain('Older');

    s.component.goTo(1);
    const next = answer(s, { ...ANSWER, total: 120, page: 1 });
    expect(next.request.body).toMatchObject({ page: 1, sort: 'pipeline', dir: 'asc' });
  });

  it('Ended flips to oldest first, and back to newest first with no sort', () => {
    const s = screen('TENANT_ADMIN');
    answer(s);
    expect(s.component.sort.state()).toEqual({ key: 'ended', direction: 'desc' });
    s.component.sort.toggle('ended');
    expect(answer(s).request.body).toMatchObject({ sort: 'ended', dir: 'asc' });
    s.component.sort.toggle('ended');
    expect(answer(s).request.body.sort).toBeUndefined();
  });

  it('offers Workspace to a platform administrator only', () => {
    const s = screen('TENANT_ADMIN');
    answer(s);
    const sortable = (el: HTMLElement) => [...el.querySelectorAll('thead th')].filter(th => th.querySelector('button.th-sort'))
      .map(th => th.textContent?.trim());
    expect(sortable(s.el)).toEqual(['Run', 'Pipeline', 'Kind', 'Ended']);
    const p = screen('PLATFORM_ADMIN');
    answer(p, { ...ANSWER, platform: true });
    expect(sortable(p.el)).toEqual(['Run', 'Workspace', 'Pipeline', 'Kind', 'Ended']);
    p.component.sort.toggle('workspace');
    expect(answer(p, { ...ANSWER, platform: true }).request.body).toMatchObject({ sort: 'workspace', dir: 'asc' });
  });
});
