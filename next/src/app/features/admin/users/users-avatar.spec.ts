import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { AppUser, Users } from './users';

/**
 * The users grid drew an app-avatar per row, and an app-avatar given an appUserId asks the server for
 * that person's picture. Most people have none, so every load of the screen sent one request per
 * person -- 175 on the dev platform -- and ~140 of them came back 404. The list already says who has
 * a picture (avatarKey, omitted when there is none), so only they are asked for; the rest show their
 * initials straight away.
 */
function users(): Users {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { user: signal({ appUserId: 1, userRole: 'PLATFORM_ADMIN' }), isPlatformAdmin: () => true } },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: [] }) } },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
      { provide: Router, useValue: { navigate: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Users());
}

const person = (extra: Partial<AppUser>): AppUser =>
  ({ appUserId: 4414, username: 'someone@example.com', userRole: 'TENANT_USER', status: 'Active', tenantId: 2900, ...extra });

describe('the users grid asks for a picture only when there is one', () => {
  it('asks for the person who has an avatar', () => {
    expect(users().avatarOwner(person({ avatarKey: '4414/profile/avatar.jpg' }))).toBe(4414);
  });

  it('asks for nobody when the list says there is no avatar', () => {
    const screen = users();
    expect(screen.avatarOwner(person({}))).toBeNull();
    expect(screen.avatarOwner(person({ avatarKey: null }))).toBeNull();
    expect(screen.avatarOwner(person({ avatarKey: '' }))).toBeNull();
  });
});
