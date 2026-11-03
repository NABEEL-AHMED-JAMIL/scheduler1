import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { advancedSelects } from '../../../shared/ui/advanced-select.testing';
import { Block } from './designer-model';
import { PropChange, PropertiesPanel, fieldsFor } from './properties';

/** Feature 14: "Show only when" in the properties panel is the rule builder, writing the conditional's `when`. */
const definitions = {
  style: {},
  conditionalComponent: { properties: { id: {}, type: {}, name: { type: 'string', maxLength: 120 },
    condition: { type: 'object', properties: { left: { type: 'string' }, operator: { enum: ['eq', 'gt'] }, right: { type: ['string', 'number'] } } },
    when: { type: 'string', maxLength: 2000 }, children: { type: 'array' } } },
};
const fields = [
  { path: 'patient_id', type: 'string', nullable: false },
  { path: 'wound', type: 'object', nullable: false },
  { path: 'wound.stage', type: 'number', nullable: false },
  { path: 'wound.site', type: 'string', nullable: false },
  { path: 'visits', type: 'list', nullable: false },
  { path: 'visits[].area', type: 'number', nullable: false },
];
const records = [
  { patient_id: 'P-1042', wound: { stage: 3, site: 'Left heel' }, visits: [{ area: 4 }, { area: 12 }, { area: 2 }] },
  { patient_id: 'P-1077', wound: { stage: 1, site: 'Sacrum' }, visits: [] },
  { patient_id: 'P-1103', wound: { stage: 4, site: 'Right heel' }, visits: [] },
];

function panel(block: Block, blocks: Block[] = [block]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [PropertiesPanel] });
  const fixture = TestBed.createComponent(PropertiesPanel);
  fixture.componentRef.setInput('definitions', definitions);
  fixture.componentRef.setInput('block', block);
  fixture.componentRef.setInput('blocks', blocks);
  fixture.componentRef.setInput('fields', fields);
  fixture.componentRef.setInput('records', records);
  fixture.componentRef.setInput('recordTotal', 14);
  const changes: PropChange[] = [];
  fixture.componentInstance.changed.subscribe(c => {
    changes.push(c);
    const next = { ...(fixture.componentInstance.block() as Block), [c.key]: c.value };
    for (const k of c.unset ?? []) delete next[k];
    fixture.componentRef.setInput('block', next);
    fixture.detectChanges();
  });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const write = (label: string, value: string) => {
    const i = el.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    i.value = value;
    i.dispatchEvent(new Event(i instanceof HTMLTextAreaElement && label.includes('expression') ? 'input' : 'change'));
    fixture.detectChanges();
  };
  const field = (label: string, value: string) => {
    advancedSelects(fixture).find(s => s.ariaLabel() === label)!.choose(value);
    fixture.detectChanges();
  };
  const status = () => el.querySelector('[data-shows-for]')?.textContent?.trim() ?? '';
  return { fixture, el, changes, write, field, status, last: () => changes[changes.length - 1] };
}

