import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DateField, dayText } from './date-field';

/** UI review U3: a day reads as the console writes days, whatever the computer's locale. */
describe('Date field', () => {
  function make() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(DateField);
    fixture.componentRef.setInput('label', 'Start date');
    fixture.detectChanges();
    return { fixture, field: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('writes a day as d MMM yyyy, with no time zone in between', () => {
    expect(dayText('2026-10-05')).toBe('5 Oct 2026');
    expect(dayText('2026-01-31')).toBe('31 Jan 2026');
    expect(dayText('2026-13-01')).toBe('');
    expect(dayText('')).toBe('');
    expect(dayText(null)).toBe('');
  });

  it('shows the form value and reports a pick to the form', () => {
    const { fixture, field, el } = make();
    const changes: string[] = [];
    field.registerOnChange(v => changes.push(v));
    field.writeValue('2026-10-05');
    fixture.detectChanges();
    expect(el.querySelector('.date-field-button')?.textContent).toContain('5 Oct 2026');
    const native = el.querySelector<HTMLInputElement>('input[type="date"]')!;
    native.value = '2026-10-07';
    native.dispatchEvent(new Event('change'));
    expect(changes).toEqual(['2026-10-07']);
    expect(field.shown()).toBe('7 Oct 2026');
  });

  it('follows [value] when the page changes it', async () => {
    const { fixture, field } = make();
    fixture.componentRef.setInput('value', '2026-09-29');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(field.shown()).toBe('29 Sep 2026');
  });

  it('says none is picked, and offers Clear only when clearable', () => {
    const { fixture, el } = make();
    expect(el.querySelector('.date-field-button')?.getAttribute('aria-label')).toBe('Start date: none picked');
    fixture.componentRef.setInput('clearable', true);
    fixture.componentInstance.writeValue('2026-10-05');
    fixture.detectChanges();
    expect(el.querySelector('[aria-label="Clear Start date"]')).not.toBeNull();
  });
});
