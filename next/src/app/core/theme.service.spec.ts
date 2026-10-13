import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ThemeService, applyTheme, provideTheme, resolveTheme } from './theme.service';
import { ThemePreference } from './theme-preference';
import { AuthService } from './auth/auth.service';
import { useMemoryStorage } from '../shared/testing/memory-storage';

type Listener = (event: { matches: boolean }) => void;

/** A device whose light/dark is `dark`, and which can change it while the page is open. */
function device(dark: boolean): { flip(to: boolean): void } {
  const listeners: Listener[] = [];
  const list = { matches: dark };
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return list.matches; }, media: query, onchange: null,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn), removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  return { flip(to: boolean) { list.matches = to; listeners.forEach(fn => fn({ matches: to })); } };
}

const root = () => document.documentElement;
const shown = () => ({ dark: root().classList.contains('dark'), theme: root().getAttribute('data-theme') });

function reset(): void {
  root().classList.remove('dark');
  root().removeAttribute('data-theme');
}

function service(): ThemeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const themes = TestBed.inject(ThemeService);
  TestBed.tick();
  return themes;
}

/**
 * The theme was applied by ThemeService's constructor, and only a screen that injected the
 * service built it -- the shell did, the sign-in page did not. So /login opened light for someone
 * who had chosen dark, or whose OS was dark. The app now builds the service as it starts.
 */
