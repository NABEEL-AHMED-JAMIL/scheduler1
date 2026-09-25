import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTheme } from './theme.service';
import { useMemoryStorage } from '../shared/testing/memory-storage';

/**
 * The theme was applied by ThemeService's constructor, and only a screen that injected the
 * service built it -- the shell did, the sign-in page did not. So /login opened light for someone
 * who had chosen dark, or whose OS was dark. The app now builds the service as it starts.
 */
describe('theme on routes that never ask for it', () => {
  useMemoryStorage();

  const darkOs = (dark: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));

  beforeEach(() => document.documentElement.classList.remove('dark'));

  async function started(): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTheme()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    TestBed.tick();
  }

  it('applies a stored dark choice with no screen injecting the service', async () => {
    darkOs(false);
    localStorage.setItem('etl_theme', 'dark');
    await started();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('follows a dark OS when nothing is stored', async () => {
    darkOs(true);
    await started();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('is wired into the app config', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    expect(fs.readFileSync(`${root}/src/app/app.config.ts`, 'utf8')).toContain('provideTheme()');
  });
});
