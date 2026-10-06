import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { DocumentsApi } from './documents.service';
import { DocumentReview } from './review';
import { PageViewer } from './page-viewer';
import { RejectDialog } from './reject-dialog';
import { ReviewDetail } from './documents.model';

/**
 * MIG-272: one document under review. Its answers are ai-service's for extraction 1005 on 2026-09-29 -- OCR 1001 read
 * as an invoice: the number and the date found with boxes, the vendor and the total missing (both required, so the
 * document cannot be approved until they are given), in Review at revision 0.
 */
const INVOICE: ReviewDetail = {
  extractionId: 1005, tenantId: 2924, ocrDocumentId: 1001, status: 'Review', documentTypeId: 1000, documentTypeVersion: 2,
  documentTypeKey: 'invoice', documentTypeName: 'Invoice', revision: 0, claimedBy: null, claimActive: false, autoApproveThreshold: 0.9,
  fieldCount: 9, reviewCount: 4, autoApproved: false, dateCreated: '2026-09-29T05:12:10.000+00:00',
  definition: {
    autoApproveThreshold: 0.9,
    fields: [
      { key: 'invoice_number', label: 'Invoice number', type: 'text', required: true },
      { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
      { key: 'vendor_name', label: 'Vendor', type: 'text', required: true },
      { key: 'total', label: 'Total', type: 'money', required: true },
    ],
    tables: [{ key: 'line_items', label: 'Line items', required: false, columns: [
      { key: 'description', label: 'Description', type: 'text' }, { key: 'amount', label: 'Amount', type: 'money' },
    ] }],
    rules: [{ rule: 'sumEquals', table: 'line_items', column: 'amount', field: 'total', tolerance: 0.01 }],
  },
  fields: [
    { fieldId: 1011, fieldKey: 'invoice_number', value: '77104', confidence: 0.95, page: 1, box: { left: 464, top: 289, width: 128, height: 35 },
      problems: [], corrected: false, label: 'Invoice number', type: 'text', required: true },
    { fieldId: 1012, fieldKey: 'issue_date', value: '2026-09-28', confidence: 0.823, page: 1, box: { left: 540, top: 149, width: 243, height: 35 },
      problems: [], corrected: false, label: 'Issue date', type: 'date', required: true },
    { fieldId: 1014, fieldKey: 'vendor_name', value: null, confidence: 0, page: null, problems: ['Required, and not found on the document.'],
      corrected: false, label: 'Vendor', type: 'text', required: true },
    { fieldId: 1019, fieldKey: 'total', value: null, confidence: 0, page: null, problems: ['Required, and not found on the document.'],
      corrected: false, label: 'Total', type: 'money', required: true },
  ],
  checks: {
    rules: [{ index: 1, rule: 'sumEquals', status: 'skipped', message: null, fields: [] }],
    documentProblems: [], anyRuleFailed: false, canApprove: false,
    blockingProblems: ['Vendor: Required, and not found on the document.', 'Total: Required, and not found on the document.'],
  },
  corrections: [],
};

/** The same document once the vendor and the total are given: revision 1, and it can be approved. */
const CORRECTED: ReviewDetail = {
  ...INVOICE, revision: 1, corrected: 2,
  fields: INVOICE.fields.map(f => f.fieldId === 1014 ? { ...f, value: 'Dock Supplies Ltd', confidence: 1, problems: [], corrected: true }
    : f.fieldId === 1019 ? { ...f, value: '9820.00', confidence: 1, problems: [], corrected: true } : f),
  checks: { ...INVOICE.checks!, canApprove: true, blockingProblems: [], rules: [{ index: 1, rule: 'sumEquals', status: 'passed', fields: [] }] },
};

const FAILING_RULE: ReviewDetail = {
  ...CORRECTED,
  checks: { ...CORRECTED.checks!, anyRuleFailed: true,
    rules: [{ index: 1, rule: 'sumEquals', status: 'failed', message: 'The line items do not add up to the total.', fields: [] }] },
};

const ok = <T>(data: T, message = '') => of({ status: 'SUCCESS', message, data });

function stubApi(detail: ReviewDetail = INVOICE, overrides: Partial<Record<keyof DocumentsApi, unknown>> = {}) {
  return {
    review: vi.fn(() => ok(detail)),
    read: vi.fn(() => ok({ ocrDocumentId: 1001, sourceBucket: 'ui-review-s3', sourceKey: 'ocr-live-check/ocr-live-check.png', status: 'Done', pageCount: 1 })),
    queue: vi.fn(() => ok({ total: 3, page: 0, size: 50, items: [
      { extractionId: 1005, ocrDocumentId: 1001, status: 'Review', revision: 0 },
      { extractionId: 1006, ocrDocumentId: 1001, status: 'Review', revision: 0, claimActive: true, claimedBy: 99 },
      { extractionId: 1008, ocrDocumentId: 1003, status: 'Review', revision: 0 },
    ] })),
    pageImage: vi.fn(() => of(new Blob(['png']))),
    correct: vi.fn(() => ok(CORRECTED, '2 field(s) corrected.')),
    approve: vi.fn(() => ok({ ...CORRECTED, status: 'Approved' }, 'The document is approved and in its type\'s dataset.')),
    reject: vi.fn(() => ok({ ...INVOICE, status: 'Rejected' }, 'The document is rejected.')),
    claim: vi.fn(() => ok({ ...INVOICE, claimActive: true, claimedBy: 4537 }, 'The document is yours to review.')),
    unclaim: vi.fn(() => ok(INVOICE, 'The document is back in the queue.')),
    ...overrides,
  };
}

async function screenWith(opts: { api?: ReturnType<typeof stubApi>; dialogAnswer?: unknown } = {}) {
  const api = opts.api ?? stubApi();
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const opened: unknown[] = [];
  const dialog = {
    openDialogs: [] as unknown[],
    open: vi.fn((component: unknown) => { opened.push(component); return { closed: of(opts.dialogAnswer ?? true) }; }),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ extractionId: '1005' })) } },
      { provide: DocumentsApi, useValue: api },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { user: signal({ appUserId: 4537 }) } },
    ],
  });
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(DocumentReview);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, screen: fixture.componentInstance, el, api, toast, dialog, opened, router };
}

