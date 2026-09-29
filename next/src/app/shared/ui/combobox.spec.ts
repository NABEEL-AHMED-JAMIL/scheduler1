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

/**
 * The list is driven by the arrow keys and aria-activedescendant, but its rows were buttons in
 * the tab order: Tab from the box landed on a row, the box blurred and closed, and the row it
 * had landed on vanished -- focus went to <body>. Escape blurred the box outright.
 */
describe('Combobox and the keyboard', () => {
  function rendered() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Combobox] });
    const fixture = TestBed.createComponent(Combobox);
    fixture.componentRef.setInput('options', [
      { value: '10', label: 'Claims intake' },
      { value: '20', label: 'Billing intake' },
    ]);
    fixture.componentRef.setInput('allowClear', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    return { fixture, el, input };
  }

  const key = (target: HTMLElement, name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it('keeps every option out of the tab order', () => {
    const { fixture, el, input } = rendered();
    input.focus();
    key(input, 'ArrowDown');
    fixture.detectChanges();
    const options = Array.from(el.querySelectorAll('[role="option"]'));
    expect(options.length).toBe(3);
    expect(options.every(o => o.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('closes on Escape and leaves focus in the box', () => {
    const { fixture, input } = rendered();
    input.focus();
    key(input, 'ArrowDown');
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('true');

    key(input, 'Escape');
    fixture.detectChanges();

    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the Escape that closed its list from also closing the dialog around it', () => {
    const { fixture, input } = rendered();
    input.focus();
    key(input, 'ArrowDown');
    fixture.detectChanges();
    const heard = vi.fn();
    document.addEventListener('keydown', heard);

    key(input, 'Escape');
    expect(heard).not.toHaveBeenCalled();

    // With the list already closed, Escape is the dialog's again.
    key(input, 'Escape');
    expect(heard).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', heard);
  });
});

/**
 * The list's text was the browser's 16px under a 14px (form) or 12px (toolbar) box, and an
 * option's hint -- a topic's Kafka name, a pipeline's description -- was only a tooltip, which a
 * keyboard or touch user never sees (UI audit, Low).
 */
describe('Combobox option list', () => {
  function opened() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Combobox] });
    const fixture = TestBed.createComponent(Combobox);
    fixture.componentRef.setInput('options', [
      { value: '10', label: 'Claims intake', hint: 'medaxis-claims-intake' },
      { value: '20', label: 'Billing intake' },
    ]);
    fixture.componentRef.setInput('allowClear', false);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    return el;
  }

  it('matches the box\'s type size', () => {
    expect(opened().querySelector('[role="listbox"]')!.classList).toContain('text-sm');
  });

  it('shows each option\'s hint under its label, and keeps both in the tooltip', () => {
    const [claims, billing] = Array.from(opened().querySelectorAll<HTMLElement>('[role="option"]'));
    expect(claims.textContent).toContain('medaxis-claims-intake');
    expect(claims.title).toBe('Claims intake — medaxis-claims-intake');
    expect(billing.title).toBe('Billing intake');
  });
});

/**
 * MIG-249: a row that is listed but cannot be picked -- a step task the Task Registry has turned off. It shows,
 * marked, so a person sees why it is not there to add; a click, Enter or the arrow keys never choose it.
 */
describe('Combobox disabled options', () => {
  function withDisabled() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Combobox] });
    const fixture = TestBed.createComponent(Combobox);
    fixture.componentRef.setInput('options', [
      { value: 'filter', label: 'Filter rows (disabled)', disabled: true },
      { value: 'select', label: 'select' },
    ]);
    fixture.componentRef.setInput('allowClear', false);
    fixture.detectChanges();
    return fixture;
  }

  it('marks a disabled row and will not pick it by click', () => {
    const fixture = withDisabled();
    const box = fixture.componentInstance;
    const picks: string[] = [];
    box.selectedChange.subscribe(v => picks.push(v));
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    const [filter] = Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(filter.getAttribute('aria-disabled')).toBe('true');
    box.selectOption({ value: 'filter', label: 'Filter rows (disabled)', disabled: true }, new Event('mousedown'));
    expect(picks).toEqual([]);
  });

  it('skips a disabled row with the arrow keys, so Enter picks the next one', () => {
    const fixture = withDisabled();
    const box = fixture.componentInstance;
    const picks: string[] = [];
    box.selectedChange.subscribe(v => picks.push(v));
    box.onFocus();
    box.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    box.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(picks).toEqual(['select']);
  });
});
