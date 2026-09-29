import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ComingSoon } from './coming-soon';

/**
 * The entry point of a Wave 4 / Wave 5 page that is on the menu before it is built. It must say so
 * plainly -- a blank page or an error would read as a broken console -- and it must not call anything.
 */
describe('a page that is coming', () => {
  async function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([
        { path: 'data/ask', title: 'Ask your data', component: ComingSoon,
          data: { pageKey: 'ask-data', comingSoon: 'Questions in plain language, answered with their sources.' } },
        { path: 'dashboard', component: ComingSoon },
      ])],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/data/ask');
    harness.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  it('is headed with the page it will be, and says what it will do', async () => {
    const el = await render();
    expect(el.querySelector('h1.page-title')?.textContent?.trim()).toBe('Ask your data');
    expect(el.querySelector('.page-subtitle')?.textContent).toContain('Questions in plain language');
  });

  it('says it is not built yet, and offers a way back', async () => {
    const el = await render();
    expect(el.textContent).toContain('Coming soon');
    expect(el.textContent).toContain('not ready yet');
    expect(el.querySelector('a[href="/dashboard"]')).not.toBeNull();
  });
});
