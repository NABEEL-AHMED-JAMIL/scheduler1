import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChartTokens } from './chart-tokens';

/**
 * Owner 2026-10-13: the "Console" chart theme follows the app theme. Each app theme gives --chart-N (and the chrome)
 * its own values (styles.css, "App themes"; contrast.spec.ts holds them to the 3:1 rule and more), and ChartTokens
 * re-reads them the moment <html> changes theme -- Ocean and High contrast change data-theme alone, with no class.
 */
describe('the Console chart theme follows the app theme', () => {
  const root = document.documentElement;

  afterEach(() => {
    root.removeAttribute('data-theme');
    root.style.removeProperty('--chart-0');
  });

  it('re-reads the palette when data-theme changes, with no change of class', async () => {
    root.style.setProperty('--chart-0', '#2563eb');
    TestBed.resetTestingModule();
    const tokens = TestBed.inject(ChartTokens);
    expect(tokens.tokens().palette[0]).toBe('#2563eb');
    // What styles.css's Ocean block does to the first slot.
    root.style.setProperty('--chart-0', '#0e7490');
    root.setAttribute('data-theme', 'ocean');
    await new Promise(r => setTimeout(r));
    expect(tokens.tokens().palette[0]).toBe('#0e7490');
    expect(tokens.tokens().mode).toBe('light');
  });
});