const key = (k: string, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  URL.createObjectURL ??= () => 'blob:x';
  URL.revokeObjectURL ??= () => {};
});

describe('DocumentReview -- reading', () => {
  it('reads the document, its file and its place in the queue', async () => {
    const { el, api } = await screenWith();
    expect(api.review).toHaveBeenCalledWith(1005);
    expect(api.read).toHaveBeenCalledWith(1001);
    expect(el.querySelector('h1')?.textContent).toContain('ocr-live-check.png');
    expect(el.querySelector('.page-subtitle')?.textContent).toContain('Invoice v2 · document 1 of 3 in the review queue');
  });

  it('flags the values a reviewer should look at, against the type\'s threshold', async () => {
    const { el, screen } = await screenWith();
    expect([...screen.flagged()].sort()).toEqual([1012, 1014, 1019]);
    expect(el.textContent).toContain('3 need review');
    const rows = [...el.querySelectorAll<HTMLElement>('.doc-field')];
    expect(rows.map(r => r.classList.contains('doc-field-low'))).toEqual([false, true, true, true]);
    expect(el.textContent).toContain('Required, and not found on the document.');
  });

  it('shows each value exactly as stored', async () => {
    const { el } = await screenWith();
    const inputs = [...el.querySelectorAll<HTMLInputElement>('.doc-field input')];
    expect(inputs.map(i => i.value)).toEqual(['77104', '2026-09-28', '', '']);
  });

  it('says what stands between the document and approval, and what each rule checks', async () => {
    const { el } = await screenWith();
    expect(el.querySelector('[data-test="blocking"]')?.textContent).toContain('Vendor: Required, and not found on the document.');
    expect(el.querySelector('[data-test="rules"]')?.textContent).toContain('Line items amount adds up to total');
    expect(el.querySelector('[data-test="rules"]')?.textContent).toContain('not checked');
  });

  /** MIG-319: a possible duplicate says which document, and opens it. */
  it('names the other document of a possible duplicate and opens it', async () => {
    const duplicate: ReviewDetail = {
      ...CORRECTED,
      definition: { ...CORRECTED.definition!, rules: [...CORRECTED.definition!.rules, { rule: 'duplicate', fields: ['vendor_name', 'total'] }] },
      checks: { ...CORRECTED.checks!, anyRuleFailed: true, rules: [CORRECTED.checks!.rules[0], { index: 2, rule: 'duplicate', status: 'failed',
        message: 'Possible duplicate of INV-NW-1002.pdf: the same Vendor and Total.', fields: ['vendor_name', 'total'], relatedExtractionId: 1003 }] },
    };
    const { el } = await screenWith({ api: stubApi(duplicate) });
    const rules = el.querySelector('[data-test="rules"]')!;
    expect(rules.textContent).toContain('No other document has the same vendor, total');
    expect(rules.textContent).toContain('Possible duplicate of INV-NW-1002.pdf: the same Vendor and Total.');
    expect(rules.querySelector('[data-test="related-document"]')?.getAttribute('href')).toBe('/documents/review/1003');
  });

  it('says so when the document cannot be read', async () => {
    const api = stubApi(INVOICE, { review: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404, error: { status: 'ERROR', message: 'No extraction 1005.' } }))) });
    const { el } = await screenWith({ api });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No extraction 1005.');
  });
});

