import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ReviewWaiting } from './review-waiting';

// MIG-325: the reviewer's list on Executions -- the runs whose results wait for a review, each a link to the run.
function render(answer: object) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
    provideRouter([])] });
  const fixture = TestBed.createComponent(ReviewWaiting);
  fixture.detectChanges();
  TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/sourceJob.json/review/waiting')).flush(answer);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('waiting for review', () => {
  it('lists each waiting run with a link to where it is reviewed', () => {
    const el = render({ status: API_SUCCESS, data: { more: false, runs: [
      { jobQueueId: 7542, jobId: 2853, jobName: 'Wound follow-up', finishedAt: '2026-10-05T18:02:11', required: ['internal'], decisions: [] },
    ] } });
    expect(el.querySelector('[data-review-waiting]')?.textContent).toContain('Waiting for review');
    expect(el.textContent).toContain('Wound follow-up');
    expect(el.textContent).toContain('Needs the internal review');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/pipelines/schedules/2853/runs/7542/logs');
  });

  it('shows the newest five and the rest on request, so Executions keeps its own table in view', () => {
    const runs = Array.from({ length: 8 }, (_, i) => ({ jobQueueId: 100 + i, jobId: 2, jobName: 'Job', finishedAt: null,
      required: ['internal'], decisions: [] }));
    const el = render({ status: API_SUCCESS, data: { more: false, runs } });
    expect(el.querySelectorAll('[data-review-waiting] li').length).toBe(5);
    const toggle = Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Show all 8'))!;
    toggle.click();
    TestBed.inject(ApplicationRef).tick();
    expect(el.querySelectorAll('[data-review-waiting] li').length).toBe(8);
  });

  it('names only the parties still to decide', () => {
    const el = render({ status: API_SUCCESS, data: { more: true, runs: [
      { jobQueueId: 1, jobId: 2, jobName: null, finishedAt: null, required: ['internal', 'customer'], decisions: [{ party: 'internal' }] },
    ] } });
    expect(el.textContent).toContain('Needs the customer review');
    expect(el.textContent).toContain('Job 2');
    expect(el.textContent).not.toContain('Show all');
  });

  it('draws nothing when no run waits, or when the list cannot load', () => {
    expect(render({ status: API_SUCCESS, data: { runs: [], more: false } }).querySelector('[data-review-waiting]')).toBeNull();
    TestBed.resetTestingModule();
    expect(render({ status: 'ERROR', message: 'Reviews belong to a workspace' }).querySelector('[data-review-waiting]')).toBeNull();
  });
});

