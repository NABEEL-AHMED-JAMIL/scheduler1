import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Inbox } from './inbox';
import { InboxApi } from './inbox.service';

const copied: string[] = [];
let copyWorks = true;
// The browser's clipboard, refusing on demand (copyText then tries its fallback, which the test DOM cannot do either).
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
  writeText: (value: string) => copyWorks ? (copied.push(value), Promise.resolve()) : Promise.reject(new Error('refused')),
} });
Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });

/**
 * MIG-324: a pipeline's Read step names the file it reads by its key in the bucket, and the inbox stores an upload at
 * intake/<date>/<arrival>-<name>. The arrivals list showed only the name, so a new administrator had no way to find
 * the key of the file they had just uploaded. Each arrival now shows its key, with a copy button.
 */
const FILE = { arrivalId: 'a1', alias: 'orders-s3', key: 'intake/2026/10/05/a1-orders.csv', fileName: 'orders.csv' };

function screen() {
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideZonelessChangeDetection(), provideRouter([]),
    { provide: InboxApi, useValue: {
      settings: () => of({ status: 'SUCCESS', message: '', data: { configured: true, alias: 'orders-s3', maxBytes: 1, platformMaxBytes: 1 } }),
      files: () => of({ status: 'SUCCESS', message: '', data: [FILE] }),
      users: () => of({ status: 'SUCCESS', message: '', data: [] }),
    } },
    { provide: Dialog, useValue: { open: vi.fn() } },
    { provide: ToastService, useValue: toast },
    { provide: AuthService, useValue: { isTenantAdmin: () => true, canBuild: () => true, builderLocked: () => false, user: signal({ appUserId: 1 }) } },
  ] });
  const inbox = TestBed.runInInjectionContext(() => new Inbox());
  inbox.ngOnInit();
  return { inbox, toast };
}

describe('Inbox -- an arrival\'s key, for a pipeline step to read', () => {
  it('copies the key and ticks that row only', async () => {
    copyWorks = true;
    const { inbox } = screen();
    await inbox.copyKey(FILE);
    expect(copied.at(-1)).toBe('intake/2026/10/05/a1-orders.csv');
    expect(inbox.copiedKey()).toBe('a1');
  });

  it('says so when the browser refuses the copy', async () => {
    copyWorks = false;
    const { inbox, toast } = screen();
    await inbox.copyKey(FILE);
    expect(inbox.copiedKey()).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });
});
