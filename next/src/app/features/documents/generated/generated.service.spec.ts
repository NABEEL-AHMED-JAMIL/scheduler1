import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from '../../../core/api/api.config';
import { FAN_OUT, GeneratedService, RecentOutputs } from './generated.service';

/**
 * MIG-253: the Reports list reads recent runs' outputs with a capped fan-out -- the schedules that
 * ran most recently, a few runs each -- because there is no endpoint that lists generated files.
 */
function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { service: TestBed.inject(GeneratedService), http: TestBed.inject(HttpTestingController) };
}

const ok = (data: unknown) => ({ status: 'SUCCESS', message: '', data });
const job = (jobId: number, lastJobRun: string | null) => ({ jobId, jobName: `Job ${jobId}`, lastJobRun, createdByName: 'Ada',
  taskDetail: [{ taskName: `Pipeline ${jobId}` }] });

describe('GeneratedService.recentOutputs', () => {
  it('reads the most recent runs of the most recently run schedules, and lists their outputs', () => {
    const { service, http } = setup();
    let got: RecentOutputs | undefined;
    service.recentOutputs().subscribe(r => got = r);
    http.expectOne(`${API_BASE}/sourceJob.json/listSourceJob`).flush(ok([job(1, '2026-09-29T07:00:00'), job(2, null)]));
    const runs = http.expectOne(r => r.url.endsWith('/sourceJob.json/fetchSourceJobQueueListWithJobId'));
    expect(runs.request.params.get('jobId')).toBe('1');
    runs.flush(ok({ jobQueues: [{ jobQueueId: 11 }, { jobQueueId: 10 }, { jobQueueId: 9 }, { jobQueueId: 8 }] }));
    const outputs = http.match(r => r.url.endsWith('/sourceJob.json/runOutputs'));
    expect(outputs.map(o => o.request.params.get('jobQueueId'))).toEqual(['11', '10', '9'].slice(0, FAN_OUT.runsPerJob));
    outputs.forEach((o, i) => o.flush(ok({ outputs: i === 0
      ? [{ runOutputId: 5, kind: 'file', name: 'a.json', runDatasetId: 7, recordedAt: '2026-09-29T07:00:01' }] : [] })));
    expect(got!.runsRead).toBe(FAN_OUT.runsPerJob);
    expect(got!.failed).toBe(0);
    expect(got!.reports).toEqual([expect.objectContaining({ id: 'run-5', jobQueueId: 11, jobId: 1, jobName: 'Job 1',
      pipeline: 'Pipeline 1', owner: 'Ada' })]);
    http.verify();
  });

  it('counts a run whose outputs could not be read, and still lists the rest', () => {
    const { service, http } = setup();
    let got: RecentOutputs | undefined;
    service.recentOutputs().subscribe(r => got = r);
    http.expectOne(`${API_BASE}/sourceJob.json/listSourceJob`).flush(ok([job(1, '2026-09-29T07:00:00')]));
    http.expectOne(r => r.url.endsWith('fetchSourceJobQueueListWithJobId')).flush(ok({ jobQueues: [{ jobQueueId: 11 }] }));
    http.expectOne(r => r.url.endsWith('runOutputs')).flush({ status: 'ERROR', message: 'no' }, { status: 503, statusText: 'x' });
    expect(got).toEqual({ reports: [], runsRead: 1, jobsRead: 1, failed: 1 });
  });

  it('answers at once, with nothing, when no schedule has run', () => {
    const { service, http } = setup();
    let got: RecentOutputs | undefined;
    service.recentOutputs().subscribe(r => got = r);
    http.expectOne(`${API_BASE}/sourceJob.json/listSourceJob`).flush(ok([job(2, null)]));
    expect(got).toEqual({ reports: [], runsRead: 0, jobsRead: 0, failed: 0 });
    http.verify();
  });

  it('reuses one read for a minute, so the file panel does not fan out again', () => {
    const { service, http } = setup();
    service.recentOutputs().subscribe();
    http.expectOne(`${API_BASE}/sourceJob.json/listSourceJob`).flush(ok([]));
    service.recentOutputs().subscribe();
    http.expectNone(`${API_BASE}/sourceJob.json/listSourceJob`);
    service.recentOutputs(true).subscribe();
    http.expectOne(`${API_BASE}/sourceJob.json/listSourceJob`).flush(ok([]));
  });
});

describe('GeneratedService.runDataset', () => {
  it('reads a run dataset as JSON rows', () => {
    const { service, http } = setup();
    let rows: unknown;
    service.runDataset(1051).subscribe(r => rows = r);
    const req = http.expectOne(r => r.url.endsWith('/sourceJob.json/runDataset'));
    expect(req.request.params.get('runDatasetId')).toBe('1051');
    expect(req.request.params.get('format')).toBe('json');
    req.flush('[{"a":1},{"a":2}]');
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
