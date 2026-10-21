import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ReportStudioApi } from '../report-studio/report-studio.api';
import { ReportReviewCard as Card } from '../report-studio/report-studio.model';
import { ReportReviewCard, STUDIO_SUBJECT_TYPES, studioSubject } from './report-review-card';

/**
 * Report Studio phase 7: a report waiting for approval is a Task inbox task whose card shows the pages and decides through
 * Report Studio -- Approve and sign (or the first of two approvals), Reject with a reason -- with the task's id, so the
 * decision is recorded on it; a reader who may not decide is told why, and gets no buttons.
 */
const ID = '01M5BX3P86MS7PPTJ5YW8FC02W';

const card = (over: Partial<Card> = {}): Card => ({
  reportId: ID, reportLabel: 'RPT-0011', name: 'Home health admission', templateName: 'Clinical summary', templateVersion: 4, version: 3,
  currentVersion: 3, current: true, pages: 4, createdAt: '2026-10-20T19:00:00Z', generatedBy: 4640, generatedByName: 'Riverside Admin',
  hasPdf: true, problems: 0, void: false, expired: false, mayApprove: true, mayReject: true, whyNot: null, secondApprover: false, stage: 'FINAL',
  signing: { configured: true, certificate: 'CN=ETL Console Report Approvals' },
  review: { requestId: 'Q1', kind: 'REPORT_VERSION', subjectId: ID, version: 3, title: 'Approve RPT-0011 v3', state: 'OPEN', requestedBy: 4640,
    requestedByName: 'Riverside Admin', needsSecond: false, inTaskInbox: true },
  ...over,
});

function mount(c: Card) {
  const api = {
    reviewCard: vi.fn(() => of(c)),
    reviewPage: vi.fn(() => of(new HttpResponse({ body: new Blob(['png'], { type: 'image/png' }) }))),
    approve: vi.fn(() => of({ stage: 'APPROVED', signed: true })),
    rejectVersion: vi.fn((_r: string, _v: number, note: string) => note === 'busy'
      ? throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'APPROVAL_CONFLICT', message: 'Version 3 is not waiting for approval.' } }))
      : of({ state: 'REJECTED' })),
  };
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
  globalThis.URL.revokeObjectURL = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: ReportStudioApi, useValue: api }] });
  const fixture = TestBed.createComponent(ReportReviewCard);
  fixture.componentRef.setInput('subjectId', `report-version:${ID}:v3`);
  fixture.componentRef.setInput('taskId', 912);
  const decided: string[] = [];
  const refused: string[] = [];
  fixture.componentInstance.decided.subscribe(m => decided.push(m));
  fixture.componentInstance.refused.subscribe(m => refused.push(m));
  fixture.detectChanges();
  return { fixture, api, decided, refused, el: fixture.nativeElement as HTMLElement };
}

describe('Report review card (Report Studio phase 7)', () => {
  it('reads what a Report Studio task is about from its subject id', () => {
    expect(studioSubject(`report-version:${ID}:v3`)).toEqual({ kind: 'report', id: ID, version: 3 });
    expect(studioSubject(`report-template:${ID}:v2`)).toEqual({ kind: 'template', id: ID, version: 2 });
    expect(studioSubject(`report-asset:${ID}:v1`)).toEqual({ kind: 'asset', id: ID, version: 1 });
    expect(studioSubject('pipeline-run:8071')).toBeNull();
    expect(studioSubject('report-version:../../x:v1')).toBeNull();
    expect(STUDIO_SUBJECT_TYPES).toEqual(['report_version', 'report_template', 'report_asset']);
  });

  it('shows page 1 large and the next pages, and approves and signs with the task id', async () => {
    const { fixture, api, decided, el } = mount(card());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.reviewCard).toHaveBeenCalledWith(ID, 3);
    expect(api.reviewPage).toHaveBeenCalledWith(ID, 3, 1, true);
    expect(el.querySelectorAll('[data-test="review-strip"] button').length).toBe(4);
    expect(el.querySelector('[data-test="review-facts"]')!.textContent).toContain('Riverside Admin');
    (el.querySelector('#rvc-note') as HTMLTextAreaElement).value = 'Matches the admission notes.';
    fixture.componentInstance.note.set('Matches the admission notes.');
    (el.querySelector('[data-test="review-approve"]') as HTMLButtonElement).click();
    expect(api.approve).toHaveBeenCalledWith(ID, 3, 'Matches the admission notes.', 912);
    expect(decided).toEqual(['RPT-0011 v3 approved and its PDF signed.']);
  });

  it('says the first of two approvals, and a rejection needs its reason', async () => {
    const { fixture, api, refused, el } = mount(card({ stage: 'FIRST', secondApprover: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="review-approve"]')!.textContent).toContain('Give the first approval');
    (el.querySelector('[data-test="review-reject"]') as HTMLButtonElement).click();
    expect(api.rejectVersion).not.toHaveBeenCalled();
    expect(refused[0]).toContain('Say why');
    fixture.componentInstance.note.set('busy');
    (el.querySelector('[data-test="review-reject"]') as HTMLButtonElement).click();
    expect(refused[1]).toBe('Version 3 is not waiting for approval.');
  });

  it('gives the generator no buttons and says why', async () => {
    const { fixture, el } = mount(card({ mayApprove: false, mayReject: false, whyNot: 'You generated it; someone else approves it.' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="review-decide"]')).toBeNull();
    expect(el.querySelector('[data-test="review-why-not"]')!.textContent).toContain('You generated it');
  });
});
