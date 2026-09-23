import { describe, it, expect } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import { StorageService } from '../objects/storage.service';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ReportDestinationDialog, ReportDestinationOptions } from './report-destination-dialog';

const CONNECTIONS = [
  { label: 'Reports archive', bucket: 'reports-archive', provider: 'MINIO' },
  { label: 'Claims', bucket: 'claims', provider: 'S3' },
];

function dialogFor(kind: ReportDestinationOptions['kind'],
                   buckets: () => Observable<any> = () => of({ status: 'SUCCESS', data: CONNECTIONS })) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { kind } },
      { provide: DialogRef, useValue: { close: () => {} } },
      { provide: StorageService, useValue: { buckets } },
    ],
  });
  return TestBed.runInInjectionContext(() => new ReportDestinationDialog());
}

/**
 * Replaces the two sequential window.prompt() calls Save/Submit used to make -- unstyled,
 * blocking the tab, and the one input flow in the app that didn't go through a real dialog.
 */
describe('ReportDestinationDialog', () => {
  it('defaults the folder but not the bucket, so Save waits for a bucket of the workspace\'s own', () => {
    // There is no platform bucket to fall back on: the one the platform keeps is for pictures
    // and Kafka key material, and a report belongs in a connection the workspace added itself.
    const dialog = dialogFor('bucket');
    expect(dialog.bucket()).toBe('');
    expect(dialog.folder()).toBe('reports');
    expect(dialog.valid()).toBe(false);
    dialog.bucket.set('reports-archive');
    expect(dialog.valid()).toBe(true);
  });

  it('is invalid for a bucket save once the bucket field is cleared', () => {
    const dialog = dialogFor('bucket');
    dialog.bucket.set('  ');
    expect(dialog.valid()).toBe(false);
  });

  it('falls back to "reports" if the folder is submitted blank', () => {
    const dialog = dialogFor('bucket');
    dialog.bucket.set('reports-archive');
    dialog.folder.set('  ');
    let result: any;
    (dialog.ref as any).close = (value: any) => { result = value; };
    dialog.submit({ preventDefault: () => {} } as Event);
    expect(result).toEqual({ bucket: 'reports-archive', folder: 'reports', submitUrl: '' });
  });

  it('starts invalid for a submit-endpoint with no URL typed', () => {
    const dialog = dialogFor('submit');
    expect(dialog.valid()).toBe(false);
  });

  it('rejects a submit URL with no http(s) scheme', () => {
    const dialog = dialogFor('submit');
    dialog.submitUrl.set('example.com/hook');
    expect(dialog.valid()).toBe(false);
  });

  it('accepts a well-formed https submit URL and closes with it', () => {
    const dialog = dialogFor('submit');
    dialog.submitUrl.set('https://example.com/hook');
    expect(dialog.valid()).toBe(true);
    let result: any;
    (dialog.ref as any).close = (value: any) => { result = value; };
    dialog.submit({ preventDefault: () => {} } as Event);
    expect(result.submitUrl).toBe('https://example.com/hook');
  });

  it('does not close the dialog when submitted while invalid', () => {
    const dialog = dialogFor('submit');
    let closed = false;
    (dialog.ref as any).close = () => { closed = true; };
    dialog.submit({ preventDefault: () => {} } as Event);
    expect(closed).toBe(false);
  });
});

/**
 * The bucket was a free-text box with a made-up placeholder. A typo surfaced only as a toast after
 * the dialog had closed; the workspace's connections were one call away, as the Object Browser
 * offers them.
 */
describe('ReportDestinationDialog bucket choice', () => {
  it('offers the workspace\'s own connections', () => {
    const dialog = dialogFor('bucket');
    expect(dialog.bucketOptions().map(o => o.value)).toEqual(['reports-archive', 'claims']);
  });

  it('will not save into a bucket that is not one of them', () => {
    const dialog = dialogFor('bucket');
    dialog.bucket.set('reprots-archive');
    expect(dialog.valid()).toBe(false);
  });

  it('says so when the connections cannot be read, and saves nowhere', () => {
    const dialog = dialogFor('bucket', () => throwError(() => ({ error: { message: 'Storage is unavailable.' } })));
    expect(dialog.bucketsError()).toBe('Storage is unavailable.');
    dialog.bucket.set('reports-archive');
    expect(dialog.valid()).toBe(false);
  });
});
