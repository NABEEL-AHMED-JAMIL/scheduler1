import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RetentionEditPanel } from './retention-edit-panel';
import { RETENTION_VIEW } from './retention.fixtures';

/** MIG-354: the retention edit panel -- the days checked as typed (the audit floor), a preview of these days, the save. */
function render(tenantId: number | null = null) {
  const ref = { close: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RetentionEditPanel],
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
      { provide: DIALOG_DATA, useValue: { view: RETENTION_VIEW, tenantId } },
      { provide: DialogRef, useValue: ref }],
  });
  const fixture = TestBed.createComponent(RetentionEditPanel);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  const type = (dataClass: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`[data-days="${dataClass}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, el, http, ref, type, refresh: () => fixture.detectChanges() };
}

describe('RetentionEditPanel', () => {
  it('starts from the saved days and keeps the platform-bounded class out of reach', () => {
    const { el } = render();
    expect(el.querySelector<HTMLInputElement>('[data-days="RUN_OUTPUTS"]')!.value).toBe('90');
    expect(el.querySelector<HTMLInputElement>('[data-days="NOTIFICATIONS"]')!.value).toBe('');
    expect(el.querySelector('[data-days="ANALYTICS"]')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('[data-test="retention-enabled"]')!.checked).toBe(true);
  });

  it('refuses audit days under the floor before anything is sent', () => {
    const { el, http, type } = render();
    type('AUDIT', '400');
    expect(el.textContent).toContain('At least 2,190 days');
    expect(el.querySelector<HTMLButtonElement>('[data-test="retention-save"]')!.disabled).toBe(true);
    http.expectNone(() => true);
  });

  it('previews the typed days, then saves them with the switch', () => {
    const { el, http, ref, type, refresh } = render(2924);
    type('NOTIFICATIONS', '180');
    el.querySelector<HTMLButtonElement>('[data-test="retention-edit-preview-btn"]')!.click();
    const preview = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/setting.json/retention/preview'));
    expect(preview.request.body).toEqual({ tenantId: 2924, classes: { RUN_OUTPUTS: 90, RUN_LOGS: 30, NOTIFICATIONS: 180, AUDIT: 2190 } });
    preview.flush({ status: 'SUCCESS', message: '', data: { tenantId: 2924, enabled: true, at: '2026-10-13T16:00:00Z', items: 12, bytes: 0,
      workspaceHold: false, pipelineHolds: 0, runHolds: 0, classes: [
        { dataClass: 'NOTIFICATIONS', state: 'READY', keepDays: 180, cutoff: null, eligible: 12, total: 547, deleted: 0, bytes: null, oldest: null, note: null, finishedAt: null },
      ] } });
    refresh();
    expect(el.querySelector('[data-test="retention-edit-preview"]')!.textContent).toContain('remove 12 item(s)');
    expect(el.querySelector('[data-class="NOTIFICATIONS"]')!.textContent).toContain('12 of 547');
    el.querySelector<HTMLInputElement>('[data-test="retention-enabled"]')!.click();
    refresh();
    el.querySelector<HTMLButtonElement>('[data-test="retention-save"]')!.click();
    const save = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/setting.json/retention'));
    expect(save.request.body).toEqual({ tenantId: 2924, enabled: false, classes: { RUN_OUTPUTS: 90, RUN_LOGS: 30, NOTIFICATIONS: 180, AUDIT: 2190 } });
    save.flush({ status: 'SUCCESS', message: 'Retention policy saved.', data: { ...RETENTION_VIEW, enabled: false, changes: ['Retention turned off.'] } });
    expect(ref.close).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('shows the service\'s refusal and stays open', () => {
    const { el, http, ref, refresh } = render();
    el.querySelector<HTMLButtonElement>('[data-test="retention-save"]')!.click();
    http.expectOne(r => r.method === 'POST' && r.url.endsWith('/setting.json/retention'))
      .flush({ status: 'ERROR', message: 'Audit records are kept at least 2190 days -- the platform\'s minimum.' }, { status: 400, statusText: 'Bad Request' });
    refresh();
    expect(el.querySelector('[data-test="retention-edit-error"]')!.textContent).toContain('2190 days — the platform');
    expect(ref.close).not.toHaveBeenCalled();
  });
});
