import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { useMemoryStorage } from '../testing/memory-storage';
import { DateRange, DateRangePicker, presetRange, rangeKey, rangeText, restoreRange, saveRange } from './date-range';

/** Owner 2026-10-12 (B1, D3): one date-range control -- presets apply on choice, Custom in a popover, per viewer. */
describe('date range helpers', () => {
  useMemoryStorage();
  const today = new Date(2026, 9, 12, 20, 11);

  it('reads each preset against the reader\'s calendar', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(presetRange('7d', today)).toEqual({ from: '2026-10-06', to: '2026-10-12' });
    expect(presetRange('30d', today)).toEqual({ from: '2026-09-13', to: '2026-10-12' });
    expect(presetRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-12' });
  });

  it('writes a range as a subtitle says it', () => {
    expect(rangeText('2026-10-06', '2026-10-12')).toBe('6 Oct – 12 Oct 2026');
    expect(rangeText('2025-12-29', '2026-01-04')).toBe('29 Dec 2025 – 4 Jan 2026');
    expect(rangeText('2026-10-12', '2026-10-12')).toBe('12 Oct 2026');
    expect(rangeText('', '2026-10-12')).toBe('');
  });

  it('remembers a choice per viewer, a rolling preset as the preset', () => {
    const mine = rangeKey('home', 4640), theirs = rangeKey('home', 4641);
    saveRange(mine, { from: '2026-09-13', to: '2026-10-12', preset: '30d' });
    expect(JSON.parse(localStorage.getItem(mine)!)).toEqual({ preset: '30d' });
    expect(restoreRange(mine, '7d', today)).toEqual({ from: '2026-09-13', to: '2026-10-12', preset: '30d' });
    expect(restoreRange(theirs, '7d', today).preset).toBe('7d');
  });

  it('keeps a custom range\'s days, and falls back on anything it cannot read', () => {
    const key = rangeKey('runs', 1);
    saveRange(key, { from: '2026-09-01', to: '2026-09-07', preset: 'custom' });
    expect(restoreRange(key, '7d', today)).toEqual({ from: '2026-09-01', to: '2026-09-07', preset: 'custom' });
    localStorage.setItem(key, '{"preset":"custom","from":"2026-09-09","to":"2026-09-01"}');
    expect(restoreRange(key, 'today', today).preset).toBe('today');
    localStorage.setItem(key, 'not json');
    expect(restoreRange(key, '7d', today).preset).toBe('7d');
    expect(restoreRange(null, 'month', today)).toEqual({ from: '2026-10-01', to: '2026-10-12', preset: 'month' });
  });
});

@Component({
  imports: [DateRangePicker],
  template: `<app-date-range [value]="range()" [storageKey]="key" [maxSpanDays]="31" (rangeChange)="changed($event)" />`,
})
class Host {
  readonly key = rangeKey('home', 4640);
  readonly range = signal<DateRange>({ from: '2026-10-06', to: '2026-10-12', preset: '7d' });
  readonly seen: DateRange[] = [];
  changed(r: DateRange): void { this.seen.push(r); this.range.set(r); }
}

describe('app-date-range', () => {
  useMemoryStorage();

  function mount() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (preset: string) => el.querySelector(`[data-preset="${preset}"]`) as HTMLButtonElement;
    return { fixture, el, host: fixture.componentInstance, button };
  }

  it('is one segmented control, the chosen preset lit, with no Apply button', () => {
    const { el, button } = mount();
    expect(el.querySelectorAll('.seg')).toHaveLength(1);
    expect([...el.querySelectorAll('.seg-btn')].map(b => b.textContent!.trim())).toEqual(['Today', '7 days', '30 days', 'This month', 'Custom']);
    expect(button('7d').getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).not.toContain('Apply');
    expect(el.querySelector('label')).toBeNull();
  });

  it('applies a preset the moment it is chosen, and remembers it', async () => {
    const { fixture, host, button } = mount();
    button('30d').click();
    await fixture.whenStable();
    expect(host.seen).toHaveLength(1);
    expect(host.seen[0].preset).toBe('30d');
    expect(JSON.parse(localStorage.getItem(host.key)!)).toEqual({ preset: '30d' });
    expect(button('30d').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens Custom as a popover with its own labelled fields, and checks them before it applies', async () => {
    const { fixture, el, host, button } = mount();
    button('custom').click();
    fixture.detectChanges();
    const pop = el.querySelector('[role="dialog"]')!;
    expect([...pop.querySelectorAll('label')].map(l => l.textContent!.trim())).toEqual(['From', 'To']);
    const picker = fixture.debugElement.children[0].componentInstance as DateRangePicker;
    picker.draftFrom.set('2026-10-10');
    picker.draftTo.set('2026-10-01');
    fixture.detectChanges();
    expect(pop.textContent).toContain('From must be on or before To.');
    picker.applyCustom();
    expect(host.seen).toEqual([]);
    picker.draftFrom.set('2026-07-01');
    picker.draftTo.set('2026-10-01');
    expect(picker.draftError()).toBe('Pick at most 31 days.');
    picker.draftFrom.set('2026-09-21');
    picker.applyCustom();
    await fixture.whenStable();
    expect(host.seen).toEqual([{ from: '2026-09-21', to: '2026-10-01', preset: 'custom' }]);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(button('custom').textContent).toContain('21 Sep – 1 Oct 2026');
  });

  it('closes the popover on a click outside it', () => {
    const { fixture, el, button } = mount();
    button('custom').click();
    fixture.detectChanges();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
