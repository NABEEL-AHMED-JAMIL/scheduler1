import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DataText } from './data-text';
import { capTitle, clipText, TITLE_MAX } from './long-text';

/**
 * A value from a customer's file, drawn so that no length of it can break the screen around it.
 *
 * Owner, 2026-09-28: "if text is big in some csv the statistics or text not wrapping, so need a
 * way we handle this". A ledger's notes column runs to 20,000 characters a row, and one of them
 * printed on a single line made the Compact table 5,000px wide. The test DOM does no layout, so
 * the clamp is pinned at the class and style level and the rest is behaviour: the tooltip is
 * capped, "Show all" appears for a value longer than it can show, and it opens the whole value.
 */

const HUGE = 'Remittance advice received from vendor; reconciled. '.repeat(400).slice(0, 20_000);
const ONE_TOKEN = 'x'.repeat(20_000);

@Component({
  imports: [DataText],
  template: `<app-data-text [value]="value()" [lines]="lines()" label="notes" />`,
})
class Host {
  readonly value = signal<string | null>(HUGE);
  readonly lines = signal(1);
}

function render(value: string | null, lines = 1) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.value.set(value);
  fixture.componentInstance.lines.set(lines);
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('app-data-text') as HTMLElement;
  return { fixture, host, shown: host.querySelector('.data-text-value') as HTMLElement };
}

afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach(node => node.remove()));

describe('capping a value for a tooltip', () => {
  it('keeps a short value whole', () => {
    expect(capTitle('North')).toBe('North');
  });

  it('cuts a 20,000-character value to the cap and says it was cut', () => {
    const title = capTitle(HUGE);
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX + 1);
    expect(title.endsWith('…')).toBe(true);
    expect(HUGE.startsWith(title.slice(0, -1))).toBe(true);
  });

  it('never splits a character that takes two code units', () => {
    // An emoji is a surrogate pair; cutting between its halves prints a replacement glyph.
    const clipped = clipText('😀'.repeat(10), 3);
    expect(clipped).toBe('😀😀😀…');
  });

  it('treats a missing value as nothing rather than the word "null"', () => {
    expect(capTitle(null)).toBe('');
    expect(capTitle(undefined)).toBe('');
  });
});

describe('app-data-text', () => {
  it('clamps to the lines asked for and lets even one huge token wrap', () => {
    const { host, shown } = render(ONE_TOKEN, 3);
    // The clamp is a class plus the line count as a custom property: styles.css turns the pair into
    // -webkit-line-clamp with overflow-wrap: anywhere, which the test DOM cannot lay out.
    expect(shown.classList).toContain('data-text-value');
    expect(host.style.getPropertyValue('--data-text-lines')).toBe('3');
    expect(shown.classList).not.toContain('truncate');
    expect(shown.classList).not.toContain('whitespace-nowrap');
  });

  it('defaults to one line', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [DataText] }).createComponent(DataText);
    fixture.componentRef.setInput('value', 'North');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).style.getPropertyValue('--data-text-lines')).toBe('1');
  });

  it('puts a capped value in the tooltip, never all 20,000 characters', () => {
    const { shown } = render(HUGE);
    const title = shown.getAttribute('title')!;
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX + 1);
    expect(title.endsWith('…')).toBe(true);
  });

  it('does not hand the page more of the value than a clamp could ever show', () => {
    // 20,000 characters per cell times a few hundred rows is megabytes of text laid out only to be
    // hidden; the whole value is one click away in the panel.
    const { shown } = render(HUGE);
    expect(shown.textContent!.trim().length).toBeLessThan(HUGE.length);
    expect(HUGE.startsWith(shown.textContent!.trim())).toBe(true);
  });

  it('offers "Show all" for a value longer than it can show', () => {
    const { host } = render(HUGE);
    const more = host.querySelector<HTMLButtonElement>('button.data-text-more')!;
    expect(more).not.toBeNull();
    expect(more.getAttribute('type')).toBe('button');
    expect(more.textContent).toContain('Show all');
    expect(more.getAttribute('aria-label')).toContain('Show all');
    expect(more.getAttribute('aria-label')).toContain('20,000');
  });

  it('offers nothing extra for a short value', () => {
    const { host, shown } = render('North');
    expect(host.querySelector('.data-text-more')).toBeNull();
    expect(shown.textContent!.trim()).toBe('North');
    expect(shown.getAttribute('title')).toBe('North');
  });

  it('draws a null as nothing, leaving the caller to say null or blank its own way', () => {
    const { host, shown } = render(null);
    expect(shown.textContent!.trim()).toBe('');
    expect(host.querySelector('.data-text-more')).toBeNull();
  });

  it('opens the whole value in a side panel, with its length and a Copy button', async () => {
    const { fixture, host } = render(HUGE);
    host.querySelector<HTMLButtonElement>('button.data-text-more')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const panel = document.querySelector('app-data-text-panel') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.side-panel')).not.toBeNull();
    expect(panel.querySelector('.data-text-full')!.textContent).toBe(HUGE);
    expect(panel.textContent).toContain('20,000 characters');
    expect(panel.textContent).toContain('notes');
    const copy = [...panel.querySelectorAll('button')].find(button => /Copy/.test(button.textContent ?? ''));
    expect(copy).toBeTruthy();
  });

  it('keeps the click on "Show all" from also opening the row it sits in', () => {
    const { host } = render(HUGE);
    let reachedRow = false;
    host.parentElement!.addEventListener('click', () => { reachedRow = true; });
    host.querySelector<HTMLButtonElement>('button.data-text-more')!.click();
    expect(reachedRow).toBe(false);
  });
});
