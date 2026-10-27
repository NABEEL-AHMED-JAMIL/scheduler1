import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { ItemPanelData, RunItemPanel, pageReading } from './run-item-panel';
import { ItemDetail } from './run-items.model';

/**
 * MIG-421, the item panel: "All runs of this item" opens the schedule's Items tab on the item's key; an OCR'd page shows
 * its image beside the text read, marked Check by hand when the reader was not sure enough.
 */
const DOC: ItemDetail = {
  item: { ref: '1', key: 'voice-intake/call-a.m4a', label: 'call-a.m4a', status: 'done', index: 1, of: 4, current: true },
  steps: [{ index: 1, key: 'ask', name: 'AI prompt', task: 'ai_prompt', status: 'done', hasData: true }],
  fileCount: 0, files: [], versions: [], retry: { possible: false, why: 'Only a failed item is retried.' },
};

const PAGE3: ItemDetail = {
  item: { ref: '1.3', key: 'referrals/referral-0412.pdf#3', label: 'Page 3', parentRef: '1', status: 'done', flag: 'check', index: 3, of: 40, current: true },
  steps: [{ index: 1, key: 'pages', name: 'Split pages', task: 'split_pages', status: 'done', hasData: true },
    { index: 2, key: 'ocr', name: 'Read text from pages', task: 'ocr_pages', status: 'done', note: 'Check by hand: 72 % sure (below 80 %).', hasData: true }],
  fileCount: 1, files: [{ fileRef: '91', name: 'referral-0412-page-03.png', role: 'output', stepKey: 'pages', format: 'png' }],
  versions: [], retry: { possible: false },
};

function mount(data: Partial<ItemPanelData> = {}) {
  const closed: unknown[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunItemPanel], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: DIALOG_DATA, useValue: { jobQueueId: 1857, ref: '1', canRetry: false, ...data } },
    { provide: DialogRef, useValue: { close: () => closed.push(true) } },
    { provide: Dialog, useValue: { open: () => ({ closed: { subscribe: () => {} } }) } },
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: () => {} } }] });
  const fixture = TestBed.createComponent(RunItemPanel);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement, closed };
}

describe('Run item panel (v2)', () => {
  it('opens every run of the item on its schedule\'s Items tab, also for a reader who cannot retry', () => {
    const { fixture, http, el, closed } = mount({ jobId: '1037' });
    const go = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http.expectOne(r => r.url.endsWith('/runItems/detail')).flush({ status: API_SUCCESS, data: DOC });
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/runItems/data'));
    expect(el.querySelector('[data-test="item-retry"]')).toBeNull();
    (el.querySelector('[data-test="item-all-runs"]') as HTMLButtonElement).click();
    expect(closed).toHaveLength(1);
    expect(go).toHaveBeenCalledWith(['/pipelines/schedules', '1037', 'items'], { queryParams: { key: 'voice-intake/call-a.m4a' } });
  });

  it('has no All runs button without a schedule to open', () => {
    const { fixture, http, el } = mount();
    http.expectOne(r => r.url.endsWith('/runItems/detail')).flush({ status: API_SUCCESS, data: DOC });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="item-all-runs"]')).toBeNull();
  });

  it('shows an OCR\'d page\'s image beside the text read, marked Check by hand', () => {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:page-3';
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    const { fixture, http, el } = mount({ ref: '1.3' });
    http.expectOne(r => r.url.endsWith('/runItems/detail')).flush({ status: API_SUCCESS, data: PAGE3 });
    fixture.detectChanges();
    const datas = http.match(r => r.url.endsWith('/runItems/data'));
    const ocr = datas.find(d => d.request.params.get('stepKey') === 'ocr')!;
    ocr.flush({ status: API_SUCCESS, data: { stepKey: 'ocr', stepName: 'Read text from pages', columns: [], rows: [{ ocr_text: 'Reason for referral:\nNon-healing ulcer L heel',
      ocr_sureness: 72, ocr_source: 'ocr', ocr_status: 'check', ocr_note: 'Check by hand: 72 % sure (below 80 %).' }] } });
    const image = http.expectOne(r => r.url.endsWith('/runItems/file'));
    expect(image.request.params.get('fileRef')).toBe('91');
    expect(image.request.params.get('inline')).toBe('true');
    image.flush(new Blob(['png']));
    fixture.detectChanges();
    expect(el.querySelector('[data-test="item-status"]')?.textContent?.trim()).toBe('Check by hand');
    expect(el.querySelector('[data-test="page-check"]')?.textContent?.trim()).toBe('Check by hand · 72 % sure');
    expect(el.querySelector('[data-test="page-text"]')?.textContent).toContain('Non-healing ulcer L heel');
    expect((el.querySelector('[data-test="page-image"]') as HTMLImageElement).getAttribute('src')).toBe('blob:page-3');
    expect(el.querySelector('[data-test="page-rotation"]')).toBeNull();
  });

  /** ZT-I25: a page scanned upside down was turned before it was read; the page says so beside its sureness. */
  it('says a page was turned to be read upright', () => {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:page-3';
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    const { fixture, http, el } = mount({ ref: '1.3' });
    http.expectOne(r => r.url.endsWith('/runItems/detail')).flush({ status: API_SUCCESS, data: PAGE3 });
    fixture.detectChanges();
    http.match(r => r.url.endsWith('/runItems/data')).find(d => d.request.params.get('stepKey') === 'ocr')!.flush({ status: API_SUCCESS,
      data: { stepKey: 'ocr', stepName: 'Read text from pages', columns: [], rows: [{ ocr_text: 'Reason for referral', ocr_sureness: 91,
        ocr_source: 'ocr', ocr_status: 'ok', ocr_note: 'Read: 3 words, 91 % sure. Turned 180° to be read upright.', ocr_rotation: 180 }] } });
    http.expectOne(r => r.url.endsWith('/runItems/file')).flush(new Blob(['png']));
    fixture.detectChanges();
    expect(el.querySelector('[data-test="page-rotation"]')?.textContent?.trim()).toBe('Turned 180° to read');
  });

  it('reads an OCR row', () => {
    expect(pageReading({ stepKey: 'o', stepName: 'o', columns: [], rows: [{ ocr_text: 'x', ocr_sureness: '64.5', ocr_source: 'ocr', ocr_status: 'check' }] }))
      .toEqual({ text: 'x', sureness: 64.5, source: 'ocr', status: 'check', note: null, rotation: 0 });
    expect(pageReading({ stepKey: 'o', stepName: 'o', columns: [], rows: [{ ocr_text: 'x', ocr_rotation: 90 }] })?.rotation).toBe(90);
    expect(pageReading({ stepKey: 'o', stepName: 'o', columns: [], rows: [] })).toBeNull();
  });
});
