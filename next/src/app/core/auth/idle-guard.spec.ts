import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { ToastHost } from '../../shared/ui/toast-host';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { IdleGuard } from './idle-guard';
import { AuthService, LAST_ACTIVITY_KEY } from './auth.service';
import { AuthUser } from './auth.models';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

useMemoryStorage();

/**
 * MIG-353 part 3: the console's half of idle sign-out -- a warning a minute before the workspace's idle minutes run out,
 * then the sign-out, saying why. Activity in any tab (the shared stamp) keeps the session alive.
 */
describe('IdleGuard', () => {
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let logout: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    user = signal<AuthUser | null>({ idleMinutes: 5, refreshToken: 'r' } as AuthUser);
    logout = vi.fn();
    refresh = vi.fn(() => of({ status: 'SUCCESS', message: '', data: {} }));
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user, logout, refresh, isLoggedIn: () => true } }],
    });
  });

  afterEach(() => vi.useRealTimers());

  /** The guard pins its warning in the toast stack (owner 2026-10-19 #29), so both are on the page, as in the app. */
  @Component({ selector: 'app-idle-page', imports: [ToastHost, IdleGuard], template: '<app-toast-host /><app-idle-guard />' })
  class IdlePage {}

  const guardOf = (fixture: ComponentFixture<unknown>) => fixture.debugElement.query(By.directive(IdleGuard)).componentInstance as IdleGuard;

  function mount() {
    const fixture = TestBed.createComponent(IdlePage);
    fixture.detectChanges();
    return fixture;
  }

  it('warns a minute before, then signs out for inactivity', () => {
    const fixture = mount();
    const page = fixture.nativeElement as HTMLElement;
    vi.advanceTimersByTime(3 * 60_000 + 59_000);
    fixture.detectChanges();
    expect(page.querySelector('[data-test="idle-warning"]')).toBeNull();
    vi.advanceTimersByTime(2_000);
    fixture.detectChanges();
    expect(page.querySelector('[data-test="idle-warning"]')?.textContent).toContain('signed out in');
    expect(page.querySelector('[data-test="toast-stack"] [data-test="idle-warning"]')).not.toBeNull();
    expect(logout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(logout).toHaveBeenCalledWith('idle');
  });

  it('counts activity in another tab', () => {
    mount();
    vi.advanceTimersByTime(4 * 60_000 + 30_000);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    vi.advanceTimersByTime(2 * 60_000);
    expect(logout).not.toHaveBeenCalled();
  });

  it('"Stay signed in" moves the server\'s deadline too', () => {
    const fixture = mount();
    vi.advanceTimersByTime(4 * 60_000 + 10_000);
    guardOf(fixture).stay();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(logout).not.toHaveBeenCalled();
  });

  it('makes no request on load while the server\'s deadline is unknown or far off', () => {
    mount();
    expect(refresh).not.toHaveBeenCalled();
    user.set({ idleMinutes: 5, refreshToken: 'r', idleExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString() } as AuthUser);
    mount();
    expect(refresh).not.toHaveBeenCalled();
  });
});
