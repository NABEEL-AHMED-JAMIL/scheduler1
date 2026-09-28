import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Profile } from './profile';
import { ToastService } from '../../shared/ui/toast.service';
import { StorageService } from '../objects/storage.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Clearing the display name hid Save and Cancel without a word: "nothing changed" and "the name
 * is blank" were one check. The buttons now stay, Save is disabled, and the field says why.
 */
function profile() {
  const post = vi.fn(() => of({ status: 'SUCCESS', message: 'Saved.' }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: vi.fn(() => of({ status: 'SUCCESS', data: null })), post, put: post } },
    { provide: Dialog, useValue: {} },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: StorageService, useValue: {} },
    { provide: AuthService, useValue: { canOpen: () => true, role: () => 'TENANT_USER' } },
  ] });
  const component = TestBed.runInInjectionContext(() => new Profile());
  component.profile.set({ fullName: 'Ada Lovelace', position: 'Analyst', phoneNumber: '' } as any);
  component.resetDetails();
  return { component, post };
}

describe('Profile details with the name cleared', () => {
  it('keeps Save and Cancel, disables Save and says the name is required', () => {
    const { component } = profile();
    component.name.set('   ');
    component.position.set('Lead');

    expect(component.detailsChanged()).toBe(true);
    expect(component.nameMissing()).toBe(true);
    expect(component.nameError()).toBe('Display name is required.');
  });

  it('does not save a blank name', () => {
    const { component, post } = profile();
    component.name.set('');
    component.saveName();
    expect(post).not.toHaveBeenCalled();
  });

  it('says nothing while the name is as it was', () => {
    const { component } = profile();
    expect(component.detailsChanged()).toBe(false);
    expect(component.nameError()).toBe('');
  });
});

describe('Profile for a tenant user without Source Jobs', () => {
  it('does not link the Jobs tile or run names to a page the profile withholds', () => {
    const { component } = profile();
    expect(component.canOpenJobs()).toBe(true);
    const auth = TestBed.inject(AuthService) as unknown as { canOpen: (k: string) => boolean };
    auth.canOpen = key => key !== 'jobs';
    const again = TestBed.runInInjectionContext(() => new Profile());
    expect(again.canOpenJobs()).toBe(false);
  });
});

// MIG-295: a run on the profile reads as it does on Jobs and Queue, and one still going is timed
// from the server's clock rather than from the reader's.
describe('Profile run durations', () => {
  it('writes how long a run took with the console-wide duration words', () => {
    const { component } = profile();
    expect(component.runDuration({ startTime: '2026-09-24T22:00:00', endTime: '2026-09-24T22:00:25.300' } as any)).toBe('25.3s');
    expect(component.runDuration({ startTime: '2026-09-24T22:00:00', endTime: '2026-09-24T22:03:20' } as any)).toBe('3m 20s');
    expect(component.runDuration({ startTime: '2026-09-24T21:00:00', endTime: '2026-09-24T22:05:00' } as any)).toBe('1h 5m');
    expect(component.runDuration({} as any)).toBe('');
  });

  it('times a run still going from the server clock, not the reader own', () => {
    vi.useFakeTimers();
    try {
      // 17:00 on the server's clock (America/Chicago, CDT) is 22:00Z; two minutes later is 22:02Z.
      vi.setSystemTime(new Date('2026-09-24T22:02:00Z'));
      const { component } = profile();
      expect(component.runDuration({ startTime: '2026-09-24T17:00:00' } as any)).toBe('2m');
    } finally { vi.useRealTimers(); }
  });
});
