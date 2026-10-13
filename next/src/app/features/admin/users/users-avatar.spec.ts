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
 * The users grid draws an app-avatar per row, and an app-avatar asks the server for a picture unless it is told there is
 * none. Most people have none, so asking for everyone sent one request per person per load -- 175 on the dev platform --
 * and ~140 of them came back 404. The list says who has a picture (avatarVersion, null when there is none), so only they
 * are asked for, by version; the rest show their initials straight away.
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
  it('asks for the picture the list names, by its version', () => {
    expect(users().avatarVersionOf(person({ avatarVersion: '0a1b2c3d4e5f60718293' }))).toBe('0a1b2c3d4e5f60718293');
  });

  it('says "none" -- so nothing is asked -- when the list says there is no picture', () => {
    const screen = users();
    expect(screen.avatarVersionOf(person({}))).toBeNull();
    expect(screen.avatarVersionOf(person({ avatarVersion: null }))).toBeNull();
    expect(screen.avatarVersionOf(person({ avatarVersion: '' }))).toBeNull();
  });
});
