import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ThemeService } from '../../core/theme.service';
import { Docs } from './docs';

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Docs], providers: [provideRouter([]),
    { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
  const fixture = TestBed.createComponent(Docs);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Docs contents', () => {
  /**
   * The links were bare href="#id". With <base href="/"> that resolves to "/#id", so every click
   * left the guide for the landing page.
   */
  it('scrolls to the section in place instead of leaving the guide', () => {
    const page = mount();
    const link = page.querySelector<HTMLAnchorElement>('nav[aria-label="Contents"] a')!;
    const id = link.getAttribute('href')!.replace(/^.*#/, '');
    const target = page.querySelector<HTMLElement>(`#${id}`)!;
    const scrolled = vi.fn();
    target.scrollIntoView = scrolled;

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(scrolled).toHaveBeenCalled();
  });

  it('says which section is being read, not only by colour', () => {
    const page = mount();
    expect(page.querySelector('nav[aria-label="Contents"] a[aria-current="location"]')).toBeTruthy();
  });
});