describe('theme on routes that never ask for it', () => {
  useMemoryStorage();
  beforeEach(reset);

  async function started(): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTheme()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    TestBed.tick();
  }

  it('applies a stored dark choice with no screen injecting the service', async () => {
    device(false);
    localStorage.setItem('etl_theme', 'dark');
    await started();
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('follows a dark OS when nothing is stored', async () => {
    device(true);
    await started();
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('is wired into the app config', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    expect(fs.readFileSync(`${cwd}/src/app/app.config.ts`, 'utf8')).toContain('provideTheme()');
  });
});

/** Owner 2026-10-13: the app themes -- Light, Dark, Ocean, Midnight, High contrast, and System. */
describe('ThemeService', () => {
  useMemoryStorage();
  beforeEach(reset);

  it('puts each theme on <html>: the dark class for the dark family, data-theme for all but the two base themes', () => {
    const cases = [
      ['light', false, null], ['dark', true, null], ['ocean', false, 'ocean'],
      ['midnight', true, 'midnight'], ['contrast', false, 'contrast'],
    ] as const;
    for (const [id, dark, theme] of cases) {
      applyTheme(root(), id);
      expect(shown(), id).toEqual({ dark, theme });
    }
  });

  it('picks a theme at once and keeps the choice in the instant cache', () => {
    device(false);
    const themes = service();
    themes.pick('midnight');
    TestBed.tick();
    expect(shown()).toEqual({ dark: true, theme: 'midnight' });
    expect(themes.theme()).toBe('dark');
    expect(localStorage.getItem('etl_theme')).toBe('midnight');
    themes.pick('ocean');
    TestBed.tick();
    expect(shown()).toEqual({ dark: false, theme: 'ocean' });
    expect(localStorage.getItem('etl_theme')).toBe('ocean');
  });

  it('opens in the stored choice, and ignores a stored value that is not a theme', () => {
    device(false);
    localStorage.setItem('etl_theme', 'contrast');
    expect(service().active()).toBe('contrast');
    localStorage.setItem('etl_theme', 'sepia');
    expect(service().choice()).toBe('system');
  });

  it('on System, follows the device live -- and stops following once a theme is picked', () => {
    const os = device(false);
    const themes = service();
    expect(themes.choice()).toBe('system');
    expect(shown()).toEqual({ dark: false, theme: null });
    os.flip(true);
    TestBed.tick();
    expect(shown()).toEqual({ dark: true, theme: null });
    expect(localStorage.getItem('etl_theme')).toBe('system');
    themes.pick('ocean');
    os.flip(false);
    os.flip(true);
    TestBed.tick();
    expect(themes.active()).toBe('ocean');
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('takes the sign-in answer: the person’s own theme first, else the workspace default, else this device’s', () => {
    device(false);
    const themes = service();
    themes.pick('contrast');
    themes.adoptSignIn(null, undefined);
    expect(themes.choice()).toBe('contrast');
    themes.adoptSignIn(null, 'ocean');
    expect(themes.choice()).toBe('ocean');
    themes.adoptSignIn('midnight', 'ocean');
    expect(themes.choice()).toBe('midnight');
    themes.adoptSignIn('sepia', 'nonsense');
    expect(themes.choice()).toBe('midnight');
  });

  it('the public pages’ sun/moon flips the family and keeps the palette', () => {
    device(false);
    const themes = service();
    themes.pick('ocean');
    themes.toggle();
    expect(themes.choice()).toBe('midnight');
    themes.toggle();
    expect(themes.choice()).toBe('ocean');
    themes.pick('light');
    themes.toggle();
    expect(themes.choice()).toBe('dark');
  });
});

describe('the sign-in answer and the account', () => {
  useMemoryStorage();
  beforeEach(reset);

  function signedIn(http: Partial<HttpClient>) {
    device(false);
    localStorage.setItem('etl_auth_user', JSON.stringify({ username: 'a@b.c', appUserId: 7, userRole: 'TENANT_USER',
      accessToken: 'header.eyJzdWIiOiJhQGIuYyJ9.sig', refreshToken: 'r', workspaceTheme: 'ocean' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: HttpClient, useValue: { get: () => of({}), ...http } },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
    ] });
    return { auth: TestBed.inject(AuthService), themes: TestBed.inject(ThemeService), preference: TestBed.inject(ThemePreference) };
  }

  it('a sign-in brings the person’s theme to this device, or their workspace’s default', () => {
    const { auth, themes } = signedIn({});
    auth.signedIn({ status: 'SUCCESS', message: '', data: { username: 'a', userRole: 'TENANT_USER', appUserId: 7,
      accessToken: 'x.e30.y', refreshToken: 'r', theme: null, workspaceTheme: 'midnight' } });
    expect(themes.choice()).toBe('midnight');
    auth.signedIn({ status: 'SUCCESS', message: '', data: { username: 'a', userRole: 'TENANT_USER', appUserId: 7,
      accessToken: 'x.e30.y', refreshToken: 'r', theme: 'contrast', workspaceTheme: 'midnight' } });
    expect(themes.choice()).toBe('contrast');
    expect(auth.user()?.theme).toBe('contrast');
  });

  it('a two-factor challenge (no session) changes nothing', () => {
    const { auth, themes } = signedIn({});
    themes.pick('dark');
    auth.signedIn({ status: 'SUCCESS', message: '', data: { theme: 'ocean' } as never });
    expect(themes.choice()).toBe('dark');
  });

  it('a pick is kept on the account (PUT appUser.json/theme) and in the session', () => {
    const put = vi.fn(() => of({ status: 'SUCCESS', message: '', data: { theme: 'midnight' } }));
    const { auth, themes, preference } = signedIn({ put } as never);
    let kept: boolean | undefined;
    preference.choose('midnight').subscribe(k => kept = k);
    expect(themes.choice()).toBe('midnight');
    expect(put).toHaveBeenCalledWith(expect.stringContaining('/appUser.json/theme'), { theme: 'midnight' });
    expect(kept).toBe(true);
    expect(auth.user()?.theme).toBe('midnight');
  });

  it('no choice of one’s own is the workspace default; a refused save still leaves the theme on this device', () => {
    const put = vi.fn(() => throwError(() => new Error('403')));
    const { auth, themes, preference } = signedIn({ put } as never);
    let kept: boolean | undefined;
    preference.choose(null).subscribe(k => kept = k);
    expect(themes.choice()).toBe('ocean');
    expect(put).toHaveBeenCalledWith(expect.stringContaining('/appUser.json/theme'), { theme: null });
    expect(kept).toBe(false);
    expect(auth.user()?.theme).toBeUndefined();
  });
});
