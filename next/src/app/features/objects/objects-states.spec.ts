import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { Objects } from './objects';
import { AuthService } from '../../core/auth/auth.service';
import { BucketSummary, ObjectSummary, StorageService } from './storage.service';

/**
 * Audit 09-22, Object Browser: what the screen says while things load or fail, and the
 * controls a keyboard or a screen reader meets.
 */
const MINIO: BucketSummary = { label: 'MinIO Main', bucket: 'minio-main', provider: 'MINIO' };
const S3: BucketSummary = { label: 'Archive', bucket: 'archive', provider: 'S3' };
const SALES: ObjectSummary = { name: 'sales.csv', key: 'daily/sales.csv', folder: false, size: 2048, lastModified: '2026-09-01T10:00:00Z' };
const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });

function view(opts: { buckets?: () => Observable<unknown>; list?: () => Observable<unknown>; share?: ReturnType<typeof vi.fn> } = {}) {
  const storage = {
    buckets: opts.buckets ?? (() => of(OK([MINIO, S3]))),
    listObjects: opts.list ?? (() => of(OK({ objects: [SALES] }))),
    share: opts.share ?? vi.fn(() => of(OK(null))),
  };
  const http = { get: vi.fn(() => of(OK(null))), post: vi.fn(() => of(OK(null))) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: http },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: StorageService, useValue: storage },
      { provide: Dialog, useValue: { open: (_c: unknown, config?: { data?: any }) => {
        if (config?.data?.send) { const typed = { recipientEmail: 'a@b.example', message: '' }; config.data.send(typed).subscribe(); return { closed: of(typed) }; }
        return { closed: of(true) };
      } } },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester', isTenantAdmin: () => true } },
    ],
  });
  const fixture = TestBed.createComponent(Objects);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, objects: fixture.componentInstance, storage, http, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

describe('Object Browser connection list', () => {
  it('says it is loading rather than that no storage is connected', () => {
    const { text, el } = view({ buckets: () => NEVER });
    expect(text()).not.toContain('No storage is connected yet');
    expect(el.querySelector('.spinner')).not.toBeNull();
  });

  it('says the list could not be read, offers Try again, and does not claim nothing is connected', () => {
    let calls = 0;
    const { text, el, fixture } = view({ buckets: () => (calls++ === 0 ? of({ status: 'ERROR', message: 'Storage service is down.' }) : of(OK([MINIO]))) });
    expect(text()).toContain('Storage service is down.');
    expect(text()).not.toContain('No storage is connected yet');
    const retry = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Try again'))!;
    retry.click();
    fixture.detectChanges();
    expect(text()).toContain('MinIO Main');
  });

  it('says so after an HTTP failure too', () => {
    const { text } = view({ buckets: () => throwError(() => ({ error: { message: 'Gateway timeout.' } })) });
    expect(text()).toContain('Gateway timeout.');
    expect(text()).not.toContain('No storage is connected yet');
  });

  it('still shows the empty card for a list that really is empty', () => {
    const { text } = view({ buckets: () => of(OK([])) });
    expect(text()).toContain('No storage is connected yet');
  });
});

describe('Object Browser listing', () => {
  function opened(list?: () => Observable<unknown>) {
    const v = view({ list });
    v.objects.onBucketChange(MINIO.bucket);
    v.fixture.detectChanges();
    return v;
  }

  it('shows a spinner on the first load, and blurs the old rows (not live) while the next folder loads', () => {
    let pending = false;
    const v = opened(() => (pending ? NEVER : of(OK({ objects: [SALES] }))));
    pending = true;
    v.objects.load();
    v.fixture.detectChanges();
    const loader = v.el.querySelector('app-blur-loader .blur-loader');
    expect(loader?.classList).toContain('is-loading');
    expect(loader?.querySelector('table')).not.toBeNull();

    const first = view({ list: () => NEVER });
    first.objects.onBucketChange(MINIO.bucket);
    first.fixture.detectChanges();
    expect(first.el.querySelector('.spinner')).not.toBeNull();
  });

  it('marks a failed listing with the alert icon', () => {
    const v = opened(() => of({ status: 'ERROR', message: 'Access denied.' }));
    expect(v.text()).toContain('Access denied.');
    expect(v.el.querySelector('app-icon[name="alert"]')).not.toBeNull();
  });

  it('with only a date range set, says nothing matches rather than that the folder is empty', () => {
    const v = opened();
    v.objects.dateFrom.set('2027-01-01');
    v.fixture.detectChanges();
    expect(v.text()).not.toContain('This folder is empty');
    expect(v.text()).toContain('No files match these filters.');
  });

  it('forgets the date range when the connection changes', () => {
    const v = opened();
    v.objects.dateFrom.set('2026-01-01');
    v.objects.dateTo.set('2026-02-01');
    v.objects.onBucketChange(S3.bucket);
    expect(v.objects.dateFrom()).toBe('');
    expect(v.objects.dateTo()).toBe('');
  });

  it('keeps the upload inputs reachable by keyboard (sr-only, not display:none)', () => {
    const v = opened();
    const inputs = [...v.el.querySelectorAll<HTMLInputElement>('input[type="file"]')];
    expect(inputs.length).toBe(2);
    for (const input of inputs) {
      expect(input.classList).not.toContain('hidden');
      expect(input.classList).toContain('sr-only');
    }
  });

  it('names the name filter and the actions column, and says whether insights are open', () => {
    const v = opened();
    const filter = v.el.querySelector<HTMLInputElement>('.search-field input')!;
    expect(filter.getAttribute('aria-label')).toBe('Filter by name');
    const heads = [...v.el.querySelectorAll('thead th')];
    expect(heads[heads.length - 1].textContent!.trim()).toBe('Actions');
    const insights = [...v.el.querySelectorAll('button')].find(b => b.textContent!.includes('Insights'))!;
    expect(insights.getAttribute('aria-expanded')).toBe('false');
  });

  it('refreshes with a spinning icon rather than a label that turns into "Loading…"', () => {
    const v = opened();
    const refresh = [...v.el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Refresh')!;
    expect(refresh.querySelector('app-icon[name="refresh"]')).not.toBeNull();
  });

  it('keeps btn-danger for the confirm: bulk Delete is a default button with the crit intent', () => {
    const v = opened();
    v.objects.selected.set(new Set([SALES.key]));
    v.fixture.detectChanges();
    const del = [...v.el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Delete 1')!;
    expect(del.classList).not.toContain('btn-danger');
    expect(del.classList).toContain('btn-intent-crit');
  });

  it('writes sizes with the console formatter everywhere on the screen', () => {
    const v = opened();
    expect(v.objects.humanSize(2048)).toBe('2.0 KB');
    const cells = [...v.el.querySelectorAll('tbody td')].map(td => td.textContent!.trim());
    expect(cells).toContain('2.0 KB');
  });

  it('emails through the storage service, like every other request on the screen', () => {
    const v = opened();
    v.objects.share(SALES);
    expect(v.storage.share).toHaveBeenCalledWith(MINIO.bucket, [SALES.key], 'a@b.example', '');
    expect(v.http.post).not.toHaveBeenCalled();
  });
});
