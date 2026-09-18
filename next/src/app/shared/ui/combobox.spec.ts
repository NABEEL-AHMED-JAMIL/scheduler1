import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Combobox } from './combobox';

/**
 * The box replaced every long <select> on 2026-09-18 -- topics, tasks, tenants, buckets,
 * files -- so its two extensions from that day are pinned here: a numeric control gets a
 * number back (an id compared with === elsewhere), and a box outside a form can be driven by
 * `selected` / `selectedChange` the way a filter signal needs.
 */
describe('Combobox', () => {
  function make(): Combobox {
    TestBed.configureTestingModule({ imports: [Combobox] });
    const fixture = TestBed.createComponent(Combobox);
    fixture.componentRef.setInput('options', [
      { value: '10', label: 'Claims intake', hint: 'medaxis-claims-intake' },
      { value: '20', label: 'Billing intake', hint: 'medaxis-billing-intake' },
    ]);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('hands a numeric control a number, and null when cleared', () => {
    const box = make();
    (box as any).numeric = () => true;
    const changes: unknown[] = [];
    box.registerOnChange(v => changes.push(v));
    box.selectOption({ value: '10', label: 'Claims intake' }, new Event('mousedown'));
    box.selectClear(new Event('mousedown'));
    expect(changes).toEqual([10, null]);
  });

  it('hands a plain control the string, and reports every pick on selectedChange', () => {
    const box = make();
    const changes: string[] = [];
    box.registerOnChange(v => changes.push(v));
    const picks: string[] = [];
    box.selectedChange.subscribe(v => picks.push(v));
    box.selectOption({ value: '20', label: 'Billing intake' }, new Event('mousedown'));
    box.selectClear(new Event('mousedown'));
    expect(changes).toEqual(['20', '']);
    expect(picks).toEqual(['20', '']);
  });

  it('accepts a number from writeValue and shows its label', () => {
    const box = make();
    box.writeValue(10 as any);
    expect(box.value()).toBe('10');
    expect(box.displayValue()).toBe('Claims intake');
  });

  it('matches the hint as well as the label, so a Kafka topic finds its row', () => {
    const box = make();
    box.onInput('billing-intake');
    expect(box.filtered().map(o => o.label)).toEqual(['Billing intake']);
  });

  describe('remote mode', () => {
    function remote() {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [Combobox] });
      const fixture = TestBed.createComponent(Combobox);
      fixture.componentRef.setInput('remote', true);
      fixture.componentRef.setInput('options', [{ value: '10', label: 'Claims intake' }]);
      fixture.componentRef.setInput('selectedLabel', 'Audit alerts');
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    it('does no filtering of its own -- the server already did', () => {
      const box = remote();
      box.onInput('zzz');
      expect(box.filtered().map(o => o.label)).toEqual(['Claims intake']);
    });

    it('asks once on focus with nothing typed, and again a beat after typing stops', () => {
      vi.useFakeTimers();
      try {
        const box = remote();
        const asked: string[] = [];
        box.search.subscribe(q => asked.push(q));
        box.onFocus();
        expect(asked).toEqual(['']);
        box.onInput('cl');
        box.onInput('cla');
        expect(asked).toEqual(['']);
        vi.advanceTimersByTime(260);
        expect(asked).toEqual(['', 'cla']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows the label it was handed for a value the options do not include', () => {
      const box = remote();
      box.writeValue('99');
      expect(box.displayValue()).toBe('Audit alerts');
    });
  });
});
