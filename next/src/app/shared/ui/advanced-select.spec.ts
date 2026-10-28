import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AdvancedOption, AdvancedSelect, VIRTUAL_AT, filterOptions, rowsOf } from './advanced-select';

/**
 * The console's advanced select (owner 2026-10-27, "all select should be advance"): search, a description, a sample and a
 * badge per option, groups, the ARIA combobox pattern, keyboard, loading and empty states, and long lists drawn a window
 * at a time.
 */
const PIPELINES: AdvancedOption[] = [
  { value: '1476', label: 'Patient intake · summary report', description: 'Last run #3021 · 1 row · 71 columns', badge: 'Fits 79 of 83', badgeTone: 'ok', group: 'Intake' },
  { value: '1475', label: 'Patient intake · assess', description: 'Last run #3019 · 1 row · 18 columns', badge: 'Fits 21 of 83', group: 'Intake' },
  { value: '1028', label: 'X-ray triage outcomes', description: 'Last run #2800 · 40 rows', keywords: 'radiology imaging', group: 'Imaging' },
  { value: '1047', label: 'Bone fracture review', description: 'No runs yet', disabled: true, group: 'Imaging' },
];

function make(inputs: Record<string, unknown> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [AdvancedSelect] });
  const fixture = TestBed.createComponent(AdvancedSelect);
  fixture.componentRef.setInput('options', PIPELINES);
  fixture.componentRef.setInput('ariaLabel', 'Pipeline');
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, box: fixture.componentInstance, el };
}

const key = (k: string) => new KeyboardEvent('keydown', { key: k, cancelable: true });

