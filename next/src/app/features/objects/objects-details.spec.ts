import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { Objects } from './objects';
import { AuthService } from '../../core/auth/auth.service';
import { StorageService } from './storage.service';
import { FileDetails } from './file-details';

/** MIG-253: a file's row menu opens its details -- metadata, the run that wrote it, policy and expiry. */
describe('Object browser: a file\'s details', () => {
  it('opens the details panel beside the list with the file it was asked about', () => {
    const open = vi.fn(() => ({ closed: of(undefined) }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', data: null })), post: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: StorageService, useValue: { buckets: () => of({ status: 'SUCCESS', message: '', data: [] }), listObjects: vi.fn() } },
        { provide: Dialog, useValue: { open } },
        { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester', isTenantAdmin: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(Objects);
    const objects = fixture.componentInstance;
    objects.bucket.set('ui-review-s3');
    objects.details({ name: 'a.csv', key: 'data/a.csv', folder: false, size: 12, lastModified: '2026-09-29T12:00:00Z',
      contentType: 'text/csv' });
    expect(open).toHaveBeenCalledWith(FileDetails, expect.objectContaining({
      data: { bucket: 'ui-review-s3', key: 'data/a.csv', name: 'a.csv', size: 12, lastModified: '2026-09-29T12:00:00Z',
        contentType: 'text/csv' },
      panelClass: 'side-panel-host',
    }));
  });
});
