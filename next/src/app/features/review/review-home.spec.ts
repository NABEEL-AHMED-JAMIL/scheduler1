import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TaskCountService } from '../workflows/task-count.service';
import type { InboxTask } from '../workflows/workflows.api';
import type { Extraction } from '../documents/documents.model';
import { BulkReviewApi } from '../../shared/ui/bulk/bulk-review.api';
import { BulkPanel } from '../../shared/ui/bulk/bulk-panel';
import { ReviewHome } from './review-home';
import { ReviewItemPanel } from './review-item-panel';
import { linkOf, sendMixed } from './review-home.model';
import { ReviewItem, uidOf } from './review-sources';

/**
 * UX review DR2 (2026-10-13): Review › All waiting -- approvals, runs and documents in one list, filtered by kind, search
 * and who it waits on; a row opens its detail on the right; picked rows are decided together, each kind by its service.
 */

const task = (id: number, over: Partial<InboxTask> = {}): InboxTask => ({
  id, instanceId: id, stepKey: 'approve', stepType: 'approval', name: 'Approve the visit', assigneeKind: 'group', state: 'Open',
  requestTitle: `Synthetic visit #${id}`, workflowName: 'Visit approval', createdAt: '2026-10-13T12:00:00+00:00', ...over,
});
const doc = (extractionId: number, over: Partial<Extraction> = {}): Extraction => ({
  extractionId, ocrDocumentId: 1045, status: 'Review', documentTypeName: 'Invoice', revision: 3, reviewCount: 2, fieldCount: 9,
  dateFinished: '2026-10-13T03:10:47.871+00:00', ...over,
});

function screen(opts: { admin?: boolean; tasks?: boolean; documents?: boolean; tenantId?: number | null } = {}) {
  const opened: { component: unknown; data: unknown }[] = [];
  const refresh = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ReviewHome],
    providers: [
      provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: {
        canOpen: (p: string) => p === 'task-inbox' ? opts.tasks ?? true : p === 'document-review' ? opts.documents ?? true : false,
        isTenantAdmin: () => !!opts.admin, user: signal({ appUserId: 4641, tenantId: opts.tenantId === undefined ? 2960 : opts.tenantId }) } },
      { provide: TaskCountService, useValue: { refresh } },
      { provide: Dialog, useValue: { open: (component: unknown, config: { data: unknown }) => { opened.push({ component, data: config.data }); return { closed: of(undefined) }; } } },
    ],
  });
  const fixture = TestBed.createComponent(ReviewHome);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController), opened, refresh };
}

/** Every pending call answered as the services answer them. */
function answer(s: ReturnType<typeof screen>, data: { mine?: InboxTask[]; groups?: InboxTask[]; docs?: Extraction[]; count?: number } = {}) {
  for (const r of s.http.match(() => true)) {
    const url = r.request.url;
    if (url.endsWith('/count')) r.flush({ status: 'SUCCESS', data: { mine: data.count ?? (data.mine?.length ?? 0), groups: data.groups?.length ?? 0, total: 0, overdue: 0 } });
    else if (url.endsWith('/mine')) r.flush({ status: 'SUCCESS', data: data.mine ?? [] });
    else if (url.endsWith('/groups')) r.flush({ status: 'SUCCESS', data: data.groups ?? [] });
    else if (url.includes('review/waiting')) r.flush({ status: 'SUCCESS', data: { runs: [], more: false } });
    else if (url.endsWith('/queue')) r.flush({ status: 'SUCCESS', data: { items: data.docs ?? [], total: (data.docs ?? []).length } });
    else if (url.endsWith('documentOcr.json/fetchAll')) r.flush({ status: 'SUCCESS', data: [{ ocrDocumentId: 1045, sourceKey: 'inbox/invoice-0412.pdf' }] });
  }
  s.fixture.detectChanges();
}

const rows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('tr[data-item]'));

