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
