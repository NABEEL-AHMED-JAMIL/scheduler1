import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '../../../core/api/api.config';
import { ReportVersionRow } from '../report-studio.model';
import { delivered, reportStages } from '../report-stages';
import { ReportDeliveries, SchedulesApi, blankSchedule, placeholders, runTone, scheduleTone } from './schedules.api';
import { forPlan, missing, plannable, splitReady } from './schedule-page';
import { ReportSchedules } from './schedule-list';

/**
 * Reports redesign, features 3 and 4 (design schedule.html): what a schedule must say before it is planned and saved, the
 * calls the schedule pages make, the Schedules list, and the report page's Delivered step from a version's deliveries.
 */
const version = (over: Partial<ReportVersionRow> = {}): ReportVersionRow => ({
  versionId: 'V1', reportId: 'R1', version: 1, templateVersion: 2, snapshotId: 'S', jobId: 'J', outputs: [{ format: 'PDF' }], diagnostics: [],
  createdAt: '2026-11-02T13:00:00Z', pages: 2, jobMs: 900, ...over,
} as ReportVersionRow);

describe('a schedule body', () => {
  it('is planned once it has a template and data, the other steps stood in for until they are chosen', () => {
    const b = blankSchedule();
    expect(plannable(b)).toBe(false);
    b.template.templateId = 'T1';
    b.data.pipelineId = 1084;
    expect(plannable(b)).toBe(true);
    expect(splitReady(b)).toBe(false);
    b.delivery.email = { userIds: [] };
    b.delivery.bucket = { connection: '', path: '' };
    b.timing.days = [];
    b.split.name = 'Visit · {patient_id}';
    const p = forPlan(b);
    expect(p.split).toEqual({ mode: 'ALL', name: 'Report' });
    expect(p.delivery.email).toBeNull();
    expect(p.delivery.bucket).toBeNull();
    expect(p.timing.days).toEqual(['MON']);
    expect(p.name).toBe('New schedule');
    b.split.groupBy = 'patient_id';
    expect(splitReady(b)).toBe(true);
    expect(forPlan(b).split).toEqual({ mode: 'PER_GROUP', groupBy: 'patient_id', name: 'Visit · {patient_id}' });
    expect(b.delivery.email).toEqual({ userIds: [] });
  });

  it('says what is missing, in the order of the steps', () => {
    const b = blankSchedule();
    b.delivery.email = { userIds: [] };
    b.timing.days = [];
    expect(missing(b)).toEqual(['Name the schedule.', 'Pick a template (step 1).', 'Say where the data comes from (step 2).',
      'Pick the field each report is for (step 3).', 'Say how each report is named (step 3).', 'Pick who gets the email, or turn it off (step 5).',
      'Pick at least one day (step 6).']);
  });

  it('reads the names a pattern uses', () => {
    expect(placeholders('Wound summary · {patient_id} · week {week} · { visit }')).toEqual(['patient_id', 'week', 'visit']);
  });

  it('tones a state and a run as the pills show them', () => {
    expect([scheduleTone('ON'), scheduleTone('PAUSED'), scheduleTone('WILL_FAIL'), scheduleTone('ARCHIVED')]).toEqual(['ok', 'warn', 'crit', 'neutral']);
    expect([runTone('DONE'), runTone('FAILED'), runTone('SKIPPED'), runTone('MAKING')]).toEqual(['ok', 'crit', 'warn', 'neutral']);
  });
});

describe('the Delivered step', () => {
  const sent = (over: Partial<ReportDeliveries> = {}): ReportDeliveries => ({
    schedule: { scheduleId: 'S1', name: 'Weekly wound summary', then: 'library · email link to 2 people · PDF to riverside-health-s3' },
    deliveries: [
      { deliveryId: 'D1', reportId: 'R1', version: 1, channel: 'LIBRARY', status: 'SENT', attempts: 0, createdAt: '2026-11-03T15:00:00Z',
        sentAt: '2026-11-03T15:00:00Z', target: 'Report library' },
      { deliveryId: 'D2', reportId: 'R1', version: 1, channel: 'EMAIL', status: 'SENT', attempts: 1, createdAt: '2026-11-03T15:00:00Z',
        sentAt: '2026-11-03T15:00:20Z', target: 'Sam Okafor' },
      { deliveryId: 'D3', reportId: 'R1', version: 1, channel: 'BUCKET', status: 'PENDING', attempts: 1, createdAt: '2026-11-03T15:00:00Z',
        target: 'riverside-health-s3 › reports/2026/45/RPT-0042-v1.pdf' },
    ],
    ...over,
  });

  it('is to come for a report no schedule made', () => {
    expect(delivered(version(), null)).toMatchObject({ state: 'todo', detail: 'no delivery set for this report' });
  });

  it('says where a schedule sends it before it is approved', () => {
    expect(delivered(version({ version: 2 }), sent())).toMatchObject({ state: 'todo', detail: 'after approval: library · email link to 2 people · '
      + 'PDF to riverside-health-s3' });
  });

  it('is going while a delivery is pending, a warning when one failed, done when all went', () => {
    expect(delivered(version(), sent())).toMatchObject({ label: 'Delivering', state: 'now', detail: 'library · email link · 1 still going' });
    const failed = sent();
    failed.deliveries[2] = { ...failed.deliveries[2], status: 'FAILED', error: 'refused' };
    expect(delivered(version(), failed)).toMatchObject({ state: 'warn', detail: 'bucket folder failed · sent: library · email link' });
    const done = sent();
    done.deliveries[2] = { ...done.deliveries[2], status: 'SENT', sentAt: '2026-11-03T15:01:00Z' };
    const stage = delivered(version(), done);
    expect(stage.state).toBe('done');
    expect(stage.detail).toContain('library · email link · bucket folder');
    expect(reportStages(version(), String, Date.parse('2026-11-04T00:00:00Z'), done).pop()).toEqual(stage);
  });
});

