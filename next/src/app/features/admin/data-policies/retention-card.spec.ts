import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { RetentionCard } from './retention-card';
import { RETENTION_VIEW } from './retention.fixtures';

/**
 * MIG-354: the Retention section of Data policies -- each class's days and last result, the holds, the preview, a class
 * paused for confirmation, "Run now"; shown to a workspace administrator (and a platform administrator for the workspace
 * picked), never to another member.
 */
function render(opts: { admin: boolean; platform?: boolean; tenantId?: number | null; confirm?: boolean }) {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const dialog = { open: vi.fn(() => ({ closed: of(opts.confirm ?? true) })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
      { provide: ToastService, useValue: toast },
      { provide: Dialog, useValue: dialog },
      { provide: AuthService, useValue: { isTenantAdmin: () => opts.admin, isPlatformAdmin: () => !!opts.platform,
        user: signal({ appUserId: 4639, tenantId: opts.platform ? null : 2924 }) } }],
  });
  const fixture = TestBed.createComponent(RetentionCard);
  if (opts.tenantId !== undefined) fixture.componentRef.setInput('tenantId', opts.tenantId);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  const answer = (data = RETENTION_VIEW) => {
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/setting.json/retention')).flush({ status: 'SUCCESS', message: '', data });
    fixture.detectChanges();
  };
  const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { fixture, el, http, toast, dialog, answer, text, refresh: () => fixture.detectChanges() };
}

describe('RetentionCard', () => {
  it('shows each class with its days and its last pass, and the active holds only', () => {
    const { el, answer, text } = render({ admin: true });
    answer();
    expect(text(el.querySelector('[data-retention-state]'))).toBe('On');
    const rows = Array.from(el.querySelectorAll('[data-retention-table] tbody tr'));
    expect(rows.map(r => r.getAttribute('data-class'))).toEqual(['RUN_OUTPUTS', 'RUN_LOGS', 'NOTIFICATIONS', 'ANALYTICS', 'AUDIT']);
    expect(text(el.querySelector('[data-class="RUN_OUTPUTS"] [data-keep]'))).toBe('90 days');
    expect(text(el.querySelector('[data-class="NOTIFICATIONS"] [data-keep]'))).toBe('Forever');
    expect(text(el.querySelector('[data-class="ANALYTICS"] [data-keep]'))).toBe('Bounded by the platform');
    expect(text(el.querySelector('[data-class="AUDIT"] [data-keep]'))).toContain('6 years');
    expect(text(el.querySelector('[data-class="AUDIT"] [data-keep]'))).toContain('At least 2,190 days');
    expect(text(el.querySelector('[data-class="RUN_OUTPUTS"] [data-last]'))).toContain('Removed 3, 3.0 KB');
    expect(text(el.querySelector('[data-class="AUDIT"]'))).toContain('File downloads and this policy');
    const holds = Array.from(el.querySelectorAll('[data-hold]'));
    expect(holds.length).toBe(1);
    expect(text(holds[0])).toContain('Pipeline #3001');
    expect(text(holds[0])).toContain('Records request 12');
  });

  it('confirms a paused class for the count it showed', async () => {
    const { el, http, toast, dialog, answer, refresh } = render({ admin: true });
    answer();
    const confirm = el.querySelector<HTMLButtonElement>('[data-class="RUN_LOGS"] [data-retention-confirm]')!;
    expect(confirm.textContent).toContain('Confirm 30 of 40');
    confirm.click();
    await Promise.resolve();
    expect(dialog.open).toHaveBeenCalled();
    const sent = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/setting.json/retention/confirm'));
    expect(sent.request.body).toEqual({ dataClass: 'RUN_LOGS', expectedCount: 30 });
    sent.flush({ status: 'SUCCESS', message: '', data: { dataClass: 'RUN_LOGS', confirmedCount: 30, total: 40,
      message: 'Run logs: an administrator confirmed removing 30 of 40 item(s) older than 30 day(s).' } });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('confirmed removing 30 of 40'));
    answer();
    refresh();
  });

  it('previews what a pass would remove now, class by class', () => {
    const { el, http, answer, text, refresh } = render({ admin: true });
    answer();
    expect(text(el.querySelector('[data-class="RUN_OUTPUTS"] [data-now]'))).toBe('Workspace, pipeline and run holds');
    el.querySelector<HTMLButtonElement>('[data-retention-preview]')!.click();
    http.expectOne(r => r.method === 'POST' && r.url.endsWith('/setting.json/retention/preview')).flush({ status: 'SUCCESS', message: '', data: {
      tenantId: 2924, enabled: true, at: '2026-10-13T16:00:00Z', items: 7, bytes: 2048, workspaceHold: false, pipelineHolds: 1, runHolds: 0,
      classes: [
        { dataClass: 'RUN_OUTPUTS', state: 'READY', keepDays: 90, cutoff: null, eligible: 4, total: 40, deleted: 0, bytes: 2048, oldest: '2024-01-02T18:00:00Z', note: null, finishedAt: null },
        { dataClass: 'RUN_LOGS', state: 'NEEDS_CONFIRMATION', keepDays: 30, cutoff: null, eligible: 3, total: 4, deleted: 0, bytes: null, oldest: null, note: null, finishedAt: null },
        { dataClass: 'NOTIFICATIONS', state: 'OFF', keepDays: null, cutoff: null, eligible: 0, total: 0, deleted: 0, bytes: null, oldest: null, note: null, finishedAt: null },
      ] } });
    refresh();
    expect(text(el.querySelector('[data-class="RUN_OUTPUTS"] [data-now]'))).toBe('4 of 40, 2.0 KB Oldest 2 Jan 2024');
    expect(text(el.querySelector('[data-class="RUN_LOGS"] [data-now]'))).toContain('Will need confirmation');
    expect(text(el.querySelector('[data-class="NOTIFICATIONS"] [data-now]'))).toBe('Kept forever');
    expect(text(el.querySelector('[data-retention-preview-summary]'))).toContain('it would remove 7 item(s) (2.0 KB)');
  });

  it('is not shown to a member who is not an administrator, and reads nothing', () => {
    const { el, http } = render({ admin: false });
    expect(el.querySelector('[data-retention]')).toBeNull();
    http.expectNone(r => r.url.includes('/setting.json/retention'));
  });

  it('reads the picked workspace for a platform administrator, and nothing before', () => {
    const none = render({ admin: true, platform: true, tenantId: null });
    expect(none.el.querySelector('[data-retention]')).toBeNull();
    none.http.expectNone(r => r.url.includes('/setting.json/retention'));
    const picked = render({ admin: true, platform: true, tenantId: 2924 });
    const call = picked.http.expectOne(r => r.method === 'GET' && r.url.endsWith('/setting.json/retention'));
    expect(call.request.params.get('tenantId')).toBe('2924');
  });

  it('runs a pass only once confirmed, and not while retention is off', async () => {
    const off = render({ admin: true });
    off.answer({ ...RETENTION_VIEW, enabled: false });
    expect(off.el.querySelector<HTMLButtonElement>('[data-retention-run]')!.disabled).toBe(true);

    const on = render({ admin: true });
    on.answer();
    on.el.querySelector<HTMLButtonElement>('[data-retention-run]')!.click();
    await Promise.resolve();
    on.http.expectOne(r => r.method === 'POST' && r.url.endsWith('/setting.json/retention/run'))
      .flush({ status: 'SUCCESS', message: '', data: { passId: 1005, state: 'RUNNING' } });
    expect(on.toast.info).toHaveBeenCalledWith('Retention pass 1005 started.');
  });
});
