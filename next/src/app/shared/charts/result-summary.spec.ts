import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ResultSummary } from './result-summary';

/**
 * ZT-A14 (2026-10-21, Meridian): a monthly trend's summary read "First 2025-01-01", "Biggest move 2025-02-01 to
 * 2025-03-01" beside a line whose axis says "1 Jan 2025". The summary writes a date as the line does.
 */
describe('the summary of a trend', () => {
  it('ZT-A14: names its first, last and biggest move by the day as the console writes it', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ResultSummary);
    fixture.componentRef.setInput('mode', 'trend');
    fixture.componentRef.setInput('data', [{ name: '2025-01-01', value: 59096.56 }, { name: '2025-02-01', value: -138179.62 },
      { name: '2025-03-01', value: 217202.91 }]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('1 Jan 2025');
    expect(text).toContain('1 Mar 2025');
    expect(text).toContain('1 Feb 2025 to 1 Mar 2025');
    expect(text).not.toContain('2025-01-01');
  });
});