describe('AdvancedSelect', () => {
  it('finds an option by its name first, then by its description and keywords, inside its group', () => {
    expect(filterOptions(PIPELINES, 'intake').map(o => o.value)).toEqual(['1476', '1475']);
    expect(filterOptions(PIPELINES, 'radiology').map(o => o.value)).toEqual(['1028']);
    expect(filterOptions(PIPELINES, '3019').map(o => o.value)).toEqual(['1475']);
    expect(filterOptions(PIPELINES, 'intake summary').map(o => o.value)).toEqual(['1476']);
    expect(filterOptions(PIPELINES, '   ')).toBe(PIPELINES);
  });

  it('puts a group heading before each group\'s first option', () => {
    expect(rowsOf(PIPELINES).map(r => (r.kind === 'group' ? '#' + r.label : r.option!.value))).toEqual(['#Intake', '1476', '1475', '#Imaging', '1028', '1047']);
  });

  it('is a button that opens a searchable listbox, named and wired as an ARIA combobox', async () => {
    const { fixture, box, el } = make({ value: '1476' });
    const trigger = el.querySelector('button.adv-trigger') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-label')).toBe('Pipeline: Patient intake · summary report');
    expect(trigger.textContent).toContain('Last run #3021');
    trigger.click();
    fixture.detectChanges();
    await Promise.resolve();
    // The panel is drawn in the overlay (the page's top layer), so no dialog's overflow clips it.
    const pane = document.querySelector('.cdk-overlay-pane') as HTMLElement;
    expect(pane).toBeTruthy();
    expect(el.contains(pane)).toBe(false);
    const search = pane.querySelector('input[role="combobox"]') as HTMLInputElement;
    const list = pane.querySelector('[role="listbox"]') as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(list.id);
    expect(search.getAttribute('aria-controls')).toBe(list.id);
    expect(search.getAttribute('aria-activedescendant')).toBe(box.optionId(0));
    expect(pane.querySelectorAll('[role="option"]').length).toBe(4);
    expect(pane.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain('Fits 79 of 83');
    expect(pane.querySelector('[role="option"][aria-disabled="true"]')?.textContent).toContain('Bone fracture review');
    expect(pane.querySelector('.sr-only[role="status"]')?.textContent).toContain('4 options');
    // A press inside the panel is not "outside": the panel stays open until a pick.
    pane.querySelector('.adv-search')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(box.open()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(box.open()).toBe(false);
  });

  it('moves with the arrow keys, Home and End, skips what cannot be chosen, and picks with Enter', () => {
    const { fixture, box } = make();
    const picks: (string | undefined)[] = [];
    box.picked.subscribe(o => picks.push(o?.value));
    box.openPanel();
    fixture.detectChanges();
    box.onKey(key('ArrowDown'));
    expect(box.active()).toBe(0);
    box.onKey(key('End'));
    expect(box.active()).toBe(2);
    box.onKey(key('Home'));
    box.onKey(key('ArrowDown'));
    box.onKey(key('Enter'));
    expect(box.value()).toBe('1475');
    expect(picks).toEqual(['1475']);
    expect(box.open()).toBe(false);
  });

  it('narrows as one types, and Enter takes the only match', () => {
    const { fixture, box } = make();
    box.openPanel();
    box.onSearch('x-ray');
    fixture.detectChanges();
    expect(box.countText()).toBe('1 of 4');
    box.onKey(key('Enter'));
    expect(box.value()).toBe('1028');
  });

  it('closes with Escape without choosing, and opens from the button with a typed letter as the search', () => {
    const { box } = make({ value: '1476' });
    box.openPanel();
    const esc = key('Escape');
    box.onKey(esc);
    expect(box.open()).toBe(false);
    expect(esc.defaultPrevented).toBe(true);
    expect(box.value()).toBe('1476');
    box.onTriggerKey(key('b'));
    expect(box.open()).toBe(true);
    expect(box.query()).toBe('b');
  });

  it('says it is loading, or why the list is empty', () => {
    const loading = make({ loading: true, inline: true });
    expect(loading.el.querySelector('[role="listbox"]')?.getAttribute('aria-busy')).toBe('true');
    expect(loading.el.textContent).toContain('Loading…');
    const empty = make({ options: [], inline: true, emptyText: 'No pipelines yet.' });
    expect(empty.el.textContent).toContain('No pipelines yet.');
    empty.box.onSearch('zz');
    const none = make({ inline: true, noMatchText: 'No pipeline matches.' });
    none.box.onSearch('zzz');
    none.fixture.detectChanges();
    expect(none.el.textContent).toContain('No pipeline matches.');
  });

  it('draws a long list a window at a time, and still reaches its last option from the keyboard', () => {
    const many: AdvancedOption[] = Array.from({ length: 1000 }, (_, i) => ({ value: String(i), label: `Column ${i}`, sample: `v${i}` }));
    const { fixture, box, el } = make({ options: many, inline: true });
    expect(box.virtual()).toBe(true);
    expect(el.querySelectorAll('[role="option"]').length).toBeLessThan(VIRTUAL_AT);
    box.onKey(key('End'));
    fixture.detectChanges();
    expect(box.active()).toBe(999);
    expect(box.activeId()).toBe(box.optionId(999));
    expect(box.scrollTop()).toBeGreaterThan(0);
  });

  it('works as a form control, and a "none" row clears it', () => {
    const { box } = make({ allowClear: true, clearLabel: 'Leave it blank' });
    const changes: (string | number | null)[] = [];
    box.registerOnChange(v => changes.push(v));
    box.writeValue(1475 as unknown as string);
    expect(box.chosen()?.label).toBe('Patient intake · assess');
    box.openPanel();
    box.pickClear(new Event('mousedown'));
    expect(changes).toEqual(['']);
    box.setDisabledState(true);
    expect(box.isDisabled()).toBe(true);
  });

  it('hands a numeric form a number, and null for "none"; a nullable one null', () => {
    const numeric = make({ allowClear: true, numeric: true });
    const got: unknown[] = [];
    numeric.box.registerOnChange(v => got.push(v));
    numeric.box.writeValue(1028);
    expect(numeric.box.value()).toBe('1028');
    numeric.box.openPanel();
    numeric.box.pick(PIPELINES[1], new Event('mousedown'));
    numeric.box.openPanel();
    numeric.box.pickClear(new Event('mousedown'));
    expect(got).toEqual([1475, null]);
    const nullable = make({ allowClear: true, nullable: true });
    const kept: unknown[] = [];
    nullable.box.registerOnChange(v => kept.push(v));
    nullable.box.openPanel();
    nullable.box.pick(PIPELINES[0], new Event('mousedown'));
    nullable.box.openPanel();
    nullable.box.pickClear(new Event('mousedown'));
    expect(kept).toEqual(['1476', null]);
  });

  it('as an "Add …" menu, only emits the pick and keeps showing its placeholder', () => {
    const { box, el, fixture } = make({ resetOnPick: true, placeholder: 'Add a pipeline' });
    const picks: (string | undefined)[] = [];
    box.picked.subscribe(o => picks.push(o?.value));
    box.openPanel();
    box.pick(PIPELINES[2], new Event('mousedown'));
    fixture.detectChanges();
    expect(picks).toEqual(['1028']);
    expect(box.value()).toBe('');
    expect(el.querySelector('button.adv-trigger')?.textContent).toContain('Add a pipeline');
  });

  it('says it is loading, not "Choose…", while its list is read', () => {
    const { el } = make({ options: [], value: '1476', loading: true, placeholder: 'Choose a pipeline' });
    expect(el.querySelector('button.adv-trigger')?.textContent).toContain('Loading…');
    expect(el.querySelector('button.adv-trigger')?.textContent).not.toContain('Choose a pipeline');
    const empty = make({ options: [], loading: true, loadingText: 'Loading pipelines…' });
    expect(empty.el.querySelector('button.adv-trigger')?.textContent).toContain('Loading pipelines…');
  });
});
