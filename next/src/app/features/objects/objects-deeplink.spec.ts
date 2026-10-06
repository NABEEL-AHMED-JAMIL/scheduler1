import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { Objects } from './objects';
import { AuthService } from '../../core/auth/auth.service';
import { BucketSummary, StorageService } from './storage.service';

/**
 * UI review jobs#19: Jobs' "View in bucket", the run-log path links and the Converter all link
 * here with ?bucket=&prefix=. When no connection in the workspace serves that bucket, the link
 * was dropped without a word and the reader landed on the connection picker, not knowing why.
 */
const S3: BucketSummary = { label: 'UI review S3', bucket: 'ui-review-s3', provider: 'S3' };
const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });

function view(query: Record<string, string>, buckets: BucketSummary[] = [S3]) {
  const listObjects = vi.fn(() => of(OK({ objects: [] })));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: { get: vi.fn(() => of(OK(null))), post: vi.fn(() => of(OK(null))) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      { provide: StorageService, useValue: { buckets: () => of(OK(buckets)), listObjects } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester', isTenantAdmin: () => true } },
    ],
  });
  const fixture = TestBed.createComponent(Objects);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, objects: fixture.componentInstance, listObjects, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

describe('Object Browser link to a bucket this workspace does not serve', () => {
  const link = { bucket: 'etl-bucket', prefix: 'tenant-2924/ui-review/inputs/' };

  it('says which bucket the link wanted, and opens nothing', () => {
    const { text, objects, listObjects } = view(link);
    expect(text()).toContain('No connection in this workspace serves etl-bucket');
    expect(text()).toContain('etl-bucket/tenant-2924/ui-review/inputs/');
    expect(listObjects).not.toHaveBeenCalled();
    expect(objects.bucket()).toBe('');
    // The picker is still there to choose from.
    expect(text()).toContain('UI review S3');
  });

  it('says so above the empty card too', () => {
    const { text } = view(link, []);
    expect(text()).toContain('No connection in this workspace serves etl-bucket');
    expect(text()).toContain('No storage is connected yet');
  });

  it('drops the notice once a connection is picked', () => {
    const { fixture, el, text, objects } = view(link);
    const card = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('UI review S3'))!;
    card.click();
    fixture.detectChanges();
    expect(objects.bucket()).toBe('ui-review-s3');
    objects.onBucketChange('');
    fixture.detectChanges();
    expect(text()).not.toContain('No connection in this workspace serves');
  });

  it('still opens a bucket the workspace does serve, with no notice', () => {
    const { objects, listObjects, text } = view({ bucket: 'ui-review-s3', prefix: 'inputs/' });
    expect(objects.bucket()).toBe('ui-review-s3');
    expect(listObjects).toHaveBeenCalled();
    expect(text()).not.toContain('No connection in this workspace serves');
  });
});
