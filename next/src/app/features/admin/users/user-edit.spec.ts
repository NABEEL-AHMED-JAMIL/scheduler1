import { describe, it, expect, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { AvatarCache } from '../../../shared/ui/avatar';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccountSecurityApi } from '../../account/account-security.api';
import { AccessProfilesService } from '../access-profiles/access-profiles.service';
import { AppUser } from './users';
import { UserEdit } from './user-edit';

/**
 * Owner 2026-10-19 #31: Edit user is a page. Its permissions are the server's scopedFind read on the page: a tenant
 * administrator changes their workspace's members and themself, never a fellow administrator (read-only, no sessions, no
 * danger zone); a platform administrator anyone; nobody their own role, status or account.
 */
const ME = 4640;
const PEOPLE: AppUser[] = [
  { appUserId: ME, username: 'admin@w.test', fullName: 'Admin', userRole: 'TENANT_ADMIN', status: 'Active', tenantId: 2960 },
  { appUserId: 4684, username: 'member@w.test', fullName: 'Member', userRole: 'TENANT_USER', status: 'Active', tenantId: 2960,
    pageAccessProfileId: 1063, managerId: ME, phoneNumber: '+12023343333' },
  { appUserId: 4699, username: 'peer@w.test', fullName: 'Peer', userRole: 'TENANT_ADMIN', status: 'Active', tenantId: 2960 },
];

type Answers = Record<string, (...args: never[]) => Observable<unknown>>;
function page(id: number, role: 'TENANT_ADMIN' | 'PLATFORM_ADMIN' = 'TENANT_ADMIN', me = ME,
              over: { security?: Answers; profiles?: Answers; get?: () => Observable<unknown> } = {}) {
  TestBed.resetTestingModule();
  try { localStorage.clear(); } catch { /* none */ }
  const http = {
    get: vi.fn(over.get ?? (() => of({ status: 'SUCCESS', message: '', data: PEOPLE }))),
    put: vi.fn(() => of({ status: 'SUCCESS', message: 'User updated.' })),
    post: vi.fn(() => of({ status: 'SUCCESS', message: 'Picture updated.', data: { avatarVersion: 'abcdef0123' } })),
    delete: vi.fn(() => of({ status: 'SUCCESS', message: 'Picture removed.', data: { avatarVersion: null } })),
  };
  const security = {
    people: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { 4684: { lockedUntil: null, failedSignIns: 0, passwordChangedAt: null,
      mfaEnabled: true, signIns30d: 3, lastSignInMethod: 'PASSWORD' } } })),
    sessionsOf: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ sessionId: 's1', method: 'PASSWORD', ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0', signedInAt: '2026-10-19T10:00:00Z',
      lastActiveAt: '2026-10-19T11:00:00Z', idleExpiresAt: '2026-10-19T11:30:00Z' }] })),
    endSessionOf: vi.fn(() => of({ status: 'SUCCESS', message: 'Ended.' })),
    workspaceHistory: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { items: [], total: 0, limit: 8, offset: 0 } })),
    ...over.security,
  };
  const profiles = {
    pages: () => of({ status: 'SUCCESS', message: '', data: [
      { key: 'jobs', label: 'Schedules', section: 'Pipelines', route: '' }, { key: 'queue', label: 'Queue', section: 'Pipelines', route: '' },
      { key: 'objects', label: 'Browse files', section: 'Documents', route: '' }] }),
    list: () => of({ status: 'SUCCESS', message: '', data: [
      { pageAccessProfileId: 1063, profileName: 'Reviewer', defaultProfile: true, pageKeys: ['queue'], userCount: 1 },
      { pageAccessProfileId: 1064, profileName: 'Viewer', defaultProfile: false, pageKeys: ['jobs', 'objects'], userCount: 0 }] }),
    people: () => of({ status: 'SUCCESS', message: '', data: [{ appUserId: 4684, fullName: 'Member', username: 'member@w.test', status: 'Active',
      pageAccessProfileId: 1063, pageAccessProfileName: 'Reviewer', pageKeys: ['queue', 'objects'], allowedExceptions: ['objects'] }] }),
    ...over.profiles,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: http },
      { provide: AccountSecurityApi, useValue: security },
      { provide: AccessProfilesService, useValue: profiles },
      { provide: AuthService, useValue: { user: signal({ appUserId: me, userRole: role }), isPlatformAdmin: () => role === 'PLATFORM_ADMIN',
        patchUser: vi.fn() } },
      { provide: AvatarCache, useValue: { forget: vi.fn() } },
      { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(true) })) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => String(id) } } } },
    ],
  });
  const edit = TestBed.runInInjectionContext(() => new UserEdit());
  edit.ngOnInit();
  return { edit, http, security };
}