describe('Review › All waiting', () => {
  // 2026-10-20: as the platform administrator (no workspace) mine, groups and count each answered 400 "Pick a workspace".
  it('reads nothing for a sign-in with no workspace, and says how to open one', () => {
    const s = screen({ admin: false, tenantId: null });
    expect(s.http.match(() => true)).toEqual([]);
    expect(s.el.querySelector('[data-test="needs-workspace"]')?.textContent).toContain('Review is a workspace\'s, and this sign-in has none.');
    expect(s.el.querySelector('[data-test="needs-workspace"] a')?.getAttribute('href')).toBe('/platform/workspaces');
    expect(s.el.querySelector('[data-test="review-list"]')).toBeNull();
    expect(s.el.querySelector('[role="alert"]')).toBeNull();
  });

  it('lists approvals and documents together, each with what, from, since, who and age', () => {
    const s = screen();
    answer(s, { groups: [task(7)], docs: [doc(1133)] });
    const list = rows(s.el);
    expect(list.map(r => r.getAttribute('data-item'))).toEqual(['document:1133', 'approval:7']);
    expect(list[0].textContent).toContain('invoice-0412.pdf');
    expect(list[0].textContent).toContain('Invoice');
    expect(list[0].textContent).toContain('Any reviewer');
    expect(list[1].textContent).toContain('Synthetic visit #7');
    expect(list[1].textContent).toContain('Your groups');
    expect(s.el.querySelector('[data-test="review-shown"]')?.textContent).toContain('2 waiting');
    expect(s.el.querySelector('.page')?.getAttribute('data-load-ms')).not.toBeNull();
  });

  it('offers a kind only to whoever may open it, and narrows to it', () => {
    const s = screen({ tasks: false });
    answer(s, { docs: [doc(1), doc(2)] });
    expect(Array.from(s.el.querySelectorAll('[data-kind]')).map(b => b.getAttribute('data-kind'))).toEqual(['', 'document']);
    expect(s.http.match(r => r.url.includes('taskInbox'))).toEqual([]);

    const t = screen();
    answer(t, { mine: [task(1)], docs: [doc(2)] });
    (t.el.querySelector('[data-kind="approval"]') as HTMLButtonElement).click();
    t.fixture.detectChanges();
    expect(rows(t.el).map(r => r.getAttribute('data-item'))).toEqual(['approval:1']);
  });

  it('searches what, from and who, and says nothing matches with the way back', () => {
    const s = screen();
    answer(s, { mine: [task(1), task(2, { requestTitle: 'Synthetic referral #2', workflowName: 'Referrals' })] });
    s.component.query.set('referral');
    s.fixture.detectChanges();
    expect(rows(s.el).map(r => r.getAttribute('data-item'))).toEqual(['approval:2']);
    s.component.query.set('nothing like it');
    s.fixture.detectChanges();
    expect(s.el.querySelector('[data-test="review-empty"]')?.textContent).toContain('Nothing matches these filters');
  });

  it('says plainly when nothing waits', () => {
    const s = screen();
    answer(s);
    expect(s.el.querySelector('[data-test="review-empty"]')?.textContent).toContain('Nothing is waiting for your review');
  });

  it('picks only what the reader may decide, and the page box picks those', () => {
    const s = screen();
    answer(s, { mine: [task(1), task(2, { stepType: 'task' })], docs: [doc(3, { claimActive: true, claimedBy: 99, claimedByName: 'Sam' })] });
    const boxes = Array.from(s.el.querySelectorAll<HTMLInputElement>('input[data-bulk-pick]'));
    expect(boxes.filter(b => !b.disabled).map(b => b.getAttribute('data-bulk-pick'))).toEqual([String(uidOf('approval', 1))]);
    (s.el.querySelector('input[data-bulk-page]') as HTMLInputElement).click();
    s.fixture.detectChanges();
    expect(s.component.bulk.count()).toBe(1);
    expect(s.el.querySelector('[data-bulk-count]')?.textContent).toContain('1 selected');
    // Another kind, search or filter starts the selection again.
    s.component.kind.set('document');
    s.fixture.detectChanges();
    expect(s.component.bulk.count()).toBe(0);
  });

  it('opens a row\'s detail on the right, and its Approve the bulk panel for that one item', () => {
    const s = screen();
    answer(s, { mine: [task(1)] });
    rows(s.el)[0].click();
    expect(s.opened[0].component).toBe(ReviewItemPanel);
    const dialog = TestBed.inject(Dialog) as unknown as { open: (c: unknown, cfg: { data: unknown }) => { closed: unknown } };
    dialog.open = (component, config) => { s.opened.push({ component, data: config.data }); return { closed: of(component === ReviewItemPanel ? { act: 'approve' } : undefined) }; };
    rows(s.el)[0].click();
    expect(s.opened.map(o => o.component)).toEqual([ReviewItemPanel, ReviewItemPanel, BulkPanel]);
    expect((s.opened[2].data as { action: string; rows: ReviewItem[] })).toMatchObject({ action: 'approve' });
    expect((s.opened[2].data as { rows: ReviewItem[] }).rows.map(r => r.id)).toEqual([1]);
  });

  it('reads the list and the menu\'s count again after a decision', () => {
    const s = screen();
    answer(s, { mine: [task(1)] });
    s.component.decided({ bulkId: 'b', action: 'approve', dryRun: false, requested: 1, done: [{ id: uidOf('approval', 1) }], skipped: [], failed: [] });
    expect(s.refresh).toHaveBeenCalled();
    expect(s.http.match(r => r.url.endsWith('/mine')).length).toBe(1);
  });

  it('lays out 60 waiting items in one pass', () => {
    const s = screen();
    const started = performance.now();
    answer(s, { mine: Array.from({ length: 30 }, (_, i) => task(i + 1)), docs: Array.from({ length: 30 }, (_, i) => doc(i + 100)) });
    expect(rows(s.el).length).toBe(60);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('Review: one bulk decision over mixed kinds', () => {
  const item = (via: ReviewItem['via'], id: number, extra: Partial<ReviewItem> = {}): ReviewItem => ({
    uid: uidOf(via === 'document' ? 'document' : via === 'core' ? 'run' : 'approval', id), kind: via === 'document' ? 'document' : via === 'core' ? 'run' : 'approval',
    via, id, title: `#${id}`, from: 'From', since: null, due: null, overdue: false, waitsOn: 'You', pickable: true, whyNot: '', ...extra,
  });

  it('sends each part to its own service with one bulk id, and answers under the rows\' own ids', async () => {
    const api = {
      tasks: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { bulkId: 'b', action: 'approve', dryRun: true, requested: 1, done: [{ id: 7 }], skipped: [], failed: [] } })),
      runs: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { bulkId: 'b', action: 'approve', dryRun: true, requested: 1, done: [], skipped: [{ id: 8311, reason: 'bulk-off' }], failed: [] } })),
      documents: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { bulkId: 'b', action: 'approve', dryRun: true, requested: 1, done: [{ id: 1133, label: 'invoice' }], skipped: [], failed: [] } })),
    } as unknown as BulkReviewApi;
    const rows = [item('task', 7), item('core', 8311), item('document', 1133, { doc: { revision: 4 } as Extraction })];
    const answer = await firstValueFrom(sendMixed(api, rows, { action: 'approve', comment: null, bulkId: 'b', dryRun: true }));
    expect(api.tasks).toHaveBeenCalledWith({ taskIds: [7] }, expect.objectContaining({ bulkId: 'b', dryRun: true }));
    expect(api.runs).toHaveBeenCalledWith([8311], expect.objectContaining({ bulkId: 'b' }));
    expect(api.documents).toHaveBeenCalledWith([1133], { '1133': 4 }, expect.objectContaining({ bulkId: 'b' }));
    expect(answer.data!.requested).toBe(3);
    expect(answer.data!.done.map(i => i.id)).toEqual([uidOf('approval', 7), uidOf('document', 1133)]);
    expect(answer.data!.skipped).toEqual([expect.objectContaining({ id: uidOf('run', 8311), reason: 'bulk-off', label: '#8311' })]);
  });

  it('answers a part its service refused as failed, and still sends the others', async () => {
    const api = {
      tasks: vi.fn(() => throwError(() => ({ status: 403, error: { message: 'Task inbox is not part of your access.' } }))),
      documents: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { bulkId: 'b', action: 'reject', dryRun: false, requested: 1, done: [{ id: 5 }], skipped: [], failed: [] } })),
    } as unknown as BulkReviewApi;
    const answer = await firstValueFrom(sendMixed(api, [item('task', 1), item('document', 5)], { action: 'reject', comment: 'x', bulkId: 'b', dryRun: false }));
    expect(answer.data!.failed).toEqual([expect.objectContaining({ id: uidOf('approval', 1), message: 'Task inbox is not part of your access.' })]);
    expect(answer.data!.done.map(i => i.id)).toEqual([uidOf('document', 5)]);
  });

  it('links each kind to the page where it is decided on its own', () => {
    expect(linkOf(item('task', 7))).toEqual({ path: ['/review/approvals'], query: { task: '7' } });
    expect(linkOf(item('core', 8311, { jobId: 2907, runId: 8311 }))).toEqual({ path: ['/pipelines/schedules', 2907, 'runs', 8311] });
    expect(linkOf(item('document', 1133))).toEqual({ path: ['/review/documents', 1133] });
  });
});
