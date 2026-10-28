import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { ScheduleItems } from './schedule-items';
import { AcrossPage, AcrossRow } from './schedule-items.model';

/**
 * Owner 2026-10-27 ("add a sort on each table"): a schedule's items across runs sort on the server by Run, Item, When and
 * Status. No sort is sent before a choice; a header sends Core's column and direction from the first page; the line under
 * the title stops saying "latest first" while a column orders the list.
 */
const row = (run: number, over: Partial<AcrossRow> = {}): AcrossRow => ({
  jobQueueId: run, ref: '1', key: `intake/scan-${run}.pdf`, label: `scan-${run}.pdf`, startedAt: '2026-10-21T14:00:00Z', triggerLabel: 'by schedule',
  pipelineVersion: 3, status: 'done', fields: {}, ...over,
});

const PAGE = (over: Partial<AcrossPage> = {}): AcrossPage => ({
  jobId: 1038, jobName: 'Scanned referrals (synthetic)', total: 60, page: 0, size: 25,
  keys: [{ key: 'intake/scan-1.pdf', label: 'scan-1.pdf', runs: 1 }, { key: 'intake/scan-2.pdf', label: 'scan-2.pdf', runs: 1 }], distinctKeys: 2,
  fields: [], masked: [], items: [row(1901), row(1900, { status: 'failed' })], ...over,
});

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ScheduleItems], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: () => {} } }] });
  const fixture = TestBed.createComponent(ScheduleItems);
  fixture.componentRef.setInput('jobId', '1038');
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.match(r => r.url.endsWith('/listSourceJob')).forEach(r => r.flush({ status: API_SUCCESS, data: [] }));
  return { fixture, http, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

const reads = (http: HttpTestingController) => http.match(r => r.url.endsWith('/sourceJob.json/itemRuns'));

describe('Schedule items sorting (server)', () => {
  beforeEach(() => localStorage.clear());

  it('sends no sort before a choice, then the column and direction from the first page', () => {
    const { component, fixture, http, el } = mount();
    const [first] = reads(http);
    expect(first.request.body.sort).toBeUndefined();
    first.flush({ status: API_SUCCESS, data: PAGE() });
    fixture.detectChanges();
    expect(component.headline()?.sub).toContain('latest first');
    component.goTo(1);
    reads(http).forEach(r => r.flush({ status: API_SUCCESS, data: PAGE({ page: 1 }) }));
    fixture.detectChanges();

    (el.querySelector('th[appSort="startedAt"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    let [read] = reads(http);
    expect(read.request.body).toMatchObject({ jobId: 1038, page: 0, sort: 'startedAt', dir: 'desc' });
    expect(component.pageNo()).toBe(0);
    read.flush({ status: API_SUCCESS, data: PAGE() });
    fixture.detectChanges();
    expect(component.headline()?.sub).toContain('in the order picked');
    expect(component.headline()?.sub).not.toContain('latest first');

    (el.querySelector('th[appSort="startedAt"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    [read] = reads(http);
    expect(read.request.body).toMatchObject({ page: 0, sort: 'startedAt', dir: 'asc' });
    read.flush({ status: API_SUCCESS, data: PAGE() });
  });

  it('puts sort headers on Run, Item, When and Status only', () => {
    const { fixture, http, el } = mount();
    reads(http).forEach(r => r.flush({ status: API_SUCCESS, data: PAGE() }));
    fixture.detectChanges();
    const sortable = [...el.querySelectorAll('thead th')].filter(th => th.querySelector('button.th-sort')).map(th => th.textContent?.trim());
    expect(sortable).toEqual(['Run', 'Item', 'When', 'Status']);
  });

  it('the status column sends problems-first order as Core names it', () => {
    const { component, http } = mount();
    reads(http).forEach(r => r.flush({ status: API_SUCCESS, data: PAGE() }));
    component.sort.toggle('status');
    expect(reads(http)[0].request.body).toMatchObject({ sort: 'status', dir: 'asc' });
    component.sort.toggle('run');
    expect(reads(http)[0].request.body).toMatchObject({ sort: 'run', dir: 'desc' });
  });
});