describe('DocumentReview -- the highlighter', () => {
  it('hands the page viewer every box, and the selected field\'s', async () => {
    const { fixture, el, screen } = await screenWith();
    const viewer = fixture.debugElement.query(By.directive(PageViewer)).componentInstance as PageViewer;
    expect(viewer.boxes().map(b => [b.id, b.low])).toEqual([[1011, false], [1012, true]]);
    el.querySelectorAll<HTMLElement>('.doc-field')[1].click();
    await fixture.whenStable();
    expect(screen.selected()).toBe(1012);
    expect(viewer.activeId()).toBe(1012);
    expect(el.querySelectorAll('.doc-field')[1].classList).toContain('doc-field-active');
  });

  it('selects the field whose box is clicked on the page', async () => {
    const { fixture, screen } = await screenWith();
    const viewer = fixture.debugElement.query(By.directive(PageViewer)).componentInstance as PageViewer;
    viewer.pick.emit(1011);
    expect(screen.selected()).toBe(1011);
  });

  it('says a value that was not found has no box', async () => {
    const { fixture, el } = await screenWith();
    el.querySelectorAll<HTMLElement>('.doc-field')[2].click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Not found on the page: there is no box to show.');
  });
});

describe('DocumentReview -- keys', () => {
  it('moves between fields with ↓ and ↑', async () => {
    const { fixture, screen } = await screenWith();
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(screen.selected()).toBe(1011);
    key('ArrowDown');
    key('ArrowDown');
    expect(screen.selected()).toBe(1014);
    key('ArrowUp');
    expect(screen.selected()).toBe(1012);
    await fixture.whenStable();
  });

  it('does nothing while a person types in a field', async () => {
    const { el, screen, api } = await screenWith({ api: stubApi(CORRECTED) });
    const input = el.querySelector<HTMLInputElement>('.doc-field input')!;
    key('ArrowDown', input);
    key('a', input);
    key('r', input);
    expect(screen.selected()).toBeNull();
    expect(api.approve).not.toHaveBeenCalled();
  });

  it('approves with A and asks why with R', async () => {
    const { api, opened } = await screenWith({ api: stubApi(CORRECTED), dialogAnswer: null });
    key('a');
    await vi.waitFor(() => expect(api.approve).toHaveBeenCalledWith(1005, 1, false));
    key('r');
    await vi.waitFor(() => expect(opened).toContain(RejectDialog));
  });

  it('leaves the keys alone while a dialog is open', async () => {
    const { api, dialog } = await screenWith({ api: stubApi(CORRECTED) });
    dialog.openDialogs.push({});
    key('a');
    expect(api.approve).not.toHaveBeenCalled();
  });
});

