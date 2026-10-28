import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { RunItems } from './run-items';
import { ItemsPage, RunItem } from './run-items.model';

/**
 * Owner 2026-10-27 ("add a sort on each table"): the Items table's #, Item, Status and Time headers sort on the server.
 * Item order (# ascending) is the list's own and sends no sort; a header sends Core's column name and direction and goes
 * back to the first page; the next page keeps the order; a document's pages are read in it too; the step and field
 * columns have no sort.
 */
const item = (n: number, status: RunItem['status'] = 'done', pages = 0): RunItem => ({
  ref: String(n), key: `scan-${n}.pdf`, label: `scan-${n}.pdf`, folder: 'intake/', position: n, status,
  failedStep: status === 'failed' ? { index: 1, key: 'ocr', name: 'OCR' } : null, durationMs: 1000 * n,
  children: pages ? { total: pages, done: pages, failed: 0 } : null,
  cells: { ocr: { status: status === 'failed' ? 'failed' : 'done', hasData: true } },
});

const PAGE = (over: Partial<ItemsPage> = {}): ItemsPage => ({
  jobQueueId: 8815, itemRun: true,
  summary: { items: 120, done: 119, failed: 1, running: 0, failedItems: 1, files: 0, averageMs: 2000,
    failedAt: [{ step: 'OCR', count: 1 }], runStatus: 'Completed', retryable: true, source: 'Read S3' },
  steps: [
    { index: 0, key: 'read', name: 'Read S3', task: 'read_s3', role: 'source' },
    { index: 1, key: 'ocr', name: 'OCR', task: 'ocr', role: 'each' },
  ],
  fields: [], masked: [], total: 120, page: 0, size: 50,
  items: [item(1, 'done', 3), item(2, 'failed'), item(3)], ...over,
});

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunItems], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: () => {} } }] });
  const fixture = TestBed.createComponent(RunItems);
  fixture.componentRef.setInput('jobQueueId', '8815');
  fixture.componentRef.setInput('first', PAGE());
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  return { fixture, http, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

const lists = (http: HttpTestingController) => http.match(r => r.url.endsWith('/sourceJob.json/runItems'));
const header = (el: HTMLElement, key: string) => el.querySelector(`th[appSort="${key}"] button`) as HTMLButtonElement | null;

describe('Run items sorting (server)', () => {
  beforeEach(() => localStorage.clear());

  it('puts sort headers on #, Item, Status and Time only, and sends no sort before a choice', () => {
    const { component, http, el } = mount();
    expect(['position', 'label', 'status', 'time'].map(k => !!header(el, k))).toEqual([true, true, true, true]);
    expect(el.querySelector('th[data-step] button')).toBeNull();
    component.goTo(1);
    const [page] = lists(http);
    expect(page.request.body.sort).toBeUndefined();
    expect(page.request.body.dir).toBeUndefined();
    page.flush({ status: API_SUCCESS, data: PAGE({ page: 1 }) });
  });

  it('a header sends Core\'s column and direction from the first page, and the next page keeps the order', () => {
    const { component, fixture, http, el } = mount();
    component.goTo(2);
    lists(http).forEach(r => r.flush({ status: API_SUCCESS, data: PAGE({ page: 2 }) }));
    fixture.detectChanges();

    header(el, 'time')!.click();
    fixture.detectChanges();
    let [read] = lists(http);
    expect(read.request.body).toMatchObject({ jobQueueId: 8815, page: 0, sort: 'time', dir: 'desc' });
    expect(component.page()).toBe(0);
    read.flush({ status: API_SUCCESS, data: PAGE() });
    fixture.detectChanges();

    header(el, 'time')!.click();
    fixture.detectChanges();
    [read] = lists(http);
    expect(read.request.body).toMatchObject({ page: 0, sort: 'time', dir: 'asc' });
    read.flush({ status: API_SUCCESS, data: PAGE() });

    component.goTo(1);
    [read] = lists(http);
    expect(read.request.body).toMatchObject({ page: 1, sort: 'time', dir: 'asc' });
    read.flush({ status: API_SUCCESS, data: PAGE({ page: 1 }) });
  });

  it('item order is # ascending and sends no sort; # flips to highest first and back; Item sorts A to Z', () => {
    const { component, http } = mount();
    expect(component.sort.state()).toEqual({ key: 'position', direction: 'asc' });
    component.sort.toggle('position');
    expect(lists(http)[0].request.body).toMatchObject({ sort: 'position', dir: 'desc' });
    component.sort.toggle('position');
    const back = lists(http)[0].request.body;
    expect(back.sort).toBeUndefined();
    expect(back.dir).toBeUndefined();
    component.sort.toggle('label');
    expect(lists(http).at(-1)!.request.body).toMatchObject({ sort: 'label', dir: 'asc' });
  });

  it('a document\'s pages are read in the order picked', () => {
    const { component, http } = mount();
    component.sort.toggle('status');
    lists(http).forEach(r => r.flush({ status: API_SUCCESS, data: PAGE() }));
    component.toggleChildren(item(1, 'done', 3));
    const [pages] = lists(http);
    expect(pages.request.body).toMatchObject({ parent: '1', page: 0, sort: 'status', dir: 'asc' });
    pages.flush({ status: API_SUCCESS, data: PAGE({ items: [] }) });
  });
});
