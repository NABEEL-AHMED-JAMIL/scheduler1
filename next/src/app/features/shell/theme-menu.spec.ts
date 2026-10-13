import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ThemeMenu } from './theme-menu';
import { ThemeService } from '../../core/theme.service';
import { ThemePreference } from '../../core/theme-preference';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

/**
 * Owner 2026-10-13: the top bar's sun/moon became a theme menu -- each theme with a small preview and its name, the
 * current one ticked -- and a keyboard reaches all of it: the arrows, Home and End move, Enter picks, Escape closes
 * back to the button.
 */
describe('ThemeMenu', () => {
  useMemoryStorage();

  let choose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }));
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    choose = vi.fn((id: string) => { TestBed.inject(ThemeService).pick(id as never); return of(true); });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ThemePreference, useValue: { choose } }] });
  });

  async function opened() {
    const fixture = TestBed.createComponent(ThemeMenu);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const trigger = fixture.nativeElement.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    trigger.click();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r));
    const items = () => Array.from(fixture.nativeElement.querySelectorAll('[role="menuitemradio"]')) as HTMLButtonElement[];
    const key = async (k: string) => {
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      await fixture.whenStable();
    };
    return { fixture, trigger, items, key };
  }

  it('lists every theme with a preview and its name, the current one ticked', async () => {
    TestBed.inject(ThemeService).pick('ocean');
    const { trigger, items } = await opened();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(items().map(i => i.textContent?.trim())).toEqual(['System', 'Light', 'Dark', 'Ocean', 'Midnight', 'High contrast']);
    expect(items().filter(i => i.getAttribute('aria-checked') === 'true').map(i => i.dataset['themeChoice'])).toEqual(['ocean']);
    // Each preview is that theme's own swatch tokens (styles.css [data-swatch]), whichever theme is on.
    expect(items().map(i => i.querySelector('.theme-chip')?.getAttribute('data-swatch')))
      .toEqual(['system', 'light', 'dark', 'ocean', 'midnight', 'contrast']);
    expect(trigger.title).toBe('Theme: Ocean');
  });

  it('opens on the ticked theme and moves with the arrows, Home and End', async () => {
    TestBed.inject(ThemeService).pick('dark');
    const { items, key } = await opened();
    expect(document.activeElement).toBe(items()[2]);
    await key('ArrowDown');
    expect(document.activeElement).toBe(items()[3]);
    await key('End');
    expect(document.activeElement).toBe(items()[5]);
    await key('ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    await key('ArrowUp');
    expect(document.activeElement).toBe(items()[5]);
    await key('Home');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('picks a theme, closes, and gives focus back to the button', async () => {
    const { fixture, trigger, items } = await opened();
    items()[4].click();
    await fixture.whenStable();
    expect(choose).toHaveBeenCalledWith('midnight');
    expect(TestBed.inject(ThemeService).active()).toBe('midnight');
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Escape closes without picking', async () => {
    const { fixture, trigger, key } = await opened();
    await key('Escape');
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(choose).not.toHaveBeenCalled();
  });

  it('a click outside closes it', async () => {
    const { fixture } = await opened();
    document.body.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });
});