// Bulk review (2026-10-12): the runs waiting are picked and decided together -- by a workspace administrator through
// Core's run review, by anyone else who decides runs through their Task inbox; a viewer sees no checkboxes.
describe('waiting for review: bulk', () => {
  const RUNS = [
    { jobQueueId: 8301, jobId: 2905, jobName: 'Readmission stats', finishedAt: '2026-10-12T09:02:11', required: ['internal'], decisions: [] },
    { jobQueueId: 8302, jobId: 2905, jobName: 'Readmission stats', finishedAt: null, required: ['internal'], decisions: [] },
    { jobQueueId: 8303, jobId: 2906, jobName: 'Wound follow-up', finishedAt: null, required: ['internal'], decisions: [], individual: true },
  ];

  function renderAs(auth: object, runs = RUNS) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
      provideRouter([]), { provide: AuthService, useValue: auth }] });
    const fixture = TestBed.createComponent(ReviewWaiting);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(r => r.url.endsWith('/sourceJob.json/review/waiting')).flush({ status: API_SUCCESS, data: { more: false, runs } });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const tick = () => { TestBed.inject(ApplicationRef).tick(); };
    return { fixture, el, http, tick, screen: fixture.componentInstance };
  }
  const ADMIN = { isTenantAdmin: () => true, user: () => ({ appUserId: 4639, tenantId: 2945 }), canOpen: () => true };
  const REVIEWER = { isTenantAdmin: () => false, user: () => ({ appUserId: 4650, tenantId: 2945 }), canOpen: (p: string) => p === 'task-inbox' };
  const VIEWER = { isTenantAdmin: () => false, user: () => ({ appUserId: 4651, tenantId: 2945 }), canOpen: () => false };
  const body = () => document.body;
  const inPanel = <T extends HTMLElement>(sel: string) => body().querySelector<T>(`[data-bulk-panel] ${sel}`) ?? body().querySelector<T>(sel);

  it('shows no checkboxes to a viewer', () => {
    const { el } = renderAs(VIEWER);
    expect(el.querySelector('[data-bulk-pick]')).toBeNull();
    expect(el.querySelector('[data-bulk-page]')).toBeNull();
  });

  it('marks a run under individual review and keeps it out of the selection', () => {
    const { el, screen, tick } = renderAs(ADMIN);
    const individual = el.querySelector<HTMLInputElement>('[data-bulk-pick="8303"]')!;
    expect(individual.disabled).toBe(true);
    expect(individual.title).toContain('individual review');
    expect(el.querySelector('[data-run="8303"] [data-individual]')!.textContent).toContain('Individual review');
    el.querySelector<HTMLInputElement>('[data-bulk-page]')!.click();
    tick();
    expect(screen.bulk.ids()).toEqual([8301, 8302]);
    expect(el.querySelector('[data-bulk-count]')!.textContent!.trim()).toBe('2 selected');
  });

  it('an administrator decides through Core: a dry run, then the same bulk id, then the list reloads', () => {
    const { el, http, tick } = renderAs(ADMIN);
    el.querySelector<HTMLInputElement>('[data-bulk-page]')!.click();
    tick();
    el.querySelector<HTMLButtonElement>('[data-bulk-approve]')!.click();
    tick();
    const dry = http.expectOne(r => r.url.endsWith('/sourceJob.json/review/bulkDecide'));
    expect(dry.request.body).toMatchObject({ jobQueueIds: [8301, 8302], decision: 'APPROVED', dryRun: true, comment: null });
    const bulkId = dry.request.body.bulkId;
    dry.flush({ status: API_SUCCESS, message: '2 would be approved.', data: { bulkId, action: 'approve', dryRun: true, requested: 2,
      done: [{ id: 8301, label: 'Run #8301', group: 'Readmission stats' }, { id: 8302, label: 'Run #8302', group: 'Readmission stats' }], skipped: [], failed: [] } });
    tick();
    expect(inPanel('[data-bulk-plan-line]')!.textContent).toContain('2 of the 2 runs will be approved.');
    inPanel<HTMLButtonElement>('[data-bulk-act]')!.click();
    tick();
    const real = http.expectOne(r => r.url.endsWith('/sourceJob.json/review/bulkDecide'));
    expect(real.request.body).toMatchObject({ jobQueueIds: [8301, 8302], decision: 'APPROVED', dryRun: false, bulkId });
    real.flush({ status: API_SUCCESS, message: '2 approved.', data: { bulkId, action: 'approve', dryRun: false, requested: 2,
      done: [{ id: 8301, label: 'Run #8301', link: '/pipelines/schedules/2905/runs/8301/logs' }, { id: 8302, label: 'Run #8302' }], skipped: [], failed: [] } });
    tick();
    expect(inPanel('[data-bulk-result-line]')!.textContent!.trim()).toBe('2 approved.');
    inPanel<HTMLButtonElement>('[data-bulk-done]')!.click();
    tick();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/review/waiting')).flush({ status: API_SUCCESS, data: { more: false, runs: [RUNS[2]] } });
    tick();
    expect(el.querySelectorAll('[data-run]').length).toBe(1);
    expect(el.querySelector('[data-bulk-bar]')).toBeNull();
  });

  it('a reviewer decides through the Task inbox: their open task about each run', () => {
    const { el, http, tick } = renderAs(REVIEWER);
    el.querySelector<HTMLInputElement>('[data-bulk-pick="8302"]')!.click();
    tick();
    el.querySelector<HTMLButtonElement>('[data-bulk-reject]')!.click();
    tick();
    const dry = http.expectOne(r => r.url.endsWith('/taskInbox.json/bulkAct'));
    expect(dry.request.body).toMatchObject({ subjectIds: ['pipeline-run:8302'], action: 'reject', dryRun: true });
    expect(dry.request.body.taskIds).toBeUndefined();
    inPanel<HTMLButtonElement>('[data-bulk-cancel]')?.click();
    tick();
  });
});
