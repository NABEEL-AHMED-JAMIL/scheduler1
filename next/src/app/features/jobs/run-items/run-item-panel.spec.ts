import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { ItemPanelData, RunItemPanel } from './run-item-panel';
import { ItemDetail } from './run-items.model';

/**
 * MIG-420, an item's panel: "Item 2 of 50" with the previous and the next, its steps, why it failed, its data at each
 * step as pretty JSON or a table with the masked columns marked, and its earlier versions.
 */
const DETAIL = (ref = '2', over: Partial<ItemDetail> = {}): ItemDetail => ({
  item: { ref, key: `call-${ref}.m4a`, label: `call-${ref}.m4a`, folder: 'voice-intake/', status: 'failed', attempt: 2,
    failedStep: { index: 3, key: 'ai', name: 'AI prompt' }, reason: 'The answer did not match the schema.', durationMs: 42_000,
    fileCount: 2, index: Number(ref), of: 50, prevRef: String(Number(ref) - 1), nextRef: String(Number(ref) + 1), current: true },
  steps: [
    { index: 0, key: 'read', name: 'Read S3', status: 'done', note: '1 file', durationMs: 400, hasData: false },
    { index: 1, key: 'transcribe', name: 'Transcribe audio', status: 'done', note: '612 words', durationMs: 161_000, hasData: true },
    { index: 3, key: 'ai', name: 'AI prompt', status: 'failed', note: 'Answer did not match the schema (tried 2 of 2)', durationMs: 38_000, hasData: true },
    { index: 4, key: 'report', name: 'Generate report', status: 'not_run', hasData: false },
  ],
  fileCount: 2,
  files: [{ fileRef: 'f1', name: `call-${ref}.m4a`, role: 'input', format: 'm4a', bytes: 412_000 },
    { fileRef: 'f2', name: `call-${ref}-transcript.txt`, role: 'output', stepKey: 'transcribe', format: 'txt' }],
  versions: [{ attempt: 1, status: 'failed', current: false, endedAt: '2026-10-21T14:00:00Z' }, { attempt: 2, status: 'failed', current: true }],
  retry: { possible: true, fromStep: 'AI prompt', fromStepIndex: 3 },
  ...over,
});

const DATA = { stepKey: 'ai', stepName: 'AI prompt', rowCount: 1, columns: ['answer', 'patient_name'], masked: ['patient_name'],
  rows: [{ answer: '{"summary":"Two days of dizziness","risk":"Moderate"}', patient_name: '••••' }] };

function mount(data: Partial<ItemPanelData> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunItemPanel], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
    { provide: DIALOG_DATA, useValue: { jobQueueId: 8814, ref: '2', canRetry: true, ...data } },
    { provide: DialogRef, useValue: { close: () => {} } },
    { provide: Dialog, useValue: { open: () => ({ closed: { subscribe: () => {} } }) } },
    { provide: ToastService, useValue: { success: () => {}, info: () => {}, error: () => {} } }] });
  const fixture = TestBed.createComponent(RunItemPanel);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const detail = (ref = '2', over: Partial<ItemDetail> = {}) => {
    const ask = http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/detail'));
    ask.flush({ status: API_SUCCESS, data: DETAIL(ref, over) });
    fixture.detectChanges();
    return ask.request;
  };
  const data$ = () => http.expectOne(r => r.url.endsWith('/sourceJob.json/runItems/data'));
  return { fixture, http, el, detail, data$, component: fixture.componentInstance };
}