describe('DocumentReview -- corrections and decisions', () => {
  it('saves what was typed at the revision open, then approves at the new one and opens the next free document', async () => {
    const { fixture, el, api, router, screen } = await screenWith();
    const inputs = el.querySelectorAll<HTMLInputElement>('.doc-field input');
    inputs[2].value = 'Dock Supplies Ltd';
    inputs[2].dispatchEvent(new Event('input'));
    inputs[3].value = '9820.00';
    inputs[3].dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(screen.dirty()).toBe(true);
    expect(el.textContent).toContain('Save corrections');
    await screen.approve();
    expect(api.correct).toHaveBeenCalledWith(1005, 0, [{ fieldId: 1014, value: 'Dock Supplies Ltd' }, { fieldId: 1019, value: '9820.00' }]);
    expect(api.approve).toHaveBeenCalledWith(1005, 1, false);
    // 1006 is claimed by someone else: the next free one is 1008.
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledWith(['/documents/review', 1008]));
    expect(screen.dirty()).toBe(false);
  });

  it('will not approve while a required value is missing, and says which', async () => {
    const { api, toast, screen } = await screenWith();
    await screen.approve();
    expect(api.approve).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('This document cannot be approved yet: Vendor: Required'));
  });

  it('asks before approving over a failing rule, and says so when it does', async () => {
    const declined = await screenWith({ api: stubApi(FAILING_RULE), dialogAnswer: false });
    await declined.screen.approve();
    expect(declined.api.approve).not.toHaveBeenCalled();

    const accepted = await screenWith({ api: stubApi(FAILING_RULE), dialogAnswer: true });
    await accepted.screen.approve();
    expect(accepted.api.approve).toHaveBeenCalledWith(1005, 1, true);
  });

  it('rejects with the reason given, then moves on', async () => {
    const { api, screen, router, opened } = await screenWith({ dialogAnswer: 'A duplicate of 1000.' });
    await screen.reject();
    expect(opened).toContain(RejectDialog);
    expect(api.reject).toHaveBeenCalledWith(1005, 'A duplicate of 1000.');
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledWith(['/documents/review', 1008]));
  });

  it('goes back to the queue when nothing else is waiting', async () => {
    const api = stubApi(CORRECTED, { queue: vi.fn(() => ok({ total: 1, page: 0, size: 50, items: [{ extractionId: 1005, ocrDocumentId: 1001, status: 'Review', revision: 1 }] })) });
    const { screen, router, toast } = await screenWith({ api });
    await screen.approve();
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledWith(['/documents/review']));
    expect(toast.info).toHaveBeenCalledWith('Nothing else is waiting for review.');
  });

  it('reads a document that changed meanwhile again, and says so', async () => {
    const conflict = new HttpErrorResponse({ status: 409, error: { status: 'ERROR', message: 'This document changed while you were working on it.' } });
    const api = stubApi(CORRECTED, { approve: vi.fn(() => throwError(() => conflict)) });
    const { screen, toast } = await screenWith({ api });
    await screen.approve();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('This document changed while you were working on it. It has been read again'));
    expect(api.review).toHaveBeenCalledTimes(2);
  });

  it('shows the service\'s refusal as it is', async () => {
    const busy = new HttpErrorResponse({ status: 422, error: { status: 'ERROR', message: 'A rule fails: The line items do not add up.' } });
    const { screen, toast } = await screenWith({ api: stubApi(CORRECTED, { approve: vi.fn(() => throwError(() => busy)) }) });
    await screen.approve();
    expect(toast.error).toHaveBeenCalledWith('A rule fails: The line items do not add up.');
  });

  it('adds a line item as table, row and column corrections', async () => {
    const { fixture, el, screen, api } = await screenWith({ api: stubApi(CORRECTED) });
    const add = [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Add row'))!;
    add.click();
    await fixture.whenStable();
    const cells = el.querySelectorAll<HTMLInputElement>('[data-test="new-row"] input');
    cells[0].value = 'Pallets';
    cells[0].dispatchEvent(new Event('input'));
    cells[1].value = '9820.00';
    cells[1].dispatchEvent(new Event('input'));
    await screen.save();
    expect(api.correct).toHaveBeenCalledWith(1005, 1, [
      { tableKey: 'line_items', rowIndex: 0, fieldKey: 'description', value: 'Pallets' },
      { tableKey: 'line_items', rowIndex: 0, fieldKey: 'amount', value: '9820.00' },
    ]);
  });

  it('claims the document and lets it go', async () => {
    const { fixture, screen, api, el } = await screenWith();
    screen.claim();
    await fixture.whenStable();
    expect(api.claim).toHaveBeenCalledWith(1005);
    expect(el.textContent).toContain('Let go');
    screen.claim();
    expect(api.unclaim).toHaveBeenCalledWith(1005);
  });
});

