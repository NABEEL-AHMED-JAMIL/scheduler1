import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Route, TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PageTitleStrategy } from './page-title.strategy';
import { routes } from '../app.routes';

/** Every page and browser tab was titled just "ETL Console", so a row of tabs could not be told apart. */
@Component({ template: '' })
class Blank {}

describe('page titles', () => {
  async function titleAt(url: string, title?: string): Promise<string> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'page', component: Blank, title }, { path: 'untitled', component: Blank }]),
      { provide: TitleStrategy, useClass: PageTitleStrategy },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Title).getTitle();
  }

  it('names the page, then the product', async () => {
    expect(await titleAt('/page', 'Dashboard')).toBe('Dashboard · ETL Console');
  });

  it('falls back to the product name for a route with no title', async () => {
    expect(await titleAt('/untitled')).toBe('ETL Console');
  });

  it('gives every page route a title, and no redirect one', () => {
    const leaves = (list: Route[]): Route[] => list.flatMap(r => [r, ...leaves(r.children ?? [])]);
    const pages = leaves(routes).filter(r => r.loadComponent);
    const untitled = pages.filter(r => !r.title && r.path !== '').map(r => r.path);
    expect(untitled).toEqual([]);
    expect(leaves(routes).filter(r => r.redirectTo && r.title)).toEqual([]);
  });

  it('is wired into the app config', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    expect(fs.readFileSync(`${root}/src/app/app.config.ts`, 'utf8')).toContain('{ provide: TitleStrategy, useClass: PageTitleStrategy }');
  });
});
