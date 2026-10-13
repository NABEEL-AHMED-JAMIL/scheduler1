import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiResponse } from '../../../core/api/api.config';
import { BulkAction, BulkAnswer, BulkItem, BulkRequest, BulkSource } from './bulk.model';
import { BulkPanel, DRY_RUN_COMMENT } from './bulk-panel';

interface Row { id: number; }
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: 8300 + i }));

const answer = (request: BulkRequest, parts: Partial<Pick<BulkAnswer, 'done' | 'skipped' | 'failed'>>): ApiResponse<BulkAnswer> => ({
  status: 'SUCCESS', message: '',
  data: { bulkId: request.bulkId, action: request.action, dryRun: request.dryRun, requested: 0, done: [], skipped: [], failed: [], ...parts },
});

const done = (n: number, group = 'Readmission stats'): BulkItem[] => Array.from({ length: n }, (_, i) =>
  ({ id: 8300 + i, label: `Run #${8300 + i} · ${group}`, group, link: `/pipelines/schedules/2905/runs/${8300 + i}/logs` }));

function open(action: BulkAction, count: number, reply: (request: BulkRequest) => Observable<ApiResponse<BulkAnswer>>) {
  const send = vi.fn((_: Row[], request: BulkRequest) => reply(request));
  const source: BulkSource<Row> = { idOf: r => r.id, noun: ['run', 'runs'], groupNoun: 'pipeline', send };
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: DialogRef, useValue: ref }, { provide: DIALOG_DATA, useValue: { action, rows: rows(count), source } }],
  });
  const fixture = TestBed.createComponent(BulkPanel<Row>);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T & Element>(sel);
  const type = (sel: string, value: string) => {
    const box = q<HTMLInputElement>(sel)!;
    box.value = value;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const act = () => q<HTMLButtonElement>('[data-bulk-act]')!;
  const text = (sel: string) => (q(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { fixture, el, panel: fixture.componentInstance, send, ref, q, type, act, text };
}

describe('BulkPanel: the confirm panel of a bulk decision', () => {
  it('asks the service first with a dry run and a fresh bulk id, and shows the count by pipeline', () => {
    const { send, text, el, panel } = open('approve', 3, r => of(answer(r, { done: [...done(2), ...done(1, 'Claims')] })));
    expect(send).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0][1];
    expect(request).toEqual({ action: 'approve', comment: null, bulkId: panel.bulkId, dryRun: true });
    expect(request.bulkId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(text('[data-bulk-plan-line]')).toBe('3 of the 3 runs will be approved.');
    const groups = Array.from(el.querySelectorAll('[data-bulk-group]')).map(g => Array.from(g.children).map(c => c.textContent!.trim()));
    expect(groups).toEqual([['Readmission stats', '2'], ['Claims', '1']]);
    expect(text('[data-bulk-act]')).toBe('Approve 3');
  });

  it('MIG-355: a bulk retry asks no comment, says Retry and Retried, and names a retry\'s refusals in words', () => {
    const { send, text, q, act, panel } = open('retry', 3, r => of(answer(r, { done: done(2), skipped: [
      { id: 9, label: 'Run #9', reason: 'pipeline-changed', message: 'Step 1 changed.' }] })));
    expect(send.mock.calls[0][1]).toEqual({ action: 'retry', comment: null, bulkId: panel.bulkId, dryRun: true });
    expect(text('[data-bulk-plan-line]')).toBe('2 of the 3 runs will be retried.');
    expect(q('[data-bulk-comment]')).toBeNull();
    expect(text('[data-bulk-act]')).toBe('Retry 2');
    expect(text('[data-bulk-skipped]')).toContain('The pipeline changed before the failed step');
    act().click();
    expect(send.mock.calls[1][1]).toEqual({ action: 'retry', comment: null, bulkId: panel.bulkId, dryRun: false });
  });

  it('groups what will be skipped by reason, in words', () => {
    const { el } = open('approve', 5, r => of(answer(r, { done: done(1), skipped: [
      { id: 1, label: 'Run #1', reason: 'already-decided', message: 'This run\'s results are already approved.' },
      { id: 2, label: 'Run #2', reason: 'individual-review' },
      { id: 3, label: 'Run #3', reason: 'already-decided' },
      { id: 4, reason: 'not-found', message: 'Not found.' },
    ] })));
    const reasons = Array.from(el.querySelectorAll('[data-bulk-skipped] [data-bulk-reason]'));
    expect(reasons.map(r => r.getAttribute('data-bulk-reason'))).toEqual(['already-decided', 'individual-review', 'not-found']);
    expect(Array.from(reasons[0].querySelector('summary')!.children).map(c => c.textContent!.trim())).toEqual(['Already decided', '2']);
    expect(reasons[1].textContent).toContain('The pipeline requires individual review');
    expect(reasons[2].textContent).toContain('#4');
  });

  it('needs a comment to reject; the dry run is not refused for want of one', () => {
    const { send, act, type, q } = open('reject', 2, r => of(answer(r, { done: done(2) })));
    expect(send.mock.calls[0][1].comment).toBe(DRY_RUN_COMMENT);
    expect(q('label[for="bulk-comment"]')!.textContent).toContain('required');
    expect(act().disabled).toBe(true);
    expect(act().textContent!.trim()).toBe('Reject 2');
    type('[data-bulk-comment]', '   ');
    expect(act().disabled).toBe(true);
    type('[data-bulk-comment]', 'Wrong source file');
    expect(act().disabled).toBe(false);
  });

  it('keeps the comment optional to approve, at most 500 characters, applied to each item', () => {
    const { act, type, text } = open('approve', 2, r => of(answer(r, { done: done(2) })));
    expect(act().disabled).toBe(false);
    expect(text('#bulk-comment-note')).toContain('One comment is applied to each item.');
    type('[data-bulk-comment]', 'x'.repeat(501));
    expect(act().disabled).toBe(true);
  });

  it('asks for the count typed back only above 25 items', () => {
    const few = open('approve', 25, r => of(answer(r, { done: done(25) })));
    expect(few.q('[data-bulk-confirm]')).toBeNull();
    expect(few.act().disabled).toBe(false);
    const many = open('approve', 30, r => of(answer(r, { done: done(26), skipped: [{ id: 1, reason: 'already-decided' }] })));
    expect(many.q('label[for="bulk-confirm"]')!.textContent!.trim()).toBe('Type 26 to confirm');
    expect(many.act().disabled).toBe(true);
    many.type('[data-bulk-confirm]', '30');
    expect(many.act().disabled).toBe(true);
    many.type('[data-bulk-confirm]', '26');
    expect(many.act().disabled).toBe(false);
  });

  it('decides with the dry run\'s bulk id, and a retry after a lost answer reuses it', () => {
    let calls = 0;
    const { send, act, fixture, q, text } = open('approve', 2, r => {
      calls++;
      if (r.dryRun) return of(answer(r, { done: done(2) }));
      if (calls === 2) return throwError(() => ({ status: 0 }));
      return of(answer(r, { done: done(1), failed: [{ id: 8301, label: 'Run #8301', message: 'Could not be recorded: timeout.' }] }));
    });
    act().click();
    fixture.detectChanges();
    expect(text('[data-bulk-send-failed]')).toContain('could not be reached');
    q<HTMLButtonElement>('[data-bulk-retry]')!.click();
    fixture.detectChanges();
    const ids = send.mock.calls.map(c => c[1].bulkId);
    expect(new Set(ids).size).toBe(1);
    expect(send.mock.calls.map(c => c[1].dryRun)).toEqual([true, false, false]);
    expect(text('[data-bulk-result-line]')).toBe('1 approved, 1 failed.');
  });

  it('reports item by item with links, and Done closes with the answer', () => {
    const { act, fixture, el, q, ref, text } = open('reject', 3, r => of(answer(r, {
      done: done(1), skipped: [{ id: 8302, label: 'Run #8302', reason: 'already-decided', message: 'This run\'s results are already approved.' }],
      failed: [{ id: 8303, label: 'Run #8303', message: 'Could not be recorded: timeout.' }] })));
    const box = q<HTMLTextAreaElement>('[data-bulk-comment]')!;
    box.value = 'Duplicated rows';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    act().click();
    fixture.detectChanges();
    expect(text('[data-bulk-result-line]')).toBe('1 rejected, 1 skipped, 1 failed.');
    expect(el.querySelector('[data-bulk-result-done] a')!.getAttribute('href')).toBe('/pipelines/schedules/2905/runs/8300/logs');
    expect(text('[data-bulk-result-skipped]')).toContain('already approved');
    expect(text('[data-bulk-result-failed]')).toContain('timeout');
    q<HTMLButtonElement>('[data-bulk-done]')!.click();
    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false, done: [expect.objectContaining({ id: 8300 })] }));
  });

  it('says so when nothing can be decided, and when the dry run itself is refused', () => {
    const none = open('approve', 2, r => of(answer(r, { skipped: [{ id: 1, reason: 'bulk-off' }, { id: 2, reason: 'bulk-off' }] })));
    expect(none.text('[data-bulk-plan-line]')).toBe('None of the 2 runs can be approved.');
    expect(none.act().disabled).toBe(true);
    expect(none.text('[data-bulk-skipped]')).toContain('Bulk approve is off in this workspace');
    const refused = open('approve', 2, () => throwError(() => ({ status: 429, error: { status: 'ERROR', message: 'Too many bulk decisions in a minute; wait a moment and try again.' } })));
    expect(refused.text('[data-bulk-check-failed]')).toContain('Too many bulk decisions');
    expect(refused.act().disabled).toBe(true);
  });
});