describe('the schedule calls', () => {
  let http: HttpTestingController;
  let api: SchedulesApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(SchedulesApi);
  });

  afterEach(() => http.verify());

  it('lists, plans with the folder check, tests a report as a PDF, and reads a report\'s deliveries', () => {
    api.list(true).subscribe();
    http.expectOne(r => r.url === `${API_BASE}/reportGenerate.json/schedules` && r.params.get('archived') === 'true')
      .flush({ status: 'SUCCESS', data: { schedules: [], total: 0, zone: 'America/Chicago' } });
    const b = blankSchedule();
    api.plan(b, true).subscribe();
    const plan = http.expectOne(r => r.url === `${API_BASE}/reportGenerate.json/schedulePlan` && r.params.get('checkFolder') === 'true');
    expect(plan.request.method).toBe('POST');
    expect(plan.request.body).toEqual(b);
    plan.flush({ status: 'SUCCESS', data: { checks: [] } });
    api.test(b, 2).subscribe();
    const test = http.expectOne(r => r.url === `${API_BASE}/reportGenerate.json/scheduleTest` && r.params.get('index') === '2');
    expect(test.request.responseType).toBe('blob');
    test.flush(new Blob(['%PDF']));
    api.deliveries('R1').subscribe();
    http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/deliveries` && r.params.get('reportId') === 'R1')
      .flush({ status: 'SUCCESS', data: { deliveries: [] } });
    api.runNow('S1').subscribe();
    http.expectOne(r => r.url === `${API_BASE}/reportGenerate.json/runSchedule` && r.params.get('scheduleId') === 'S1')
      .flush({ status: 'SUCCESS', data: {} });
  });

  it('asks for the fax check of the first report (feature 15) and reads its checks', () => {
    const b = blankSchedule();
    let checks: unknown[] = [];
    api.faxCheck(b).subscribe(r => (checks = r.checks));
    const fax = http.expectOne(`${API_BASE}/reportGenerate.json/scheduleFaxCheck`);
    expect(fax.request.method).toBe('POST');
    expect(fax.request.body).toEqual(b);
    fax.flush({ status: 'SUCCESS', data: { checks: [{ level: 'WARNING', about: 'fax', text: 'Fax check · Lab values: Text in 7 pt…' }] } });
    expect(checks).toEqual([{ level: 'WARNING', about: 'fax', text: 'Fax check · Lab values: Text in 7 pt…' }]);
  });

  it('the list shows each schedule\'s state, next run and last run', async () => {
    const f = TestBed.createComponent(ReportSchedules);
    f.detectChanges();
    http.expectOne(`${API_BASE}/reportGenerate.json/schedules?archived=false`).flush({ status: 'SUCCESS', data: { zone: 'America/Chicago', total: 2,
      schedules: [
        { scheduleId: 'S1', name: 'Weekly wound summary', status: 'ON', state: 'ON', templateId: 'T1', templateName: 'Wound assessment report', rowVersion: 0,
          nextRunAt: '2026-11-09T13:00:00Z', when: 'Every week, Mon at 07:00', makes: 'One report per patient_id', then: 'library · email link to 2 people',
          lastRun: { runId: 'U1', kind: 'SCHEDULED', status: 'DONE', dueAt: '2026-11-02T13:00:00Z', reportsMade: 14, reportsFailed: 0 } },
        { scheduleId: 'S2', name: 'Readmissions by department', status: 'ON', state: 'WILL_FAIL', templateId: 'T2', rowVersion: 1,
          problem: 'The data has no los_days, which the template reads.', when: 'Every month, day 1 at 08:00', makes: 'One report of all rows', then: 'library' },
      ] } });
    await f.whenStable();
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Weekly wound summary');
    expect(text).toContain('Will fail');
    expect(text).toContain('The data has no los_days');
    expect(text).toContain('14 made');
    expect(text).toContain('Not run yet');
    expect((f.nativeElement as HTMLElement).querySelector('[data-schedule="S2"] .pill-crit')).not.toBeNull();
  });
});