describe('DocumentReview -- read-only', () => {
  it('shows a decided document without a control to change it', async () => {
    const approved = { ...CORRECTED, status: 'Approved', reviewedBy: 4537, dateReviewed: '2026-09-29T05:04:08.939+00:00' };
    const { el, api } = await screenWith({ api: stubApi(approved) });
    expect(el.querySelector('[data-test="view-only"]')?.textContent).toContain('Approved by you');
    expect(el.querySelector('[data-test="approve"]')).toBeNull();
    expect([...el.querySelectorAll<HTMLInputElement>('.doc-field input')].every(i => i.readOnly)).toBe(true);
    key('a');
    expect(api.approve).not.toHaveBeenCalled();
    expect(api.queue).not.toHaveBeenCalled();
  });

  it('names who claimed, decided and corrected a document', async () => {
    const decided = { ...CORRECTED, status: 'Rejected', reviewedBy: 99, reviewedByName: 'Sam Reviewer', rejectReason: 'Blurred',
      dateReviewed: '2026-09-29T05:04:08.939+00:00' };
    const { el } = await screenWith({ api: stubApi(decided) });
    expect(el.querySelector('[data-test="view-only"]')?.textContent).toContain('Rejected by Sam Reviewer');
    const { el: claimed } = await screenWith({ api: stubApi({ ...INVOICE, claimActive: true, claimedBy: 99, claimedByName: 'Sam Reviewer' }) });
    expect(claimed.textContent).toContain('Claimed by Sam Reviewer');
  });

  it('reads a document someone else has claimed, and leaves it to them', async () => {
    const { el } = await screenWith({ api: stubApi({ ...INVOICE, claimActive: true, claimedBy: 99, claimedAt: '2026-09-29T05:20:00.000+00:00' }) });
    expect(el.textContent).toContain('Claimed by user 99');
    expect(el.querySelector('[data-test="approve"]')).toBeNull();
  });

  it('says why an extraction failed', async () => {
    const { el } = await screenWith({ api: stubApi({ ...INVOICE, status: 'Failed', fields: [], checks: null,
      error: 'The model\'s answer was not an extraction.' }) });
    expect(el.querySelector('[data-test="view-only"]')?.textContent).toContain('The extraction failed: The model\'s answer was not an extraction.');
  });
});