describe('the rule builder of "Show only when"', () => {
  it('replaces the condition and expression settings with one builder', () => {
    const f = fieldsFor('conditional', definitions);
    expect(f.find(x => x.key === 'condition')).toBeUndefined();
    expect(f.find(x => x.key === 'when')).toEqual(expect.objectContaining({ kind: 'rule', label: 'Show when', group: 'data' }));
  });

  it('shows a structured condition as a row, counts it over the test records, and writes `when` in place of it', () => {
    const p = panel({ id: 'c1', type: 'conditional', condition: { left: 'primary.wound.stage', operator: 'gt', right: 2 }, children: [] });
    expect((p.el.querySelector('[aria-label="Rule 1 value"]') as HTMLInputElement).value).toBe('2');
    expect(p.status()).toBe('Shows for 2 of 3 test records (the data has 14)');
    p.write('Rule 1 test', 'in');
    p.write('Rule 1 values', '3\n4');
    expect(p.last()).toEqual({ key: 'when', value: 'primary.wound.stage in (3, 4)', unset: ['condition'] });
    expect(p.fixture.componentInstance.block()!['condition']).toBeUndefined();
    expect(p.status()).toBe('Shows for 2 of 3 test records (the data has 14)');
  });

  it('adds a second row joined by any, from the data\'s fields, and types numbers as numbers', () => {
    const p = panel({ id: 'c1', type: 'conditional', when: 'primary.wound.stage >= 4', children: [] });
    expect(advancedSelects(p.fixture).find(s => s.ariaLabel() === 'Rule 1 field')!.options().map(o => o.value))
      .toEqual(['primary.patient_id', 'primary.wound.stage', 'primary.wound.site']);
    ([...p.el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Rule') as HTMLButtonElement).click();
    p.fixture.detectChanges();
    p.field('Rule 2 field', 'primary.wound.site');
    p.write('Rule 2 test', 'contains');
    p.write('Rule 2 value', 'Sac');
    expect(p.last().value).toBe("primary.wound.stage >= 4 and contains(primary.wound.site, 'Sac')");
    p.write('Join the rules', 'any');
    expect(p.last().value).toBe("primary.wound.stage >= 4 or contains(primary.wound.site, 'Sac')");
    expect(p.status()).toBe('Shows for 2 of 3 test records (the data has 14)');
  });

  it('keeps an unfinished number in its box and writes nothing until it is one', () => {
    const p = panel({ id: 'c1', type: 'conditional', when: 'primary.wound.stage > 2', children: [] });
    p.write('Rule 1 value', 'three');
    expect(p.changes).toEqual([]);
    expect(p.el.textContent).toContain('three is not a number.');
    p.write('Rule 1 value', '3');
    expect(p.last().value).toBe('primary.wound.stage > 3');
  });

  it('leaves a hand-written expression it cannot show as text, and never rewrites it', () => {
    const p = panel({ id: 'c1', type: 'conditional', when: 'primary.wound.stage * 2 > 5 or not primary.flag', children: [] });
    const area = p.el.querySelector('[aria-label="Show when, as an expression"]') as HTMLTextAreaElement;
    expect(area.value).toBe('primary.wound.stage * 2 > 5 or not primary.flag');
    expect(p.el.querySelector('[data-kept-as-text]')).not.toBeNull();
    const useBuilder = [...p.el.querySelectorAll('button')].find(b => b.textContent!.includes('Use the builder')) as HTMLButtonElement;
    expect(useBuilder.disabled).toBe(true);
    expect(p.status()).toContain('does not count this expression');
    expect(p.changes).toEqual([]);
    p.write('Show when, as an expression', "primary.wound.site = 'Sacrum'");
    expect(p.last()).toEqual({ key: 'when', value: "primary.wound.site = 'Sacrum'", unset: ['condition'] });
    expect(useBuilder.disabled).toBe(false);
    useBuilder.click();
    p.fixture.detectChanges();
    expect((p.el.querySelector('[aria-label="Rule 1 value"]') as HTMLInputElement).value).toBe('Sacrum');
    expect(p.status()).toBe('Shows for 1 of 3 test records (the data has 14)');
  });

  it('says what is wrong with an expression that does not read, and writes nothing', () => {
    const p = panel({ id: 'c1', type: 'conditional', when: 'primary.a + 1 > 2', children: [] });
    p.write('Show when, as an expression', 'primary.a < 1 < 2');
    expect(p.changes).toEqual([]);
    expect(p.el.textContent).toContain('Comparisons cannot be chained');
  });

  it('inside "Repeat for each" offers the item\'s fields and counts the items of the first test record', () => {
    const cond: Block = { id: 'c2', type: 'conditional', when: 'visit.area > 3', children: [] };
    const rep: Block = { id: 'r1', type: 'repeat', dataset: 'primary.visits', as: 'visit', children: [cond] };
    const p = panel(cond, [rep]);
    expect(advancedSelects(p.fixture).find(s => s.ariaLabel() === 'Rule 1 field')!.options()[0].value).toBe('visit.area');
    expect(p.status()).toBe('Shows for 2 of 3 items of primary.visits in the first test record');
  });

  it('is read-only for a reader who may not edit', () => {
    const p = panel({ id: 'c1', type: 'conditional', when: 'primary.wound.stage > 2', children: [] });
    p.fixture.componentRef.setInput('readonly', true);
    p.fixture.detectChanges();
    expect((p.el.querySelector('[aria-label="Rule 1 test"]') as HTMLSelectElement).disabled).toBe(true);
    expect((p.el.querySelector('[aria-label="Rule 1 value"]') as HTMLInputElement).disabled).toBe(true);
    expect([...p.el.querySelectorAll('button')].some(b => b.textContent!.includes('Rule') && !b.disabled)).toBe(false);
  });
});
