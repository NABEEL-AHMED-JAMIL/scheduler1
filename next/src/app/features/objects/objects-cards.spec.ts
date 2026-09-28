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
 * The Object Browser's connection cards (owner, 2026-09-28): each says what the connection is and
 * whose it is -- bucket, region, how its last test went, and who made it when -- not only a name.
 */
const FULL: BucketSummary = {
  label: 'UI-REVIEW LocalStack S3', bucket: 'ui-review-s3', provider: 'S3',
  bucketName: 'ui-review-2924', region: 'us-east-1', description: 'Uploads from the review.',
  connectionStatus: 'SUCCESS', dateCreated: '2026-09-24T22:39:41', createdByName: 'Claude Demo Admin',
};
const BARE: BucketSummary = { label: 'Archive', bucket: 'archive', provider: 'MINIO', connectionStatus: 'FAILED' };

function cards(list: BucketSummary[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', data: null })), post: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', message: '', data: list }), listObjects: vi.fn() } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester', isTenantAdmin: () => true } },
    ],
  });
  const fixture = TestBed.createComponent(Objects);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return [...el.querySelectorAll<HTMLElement>('.connection-card')].map(card => card.textContent!.replace(/\s+/g, ' ').trim());
}

describe('Object Browser connection cards', () => {
  it('say what the connection is, how its last test went, and who made it when', () => {
    const [card] = cards([FULL]);
    expect(card).toContain('UI-REVIEW LocalStack S3');
    expect(card).toContain('ui-review-2924');
    expect(card).toContain('us-east-1');
    expect(card).toContain('Uploads from the review.');
    expect(card).toContain('Connected');
    expect(card).toContain('Claude Demo Admin');
    expect(card).toContain('24 Sep 2026');
  });

  it('say when the last test failed, and leave out what the server did not send', () => {
    const [card] = cards([BARE]);
    expect(card).toContain('Last test failed');
    expect(card).not.toContain('Created by');
    expect(card).not.toContain('Region');
  });
});
