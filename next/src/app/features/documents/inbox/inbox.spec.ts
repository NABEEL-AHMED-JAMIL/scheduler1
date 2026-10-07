import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpEventType } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Inbox } from './inbox';
import { InboxApi } from './inbox.service';
import { InboxFile, InboxSettings } from './inbox.model';
import { InboxSettingsDialog } from './inbox-settings-dialog';

/**
 * MIG-239 console: Documents › Inbox. Every member reads the inbox's settings and its arrivals and uploads files, one
 * at a time, each with its own result or the service's refusal word for word. Changing the inbox is an administrator's.
 */
const SETTINGS: InboxSettings = {
  configured: true, alias: 'ui-review-s3', connectionName: 'UI-REVIEW LocalStack S3 (fake keys)', connectionActive: true,
  maxBytes: 104857600, platformMaxBytes: 104857600,
};
const FILE: InboxFile = {
  arrivalId: '778ed857-81ce-4915-821d-ea25b22ba764', alias: 'ui-review-s3', fileName: 'live-customers.csv', bytes: 115,
  contentType: 'text/csv', sha256: '4e847b8e719b2acad7fdd61ccb4f9328d3c305e9f9b09c30b0915fdb2602c6a5', uploadedBy: 4597,
  uploadedAt: '2026-09-28T23:41:23.054311',
};

type Uploads = Subject<unknown>[];

function stubApi(settings: InboxSettings = SETTINGS) {
  const uploads: Uploads = [];
  return {
    uploads,
    settings: vi.fn(() => of({ status: 'SUCCESS', message: '', data: settings })),
    files: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [FILE] })),
    users: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ appUserId: 4597, fullName: 'Alex' }] })),
    colleagues: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ userId: 4597, fullName: 'Alex' }] })),
    upload: vi.fn(() => { const s = new Subject<unknown>(); uploads.push(s); return s as Observable<unknown>; }),
  };
}

function screenWith(opts: { admin?: boolean; settings?: InboxSettings; closeWith?: unknown; api?: ReturnType<typeof stubApi>; tenantId?: number | null } = {}) {
  const api = opts.api ?? stubApi(opts.settings);
  const toast = { success: vi.fn(), error: vi.fn() };
  const opened: { component: unknown; data: unknown }[] = [];
  const dialog = {
    open: vi.fn((component: unknown, config: { data?: unknown }) => {
      opened.push({ component, data: config?.data });
      return { closed: of(opts.closeWith ?? false) };
    }),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: InboxApi, useValue: api },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { isTenantAdmin: () => opts.admin ?? true, canBuild: () => opts.admin ?? true, builderLocked: () => false, user: signal({ appUserId: 4537, tenantId: opts.tenantId === undefined ? 2924 : opts.tenantId }) } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Inbox());
  screen.ngOnInit();
  return { api, toast, dialog, opened, screen };
}

const file = (name: string, bytes = 12) => new File(['x'.repeat(bytes)], name, { type: 'application/json' });
const answer = (body: unknown) => ({ type: HttpEventType.Response, body });

describe('Inbox -- reading', () => {
  it('reads the settings and the newest arrivals', () => {
    const { api, screen } = screenWith();
    expect(api.settings).toHaveBeenCalled();
    expect(api.files).toHaveBeenCalledWith(50);
    expect(screen.settings()?.alias).toBe('ui-review-s3');
    expect(screen.files().map(f => f.fileName)).toEqual(['live-customers.csv']);
  });

  it('reads nothing for a sign-in with no workspace (a platform administrator\'s own; review 2026-10-07, L6)', () => {
    const { api, screen } = screenWith({ tenantId: null });
    expect(screen.noWorkspace()).toBe(true);
    expect(api.settings).not.toHaveBeenCalled();
    expect(api.files).not.toHaveBeenCalled();
    expect(api.users).not.toHaveBeenCalled();
    expect(api.colleagues).not.toHaveBeenCalled();
    screen.load();
    expect(api.settings).not.toHaveBeenCalled();
  });

  it('names uploaders from the member list for an administrator', () => {
    const { api, screen } = screenWith();
    expect(api.users).toHaveBeenCalled();
    expect(screen.uploader(FILE)).toBe('Alex');
  });

  it('names uploaders for a member from the colleagues, never asking for the member list it would be refused', () => {
    const { api, screen } = screenWith({ admin: false });
    expect(api.users).not.toHaveBeenCalled();
    expect(api.colleagues).toHaveBeenCalled();
    expect(screen.uploader(FILE)).toBe('Alex');
    expect(screen.uploader({ ...FILE, uploadedBy: 4537 })).toBe('You');
  });

  it('keeps the user number when a member may not read the colleagues either', () => {
    const api = stubApi();
    api.colleagues.mockReturnValue(throwError(() => ({ status: 403 })) as never);
    TestBed.resetTestingModule();
    const { screen } = screenWith({ admin: false, api });
    expect(screen.uploader(FILE)).toBe('User 4597');
  });

  it('explains a missing inbox: an administrator is offered the setup, a member is told whom to ask', () => {
    const off: InboxSettings = { configured: false, maxBytes: 104857600, platformMaxBytes: 104857600 };
    expect(screenWith({ settings: off }).screen.configured()).toBe(false);
    expect(screenWith({ settings: off }).screen.notConfiguredText()).toContain('Choose which of the workspace\'s storage');
    expect(screenWith({ settings: off, admin: false }).screen.notConfiguredText()).toContain('Ask a workspace admin');
  });

  it('shows why the settings could not be read', () => {
    const { api, screen } = screenWith();
    api.settings.mockReturnValueOnce(throwError(() => ({ status: 500, error: { message: 'down' } })) as never);
    screen.load();
    expect(screen.error()).toBe('down');
  });
});

