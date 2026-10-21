import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KpiTrend } from './kpi-trend';

/** ZT-A14 (2026-10-21): a figure with its trend read "+6.7% vs 2025-11-01" and "2025-01-01 ... 2025-12-01" under its spark. */
describe('a figure with its trend', () => {
  it('ZT-A14: writes its periods as the line charts do', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(KpiTrend);
    fixture.componentRef.setInput('marks', [{ name: '2025-10-01', value: 100 }, { name: '2025-11-01', value: 120 }, { name: '2025-12-01', value: 128 }]);
    fixture.componentRef.setInput('label', 'Total');
    fixture.detectChanges();
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('vs 1 Nov 2025');
    expect(text).toContain('1 Oct 2025');
    expect(text).toContain('1 Dec 2025');
    expect(text).not.toContain('2025-11-01');
  });
});