describe('UserEdit permissions', () => {
  it('lets a workspace administrator change a member: the form, their sessions and the danger zone', () => {
    const { edit, security } = page(4684);
    expect(edit.person()?.username).toBe('member@w.test');
    expect(edit.canManage()).toBe(true);
    expect(edit.form.enabled).toBe(true);
    expect(edit.form.get('tenantId')!.disabled).toBe(true);
    expect(security.sessionsOf).toHaveBeenCalledWith(4684);
    expect(edit.sessions()).toHaveLength(1);
    expect(edit.browserOf(edit.sessions()![0].userAgent)).toBe('Chrome on macOS');
    expect(edit.roles().map(r => r.value)).toEqual(['TENANT_USER']);
  });

  it('opens a fellow administrator read-only: nothing to save, no sessions read, no danger zone', () => {
    const { edit, security, http } = page(4699);
    expect(edit.readOnly()).toBe(true);
    expect(edit.form.disabled).toBe(true);
    expect(security.sessionsOf).not.toHaveBeenCalled();
    edit.save();
    expect(http.put).not.toHaveBeenCalled();
  });

  it('lets a platform administrator change a workspace administrator, with every role on offer', () => {
    const { edit } = page(4699, 'PLATFORM_ADMIN', 4639);
    expect(edit.canManage()).toBe(true);
    expect(edit.roles().map(r => r.value)).toEqual(['TENANT_USER', 'TENANT_ADMIN', 'PLATFORM_ADMIN']);
  });

  it('never changes one\'s own role, status or account', async () => {
    const { edit, http } = page(ME);
    expect(edit.isSelf()).toBe(true);
    expect(edit.form.get('userRole')!.disabled).toBe(true);
    await edit.toggleStatus();
    await edit.deleteUser();
    expect(http.put).not.toHaveBeenCalled();
  });

  it('says so when the person is not on the list', () => {
    const { edit } = page(1);
    expect(edit.error()).toContain('not on your Users list');
  });
});