describe('Run item panel', () => {
  it('says where the item is in the run, its status, why it failed, and opens at the failed step\'s data', () => {
    const { el, detail, data$, fixture } = mount();
    expect(detail().params.get('ref')).toBe('2');
    expect(el.querySelector('[data-test="item-position"]')?.textContent?.trim()).toBe('Item 2 of 50');
    expect(el.querySelector('[data-test="item-status"]')?.textContent?.trim()).toBe('Failed at AI prompt');
    expect(el.querySelector('[data-test="item-why"]')?.textContent).toContain('did not match the schema');
    expect(el.querySelector('[data-test="item-retry-from"]')?.textContent?.trim()).toBe('Retry from AI prompt');
    expect(el.querySelector('[data-test="item-not-made"]')?.textContent).toContain('Generate report: not made');
    const ask = data$();
    expect(ask.request.params.get('stepKey')).toBe('ai');
    ask.flush({ status: API_SUCCESS, data: DATA });
    fixture.detectChanges();
    // JSON text inside a value is shown as the JSON it holds.
    const json = el.querySelector('[data-test="data-json"]')!.textContent!;
    expect(json).toContain('"risk": "Moderate"');
    expect(el.querySelector('[data-test="data-masked"]')?.textContent).toContain('patient_name');
  });

  it('names where the item is once: its key holds its folder (ZT-I17)', () => {
    const { el, detail, data$ } = mount();
    detail('2', { item: { ...DETAIL('2').item, key: 'voice-intake/mig420-0231/call-b.m4a', label: 'call-b.m4a', folder: 'voice-intake/mig420-0231/' } });
    data$();
    const meta = el.querySelector('[data-test="item-meta"]')?.textContent?.trim() ?? '';
    expect(meta.startsWith('voice-intake/mig420-0231/call-b.m4a · ')).toBe(true);
    expect(meta).not.toContain('mig420-0231/voice-intake');
  });

  it('shows the data as a table with the masked column marked, and moves to another step\'s data', () => {
    const { el, detail, data$, fixture, component } = mount();
    detail();
    data$().flush({ status: API_SUCCESS, data: DATA });
    component.mode.set('table');
    fixture.detectChanges();
    expect(el.querySelector('[data-test="data-table"] th[data-col="patient_name"] app-icon')).not.toBeNull();
    expect(el.querySelector('[data-test="data-table"] th[data-col="answer"] app-icon')).toBeNull();
    (el.querySelector('[data-step="transcribe"] button') as HTMLButtonElement).click();
    expect(data$().request.params.get('stepKey')).toBe('transcribe');
  });

  it('goes to the previous and the next item, keeping the step', () => {
    const { el, detail, data$, fixture } = mount({ stepKey: 'transcribe' });
    detail();
    expect(data$().request.params.get('stepKey')).toBe('transcribe');
    (el.querySelector('[data-test="item-next"]') as HTMLButtonElement).click();
    expect(detail('3').params.get('ref')).toBe('3');
    expect(data$().request.params.get('stepKey')).toBe('transcribe');
    fixture.detectChanges();
    (el.querySelector('[data-test="item-prev"]') as HTMLButtonElement).click();
    expect(detail('2').params.get('ref')).toBe('2');
  });

  it('shows an earlier version as earlier, with no Retry, and goes back to the current one', () => {
    const { el, detail, data$, fixture } = mount();
    detail();
    data$();
    (el.querySelector('[data-attempt="1"]') as HTMLButtonElement).click();
    const ask = detail('2', { item: { ...DETAIL().item, current: false, attempt: 1 } });
    expect(ask.params.get('attempt')).toBe('1');
    expect(data$().request.params.get('attempt')).toBe('1');
    expect(el.querySelector('[data-test="item-earlier"]')?.textContent).toContain('attempt 1');
    expect(el.querySelector('[data-test="item-retry"]')).toBeNull();
    (el.querySelector('[data-test="item-earlier"] button') as HTMLButtonElement).click();
    expect(detail().params.has('attempt')).toBe(false);
    fixture.detectChanges();
    expect(el.querySelector('[data-test="item-earlier"]')).toBeNull();
  });

  it('retries this item, or from its failed step, and offers neither to a reader who may not', () => {
    const { el, detail, http } = mount();
    detail();
    (el.querySelector('[data-test="item-retry"]') as HTMLButtonElement).click();
    expect(http.expectOne(r => r.url.endsWith('/sourceJob.json/retryRunItems')).request.body).toEqual({ jobQueueId: 8814, refs: ['2'], from: 'item' });
    const reader = mount({ canRetry: false });
    reader.detail();
    expect(reader.el.querySelector('[data-test="item-retry"]')).toBeNull();
  });

  // ZT-I35 (live run #2950): a step's long name was cut off in its row; now its short name, and the whole name under it.
  it('names a step by its short name with its whole name as a muted line, and a report file by its number', () => {
    const report = 'The Patient intake summary (published template, signed on approval, QR verify)';
    const { el, detail } = mount();
    detail('2', {
      item: { ...DETAIL().item, status: 'done', failedStep: null, reason: null },
      steps: [{ index: 2, key: 'report', name: report, status: 'left_out', note: 'Not in this step\'s output: the item ends here.', hasData: false, files: 1 },
        { index: 5, key: 'keep_outcome', name: 'Outcome row to the bucket', status: 'not_run', hasData: false }],
      files: [{ fileRef: '1267', name: 'Patient_intake_S-1151_v1.pdf', role: 'output', stepKey: 'report', stepName: report, format: 'pdf',
        report: { reportId: '01M5Y3GYFKZRAV9KKQ74D413D6', number: 'RPT-0086', version: 1, pages: 4 } }],
      fileCount: 1,
    });
    const rows = [...el.querySelectorAll('[data-test="item-steps"] li')];
    expect(rows[0].querySelector('[data-test="step-name"]')?.textContent?.replace(/:.*$/, '').trim()).toBe('Patient intake summary');
    expect(rows[0].querySelector('[data-test="step-desc"]')?.textContent?.trim()).toBe(report);
    expect(rows[1].querySelector('[data-test="step-name"]')?.textContent?.replace(/:.*$/, '').trim()).toBe('Outcome row to the bucket');
    expect(rows[1].querySelector('[data-test="step-desc"]')).toBeNull();
    expect(el.querySelector('[data-test="item-files"] [data-file="1267"] span:last-child')?.textContent?.trim())
      .toBe('Patient_intake_S-1151_v1.pdf · RPT-0086 v1');
  });
});