describe('Inbox -- uploading', () => {
  it('sends the files one at a time, and says how each one went', () => {
    const { api, screen } = screenWith();
    screen.enqueue([file('UI-CHECK-a.json'), file('UI-CHECK-b.json')]);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(screen.queue().map(q => q.state)).toEqual(['uploading', 'queued']);

    api.uploads[0].next({ type: HttpEventType.UploadProgress, loaded: 6, total: 12 });
    expect(screen.queue()[0].progress).toBe(50);

    api.uploads[0].next(answer({ status: 'SUCCESS', message: 'File uploaded to the inbox.', data: { ...FILE, fileName: 'UI-CHECK-a.json' } }));
    api.uploads[0].complete();
    expect(screen.queue()[0].state).toBe('done');
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(screen.queue()[1].state).toBe('uploading');
  });

  it('shows the service\'s refusal word for word, and carries on with the next file', () => {
    const { api, screen } = screenWith();
    screen.enqueue([file('UI-CHECK-evil.exe'), file('UI-CHECK-c.json')]);
    const reason = '\'UI-CHECK-evil.exe\': .exe files are not accepted in the inbox.';
    api.uploads[0].error({ status: 400, error: { status: 'ERROR', message: reason } });
    expect(screen.queue()[0]).toMatchObject({ state: 'refused', message: reason });
    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it('refuses a file over the limit without sending it', () => {
    const small: InboxSettings = { ...SETTINGS, maxBytes: 10, workspaceMaxBytes: 10 };
    const { api, screen } = screenWith({ settings: small });
    screen.enqueue([file('UI-CHECK-big.json', 20)]);
    expect(api.upload).not.toHaveBeenCalled();
    expect(screen.queue()[0].state).toBe('refused');
    expect(screen.queue()[0].message).toContain('the inbox takes files up to 10 B');
  });

  it('reads the arrivals again once the queue is empty', () => {
    const { api, screen } = screenWith();
    screen.enqueue([file('UI-CHECK-a.json')]);
    expect(api.files).toHaveBeenCalledTimes(1);
    api.uploads[0].next(answer({ status: 'SUCCESS', message: 'ok', data: FILE }));
    api.uploads[0].complete();
    expect(api.files).toHaveBeenCalledTimes(2);
  });

  it('takes no files while the inbox is not configured', () => {
    const { api, screen } = screenWith({ settings: { configured: false, maxBytes: 1, platformMaxBytes: 1 } });
    screen.enqueue([file('UI-CHECK-a.json')]);
    expect(api.upload).not.toHaveBeenCalled();
    expect(screen.queue()).toEqual([]);
  });

  it('clears the finished rows, and leaves one still going', () => {
    const { api, screen } = screenWith();
    screen.enqueue([file('UI-CHECK-a.json'), file('UI-CHECK-b.json')]);
    api.uploads[0].next(answer({ status: 'SUCCESS', message: 'ok', data: FILE }));
    api.uploads[0].complete();
    screen.clearFinished();
    expect(screen.queue().map(q => q.name)).toEqual(['UI-CHECK-b.json']);
  });
});

describe('Inbox -- settings', () => {
  it('opens the settings for an administrator, and reads again when they changed', () => {
    const { api, opened, screen } = screenWith({ closeWith: true });
    screen.openSettings();
    expect(opened[0].component).toBe(InboxSettingsDialog);
    expect(opened[0].data).toMatchObject({ settings: SETTINGS });
    expect(api.settings).toHaveBeenCalledTimes(2);
  });

  it('reads nothing again when the dialog was cancelled', () => {
    const { api, screen } = screenWith({ closeWith: false });
    screen.openSettings();
    expect(api.settings).toHaveBeenCalledTimes(1);
  });

  it('offers no change to a member', () => {
    const { dialog, screen } = screenWith({ admin: false });
    expect(screen.canManage()).toBe(false);
    screen.openSettings();
    expect(dialog.open).not.toHaveBeenCalled();
  });
});