describe('UserEdit behaviour', () => {
  it('saves the whole form with the phone, and no profile for an administrator', () => {
    const { edit, http } = page(4684);
    edit.form.patchValue({ fullName: 'Member Renamed' });
    edit.form.markAsDirty();
    expect(edit.changed()).toBe(true);
    edit.save();
    expect(http.put).toHaveBeenCalledWith(expect.stringContaining('appUser.json/updateUser'), expect.objectContaining({
      appUserId: 4684, fullName: 'Member Renamed', phoneNumber: '+12023343333', pageAccessProfileId: 1063, tenantId: 2960 }));
  });

  it('previews what they can see: the server\'s pages while the form is saved, the picked profile once it changes', () => {
    const { edit } = page(4684);
    expect(edit.pagesOpen()).toBe(2);
    expect(edit.previewUnsaved()).toBe(false);
    edit.form.get('pageAccessProfileId')!.setValue(1064);
    expect(edit.previewUnsaved()).toBe(true);
    expect(edit.pagesOpen()).toBe(2);
    expect(edit.preview().map(g => g.label)).toContain('Build');
    edit.form.get('userRole')!.setValue('TENANT_ADMIN');
    expect(edit.pagesOpen()).toBe(3);
  });

  it('sets a member\'s picture for them, and one\'s own as one\'s own', () => {
    const member = page(4684);
    member.edit.upload(new Blob(['x']));
    expect(member.http.post).toHaveBeenCalledWith(expect.stringContaining('appUser.json/avatar'), expect.any(FormData), { params: { appUserId: 4684 } });
    expect(member.edit.person()?.avatarVersion).toBe('abcdef0123');
    const self = page(ME);
    self.edit.upload(new Blob(['x']));
    expect(self.http.post).toHaveBeenCalledWith(expect.stringContaining('appUser.json/avatar'), expect.any(FormData), { params: {} });
  });

  it('ends one session of theirs', () => {
    const { edit, security } = page(4684);
    edit.endSession(edit.sessions()![0]);
    expect(security.endSessionOf).toHaveBeenCalledWith(4684, 's1');
  });

  it('lists whom they manage, for where escalations go', () => {
    const { edit } = page(ME);
    expect(edit.reportNames()).toBe('Member');
  });
});

const FAILED = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

describe('UserEdit -- sorting their sessions (owner 2026-10-27)', () => {
  it('keeps the server order, then sorts by when they signed in, newest first, and back', () => {
    const two = () => of({ status: 'SUCCESS', message: '', data: [
      { sessionId: 'old', method: 'PASSWORD', ip: null, userAgent: null, signedInAt: '2026-10-18T10:00:00Z', lastActiveAt: '2026-10-19T09:00:00Z', idleExpiresAt: '' },
      { sessionId: 'new', method: 'MFA', ip: null, userAgent: null, signedInAt: '2026-10-19T10:00:00Z', lastActiveAt: '2026-10-19T10:30:00Z', idleExpiresAt: '' }] });
    const { edit } = page(4684, 'TENANT_ADMIN', ME, { security: { sessionsOf: two } });
    expect(edit.sortedSessions().map(s => s.sessionId)).toEqual(['old', 'new']);
    edit.sessionSort.toggle('signedIn');
    expect(edit.sortedSessions().map(s => s.sessionId)).toEqual(['new', 'old']);
    edit.sessionSort.toggle('signedIn');
    expect(edit.sortedSessions().map(s => s.sessionId)).toEqual(['old', 'new']);
  });
});

describe('UserEdit -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading until the person answers, and the reads around them are pending, not "none"', () => {
    const { edit } = page(4684, 'TENANT_ADMIN', ME, { get: () => NEVER });
    expect(edit.loading()).toBe(true);
    expect(edit.person()).toBeNull();
    expect(edit.standingState.pending()).toBe(true);
  });

  it('says a failed read can be tried again, and a person not on the list cannot', () => {
    const failed = page(4684, 'TENANT_ADMIN', ME, { get: FAILED }).edit;
    expect(failed.loading()).toBe(false);
    expect(failed.error()).toBe('Could not load the user.');
    expect(failed.retryable()).toBe(true);
    const gone = page(9999).edit;
    expect(gone.retryable()).toBe(false);
  });

  it('says what could not be read around the person instead of showing it as "none"', () => {
    const { edit } = page(4684, 'TENANT_ADMIN', ME, {
      security: { people: FAILED, workspaceHistory: FAILED },
      profiles: { list: FAILED, pages: FAILED },
    });
    expect(edit.standingState.error()).toBe('How they sign in could not be read.');
    expect(edit.historyState.error()).toBe('Their history could not be read.');
    expect(edit.profilesState.error()).toBe('The access profiles could not be read.');
    expect(edit.catalogueState.error()).toBe('What they can see could not be worked out.');
  });

  it('knows the history is empty once it answers with nothing', () => {
    const { edit } = page(4684);
    expect(edit.historyState.loaded()).toBe(true);
    expect(edit.history()).toEqual([]);
  });
});
