import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { KpiCard } from './kpi-card';

/**
 * MIG-212: the figure is the answer, and "does not shorten the number" -- yet in a board cell it
 * was cut to "103,90…" by truncate. It is sized to its card instead, and wraps before it is cut.
 */
describe('KpiCard', () => {
  function mount(size: 'md' | 'lg') {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(KpiCard);
    fixture.componentRef.setInput('value', '103909527.58');
    fixture.componentRef.setInput('label', 'amount sum');
    fixture.componentRef.setInput('size', size);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('never truncates the figure, and sizes it to its own card', () => {
    for (const size of ['md', 'lg'] as const) {
      const host = mount(size);
      const figure = host.querySelector('.kpi-figure')!;
      expect(figure.textContent!.trim(), size).toBe('103,909,527.58');
      expect(figure.classList.contains('truncate'), size).toBe(false);
      expect(host.classList.contains('kpi-card'), size).toBe(true);
      expect(figure.classList.contains('is-lg'), size).toBe(size === 'lg');
    }
  });
});
