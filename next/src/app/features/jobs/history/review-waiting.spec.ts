import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
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
