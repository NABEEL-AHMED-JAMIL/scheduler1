import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { StorageConnections } from './storage-connections';

/**
 * MIG-324: a new workspace's storage connections said only "No connections configured yet." -- not what one is for,
 * though a new administrator needs one before the inbox, Browse files or a pipeline's Read step can do anything.
 */
function screen() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: [] }) } },
    { provide: Dialog, useValue: {} },
    { provide: AuthService, useValue: { user: () => ({ appUserId: 1 }) } },
  ] });
  return TestBed.runInInjectionContext(() => new StorageConnections());
}

describe('Storage connections, empty (MIG-324)', () => {
  it('says what a connection is for and how one is added', () => {
    expect(screen().emptyMessage()).toBe('No connections yet. New connection adds your S3, Azure, MinIO or FTP storage: '
      + 'pipelines read files from it and keep what they write there, and the inbox stores uploads in it.');
  });

  it('says only that nothing matches when the filters hide every row', () => {
    const s = screen();
    (s as any).isFiltered = () => true;
    expect(s.emptyMessage()).toBe('No connections match the filters.');
  });
});
