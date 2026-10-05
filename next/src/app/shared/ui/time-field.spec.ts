import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TimeField, normaliseTime } from './time-field';

/** UI review U3: the 24-hour clock everywhere, whatever the computer's locale. */
describe('Time field', () => {
  function make() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TimeField);
    fixture.detectChanges();
    return { fixture, field: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('reads stored times as HH:mm', () => {
    expect(normaliseTime('09:30:00')).toBe('09:30');
    expect(normaliseTime('7:5')).toBe('07:05');
    expect(normaliseTime('24:00')).toBe('');
    expect(normaliseTime('soon')).toBe('');
  });

  it('offers hours 00 to 23 and no AM or PM', () => {
    const { el } = make();
    const hours = Array.from(el.querySelectorAll('select')[0].options).map(o => o.value).filter(Boolean);
    expect(hours[0]).toBe('00');
    expect(hours[hours.length - 1]).toBe('23');
    expect(el.textContent).not.toMatch(/AM|PM/);
  });

  it('shows the form value and reports a change as HH:mm', () => {
    const { fixture, field, el } = make();
    const changes: string[] = [];
    field.registerOnChange(v => changes.push(v));
    field.writeValue('14:05:00');
    fixture.detectChanges();
    const [hour, minute] = Array.from(el.querySelectorAll('select'));
    expect(hour.value).toBe('14');
    expect(minute.value).toBe('05');
    hour.value = '22';
    hour.dispatchEvent(new Event('change'));
    expect(changes).toEqual(['22:05']);
  });
});
