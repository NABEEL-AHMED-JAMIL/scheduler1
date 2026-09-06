import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ReportDestinationDialog, ReportDestinationOptions } from './report-destination-dialog';

function dialogFor(kind: ReportDestinationOptions['kind']) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { kind } },
      { provide: DialogRef, useValue: { close: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new ReportDestinationDialog());
}

/**
 * Replaces the two sequential window.prompt() calls Save/Submit used to make -- unstyled,
 * blocking the tab, and the one input flow in the app that didn't go through a real dialog.
 */
describe('ReportDestinationDialog', () => {
  it('defaults bucket/folder to sensible values and is valid without typing anything', () => {
    const dialog = dialogFor('bucket');
    expect(dialog.bucket()).toBe('etl-bucket');
    expect(dialog.folder()).toBe('reports');
    expect(dialog.valid()).toBe(true);
  });

  it('is invalid for a bucket save once the bucket field is cleared', () => {
    const dialog = dialogFor('bucket');
    dialog.bucket.set('  ');
    expect(dialog.valid()).toBe(false);
  });

  it('falls back to "reports" if the folder is submitted blank', () => {
    const dialog = dialogFor('bucket');
    dialog.folder.set('  ');
    let result: any;
    (dialog.ref as any).close = (value: any) => { result = value; };
    dialog.submit({ preventDefault: () => {} } as Event);
    expect(result).toEqual({ bucket: 'etl-bucket', folder: 'reports', submitUrl: '' });
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
