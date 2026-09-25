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

  it('shows a `selected` value by label even when its options arrive after it', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Combobox] });
    const fixture = TestBed.createComponent(Combobox);
    fixture.componentRef.setInput('selected', 1009);
    fixture.componentRef.setInput('selectedLabel', 'Platform Local Broker [PF] (platform default)');
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    // Before the list: the label it was handed, never the bare id.
    expect(input.value).toBe('Platform Local Broker [PF] (platform default)');

    fixture.componentRef.setInput('selectedLabel', '');
    fixture.componentRef.setInput('options', [{ value: '1009', label: 'Platform Local Broker' }]);
    fixture.detectChanges();
    expect(input.value).toBe('Platform Local Broker');
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
  /**
   * UI audit B.0: the box said role=combobox but never pointed at its list, the options had no
   * ids, and the highlighted row was an inline background -- so a screen reader heard nothing as
   * the arrow keys moved. A toolbar box outside a field had no name but its placeholder.
   */
  describe('what a screen reader is told', () => {
    function rendered(inputs: Record<string, unknown> = {}) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [Combobox] });
      const fixture = TestBed.createComponent(Combobox);
      fixture.componentRef.setInput('options', [
        { value: '10', label: 'Claims intake' },
        { value: '20', label: 'Billing intake' },
      ]);
      for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const input = el.querySelector('input[role="combobox"]') as HTMLInputElement;
      return { fixture, el, input, box: fixture.componentInstance };
    }

    it('points the box at its list and at the highlighted option', () => {
      const { fixture, el, input, box } = rendered();
      box.onInput('intake');
      box.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      fixture.detectChanges();
      const list = el.querySelector('[role="listbox"]')!;
      expect(list.id).toBeTruthy();
      expect(input.getAttribute('aria-controls')).toBe(list.id);
      const options = [...el.querySelectorAll('[role="option"]')].filter(o => o.textContent!.includes('intake'));
      const active = input.getAttribute('aria-activedescendant');
      expect(active).toBe(options[1].id);
      expect(options[1].classList).toContain('is-active');
      expect((options[1] as HTMLElement).style.background).toBe('');
    });

    it('marks the chosen option selected', () => {
      const { fixture, el, box } = rendered();
      box.writeValue('20');
      box.onInput('intake');
      fixture.detectChanges();
      const options = [...el.querySelectorAll('[role="option"]')].filter(o => o.textContent!.includes('intake'));
      expect(options.map(o => o.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    });

    it('gives two boxes on one page different list ids', () => {
      const a = rendered();
      a.box.onFocus(); a.fixture.detectChanges();
      const first = a.el.querySelector('[role="listbox"]')!.id;
      const b = rendered();
      b.box.onFocus(); b.fixture.detectChanges();
      expect(b.el.querySelector('[role="listbox"]')!.id).not.toBe(first);
    });

    it('takes a name for a box outside a labelled field', () => {
      const { input } = rendered({ ariaLabel: 'Filter by topic' });
      expect(input.getAttribute('aria-label')).toBe('Filter by topic');
    });

    it('leaves the name to the field label when none is given', () => {
      const { input } = rendered();
      expect(input.hasAttribute('aria-label')).toBe(false);
    });
  });
});
