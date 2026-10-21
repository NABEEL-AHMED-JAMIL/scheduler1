import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Block } from './designer-model';
import { PropChange, PropertiesPanel, fieldsFor, filterRows, filterValues, opValue } from './properties';
import { neededFields, passedStages } from '../wizard/new-report';

/**
 * QA 2026-10-20 (media 3e1cb7d, e79e89c): the template's soft tints, chips, a label and value's size and list field, row
 * filters and the count format each get a control in the properties panel -- none of them falls to "Edited as JSON".
 */
const definitions = {
  style: {},
  labelValueComponent: { properties: { id: {}, type: {}, label: { type: 'string', maxLength: 200 }, binding: { type: 'string' },
    format: { $ref: '#/definitions/format' }, layout: { enum: ['inline', 'stacked'] }, filter: { $ref: '#/definitions/rowFilter' },
    field: { type: 'string', maxLength: 200 }, emphasis: { enum: ['kpi', 'normal'] }, style: { $ref: '#/definitions/style' } } },
  tableComponent: { properties: { id: {}, type: {}, dataset: { type: 'string' }, columns: { type: 'array' }, filter: { $ref: '#/definitions/rowFilter' },
    style: { $ref: '#/definitions/style' } } },
  listComponent: { properties: { id: {}, type: {}, binding: { type: 'string' }, filter: { $ref: '#/definitions/rowFilter' } } },
  imageGridComponent: { properties: { id: {}, type: {}, binding: { type: 'string' }, filter: { $ref: '#/definitions/rowFilter' } } },
};

const fields = [
  { path: 'period', type: 'string', nullable: false },
  { path: 'rows', type: 'list', nullable: false },
  { path: 'rows[].site', type: 'string', nullable: false },
  { path: 'rows[].status', type: 'string', nullable: false },
  { path: 'rows[].accuracy', type: 'number', nullable: false },
];
const sample = { period: 'Sep', rows: [
  { site: 'North', status: 'Overall', accuracy: 0.91 }, { site: 'South', status: 'open', accuracy: 0.8 }, { site: 'East', status: ' OPEN ', accuracy: 0.7 },
] };

function panel(block: Block) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [PropertiesPanel] });
  const fixture = TestBed.createComponent(PropertiesPanel);
  fixture.componentRef.setInput('definitions', definitions);
  fixture.componentRef.setInput('block', block);
  fixture.componentRef.setInput('fields', fields);
  fixture.componentRef.setInput('sample', sample);
  const changes: PropChange[] = [];
  fixture.componentInstance.changed.subscribe(c => {
    changes.push(c);
    fixture.componentRef.setInput('block', { ...(fixture.componentInstance.block() as Block), [c.key]: c.value });
    fixture.detectChanges();
  });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const select = (label: string) => el.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement | null;
  const pick = (label: string, value: string) => {
    const s = select(label)!;
    s.value = value;
    s.dispatchEvent(new Event('change'));
  };
  const write = (label: string, value: string) => {
    const i = el.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | HTMLTextAreaElement;
    i.value = value;
    i.dispatchEvent(new Event('change'));
  };
  return { fixture, el, changes, select, pick, write, last: () => changes[changes.length - 1] };
}

const options = (s: HTMLSelectElement | null) => [...(s?.options ?? [])].map(o => o.textContent!.trim());

describe('the properties panel: the template features of 2026-10-20', () => {
  it('draws filter, a list\'s field and the value size as their own editors, not JSON', () => {
    const lv = fieldsFor('labelValue', definitions);
    expect(lv.find(f => f.key === 'filter')).toEqual(expect.objectContaining({ kind: 'filter', group: 'data', label: 'Show only rows where' }));
    expect(lv.find(f => f.key === 'field')).toEqual(expect.objectContaining({ kind: 'rowField', group: 'data', label: 'Show this field of the first row' }));
    expect(lv.find(f => f.key === 'emphasis')).toEqual(expect.objectContaining({ kind: 'enum', label: 'Value size',
      optionLabels: { kpi: 'Large (KPI)', normal: 'Normal (detail field)' } }));
    for (const type of ['table', 'list', 'imageGrid']) expect(fieldsFor(type, definitions).find(f => f.key === 'filter')?.kind).toBe('filter');
    expect([...lv, ...fieldsFor('table', definitions)].some(f => f.kind === 'json')).toBe(false);
  });

  it('offers the soft tints with words, and the chip toggle in Style', () => {
    const p = panel({ id: 'kpi', type: 'labelValue', label: 'Rate', binding: 'primary.period' });
    const bg = options(p.select('Background'));
    expect(bg).toEqual(expect.arrayContaining(['Soft main colour (primary)', 'Soft grey (muted)', 'Soft accent colour (accent)', 'Soft green (success)',
      'Soft amber (warning)', 'Soft red (danger)', 'None (transparent)']));
    p.pick('Background', 'success-soft');
    expect(p.last()).toEqual({ key: 'style', value: { background: 'success-soft' } });
    const chip = [...p.el.querySelectorAll('label.rsd-check')].find(l => l.textContent!.includes('Show as a chip (small rounded badge)'))!;
    const box = chip.querySelector('input') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(p.last()).toEqual({ key: 'style', value: { background: 'success-soft', chip: true } });
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(p.last()).toEqual({ key: 'style', value: { background: 'success-soft' } });
  });

  it('sets the value size in words, and says it needs the stacked layout', () => {
    const p = panel({ id: 'kpi', type: 'labelValue', label: 'Rate', binding: 'primary.period' });
    expect(options(p.select('Value size'))).toEqual(['Default (large)', 'Large (KPI)', 'Normal (detail field)']);
    expect(p.el.textContent).toContain('Takes effect with the stacked layout.');
    p.pick('Layout', 'stacked');
    p.pick('Value size', 'normal');
    expect(p.last()).toEqual({ key: 'emphasis', value: 'normal' });
    expect(p.el.textContent).not.toContain('Takes effect with the stacked layout.');
  });

  it('gives a table column a chip tone, and none again', () => {
    const p = panel({ id: 't', type: 'table', dataset: 'primary.rows', columns: [{ id: 'c1', field: 'site' }, { id: 'c2', field: 'status' }] });
    expect(options(p.select('Column 2 chip'))).toEqual(['Plain value (no chip)', 'Chip · main colour (primary)', 'Chip · grey (muted)', 'Chip · accent colour (accent)',
      'Chip · green (success)', 'Chip · amber (warning)', 'Chip · red (danger)']);
    p.pick('Column 2 chip', 'warning');
    expect(p.last()).toEqual({ key: 'columns', value: [{ id: 'c1', field: 'site' }, { id: 'c2', field: 'status', chip: 'warning' }] });
    p.pick('Column 2 chip', '');
    expect(p.last()).toEqual({ key: 'columns', value: [{ id: 'c1', field: 'site' }, { id: 'c2', field: 'status' }] });
  });

  it('builds a table\'s filter from the test data: field, is / is not / is one of, the values, and clears it', () => {
    const p = panel({ id: 't', type: 'table', dataset: 'primary.rows', columns: [{ id: 'c1', field: 'site' }] });
    expect(options(p.select('Filter field'))).toEqual(['All rows', 'site', 'status', 'accuracy']);
    // Owner 2026-10-21: the filter's field, operator and value sit in one bordered box under its label.
    const group = p.select('Filter field')!.closest('[role="group"]') as HTMLElement;
    expect(group.classList).toContain('rsd-group');
    expect(group.getAttribute('aria-label')).toBe('Show only rows where');
    expect(group.querySelector('[aria-label="Filter operator"]')).not.toBeNull();
    expect(p.select('Filter operator')!.disabled).toBe(true);
    p.pick('Filter field', 'status');
    expect(p.last()).toEqual({ key: 'filter', value: { field: 'status', equals: '' } });
    p.write('Filter value', 'open');
    expect(p.last()).toEqual({ key: 'filter', value: { field: 'status', equals: 'open' } });
    expect(p.el.textContent).toContain('Keeps 2 of 3 sample rows');
    const suggested = [...p.el.querySelectorAll('#rsd-filter-values option')].map(o => (o as HTMLOptionElement).value);
    expect(suggested).toEqual(['Overall', 'open', 'OPEN']);
    p.pick('Filter operator', 'notEquals');
    expect(p.last()).toEqual({ key: 'filter', value: { field: 'status', notEquals: 'open' } });
    expect(p.el.textContent).toContain('Keeps 1 of 3 sample rows');
    p.pick('Filter operator', 'in');
    expect(p.last()).toEqual({ key: 'filter', value: { field: 'status', in: ['open'] } });
    p.write('Filter values', 'open\nOverall\n\nopen');
    expect(p.last()).toEqual({ key: 'filter', value: { field: 'status', in: ['open', 'Overall'] } });
    expect(p.el.textContent).toContain('Keeps 3 of 3 sample rows');
    p.write('Filter values', 'closed');
    expect(p.el.textContent).toContain('Keeps none of the 3 sample rows');
    (p.el.querySelector('button[aria-label="Clear the filter"]') as HTMLButtonElement).click();
    expect(p.last()).toEqual({ key: 'filter', value: undefined });
    expect(p.el.querySelector('button[aria-label="Clear the filter"]')).toBeNull();
  });

  it('types the filter\'s field when there is no test data', () => {
    const p = panel({ id: 'g', type: 'list', binding: 'primary.items' });
    p.fixture.componentRef.setInput('fields', []);
    p.fixture.detectChanges();
    expect(p.select('Filter field')).toBeNull();
    p.write('Filter field', 'kind');
    expect(p.last()).toEqual({ key: 'filter', value: { field: 'kind', equals: '' } });
    expect(p.el.textContent).toContain('Pick test data to see which rows it keeps.');
    p.write('Filter field', 'not a field');
    expect(p.changes.length).toBe(1);
  });

  it('shows a list\'s field and filter on a label and value only when its binding is a list', () => {
    const scalar = panel({ id: 'kpi', type: 'labelValue', label: 'Period', binding: 'primary.period' });
    expect(scalar.select('Show this field of the first row')).toBeNull();
    expect(scalar.el.querySelector('[aria-label="Filter field"]')).toBeNull();
    const p = panel({ id: 'kpi', type: 'labelValue', label: 'Accuracy', binding: 'primary.rows' });
    expect(p.el.textContent).toContain('A list of 3: pick its field below, or Format › count.');
    p.pick('Filter field', 'status');
    p.write('Filter value', 'overall');
    p.pick('Show this field of the first row', 'accuracy');
    expect(p.last()).toEqual({ key: 'field', value: 'accuracy' });
    expect(p.el.textContent).toContain("Data matches · first row's accuracy: 0.91");
    const datalist = [...p.el.querySelectorAll('#rsd-scalars option')].map(o => (o as HTMLOptionElement).value);
    expect(datalist).toContain('primary.rows');
  });

  it('lists count among the formats and says what it is', () => {
    const p = panel({ id: 'kpi', type: 'labelValue', label: 'Open', binding: 'primary.rows' });
    expect(options(p.select('Format'))).toContain('count (how many items)');
    p.pick('Format', 'count');
    expect(p.last()).toEqual({ key: 'format', value: { type: 'count' } });
    expect(p.el.textContent).toContain('Data matches · 3 rows');
    p.fixture.componentRef.setInput('tree', { path: '$', type: 'object', children: [{ path: '$.rows', type: 'list', length: 40 }] });
    p.pick('Filter field', 'status');
    p.write('Filter value', 'open');
    expect(p.el.textContent).toContain("Data matches · 2 of the sample's 3 rows (the data has 40)");
    expect(p.el.textContent).toContain('Keeps 2 of 3 sample rows (the data has 40)');
  });
});

describe('Create report\'s fields', () => {
  it('needs a list where a label and value reads one (its field, a filter or a count)', () => {
    const def = { schemaVersion: '1.0', template: { name: 'T', datasets: [{ id: 'primary', rootPath: '$' }], components: [
      { id: 'a', type: 'labelValue', binding: 'primary.accuracy', field: 'accuracy_pct' },
      { id: 'b', type: 'labelValue', binding: 'primary.results', format: { type: 'count' } },
      { id: 'c', type: 'labelValue', binding: 'primary.period' },
    ] } };
    expect(neededFields(def).map(f => `${f.path}:${f.type}`)).toEqual(['accuracy:array', 'results:array', 'period:string']);
  });
});

describe('Create report\'s checks', () => {
  it('lists the passed checks by name, in order', () => {
    expect(passedStages([{ stage: 'BINDINGS' }, { stage: 'ASSETS' }])).toEqual(['Template structure', 'Components', 'Data contract',
      'Layout and page breaks', 'Renders as PDF and HTML']);
    expect(passedStages([]).length).toBe(7);
  });
});

describe('row filters, as media-service compares them', () => {
  const rows = [{ s: 'Open' }, { s: ' open ' }, { s: null }, {}, { s: 2 }];
  it('compares as text, ignoring case and outer spaces; a missing value is blank', () => {
    expect(filterRows(rows, { field: 's', equals: 'OPEN' }).length).toBe(2);
    expect(filterRows(rows, { field: 's', notEquals: 'open' }).length).toBe(3);
    expect(filterRows(rows, { field: 's', equals: '' }).length).toBe(2);
    expect(filterRows(rows, { field: 's', in: ['2', 'open'] }).length).toBe(3);
    expect(filterRows(rows, null)).toBe(rows);
  });

  it('carries the values over when the operator changes', () => {
    expect(filterValues({ field: 'x', in: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(opValue('equals', ['a', 'b'])).toEqual({ equals: 'a' });
    expect(opValue('notEquals', [])).toEqual({ notEquals: '' });
    expect(opValue('in', [])).toEqual({ in: [''] });
  });
});

/** Report Studio phase 4: a chart's, KPI's and condition's settings each get a control; none falls to "Edited as JSON". */
describe('phase 4 settings', () => {
  const phase4 = {
    ...definitions,
    chartComponent: { properties: { id: {}, type: {}, chartType: { enum: ['bar', 'horizontalBar', 'line', 'pie'] }, dataset: { type: 'string' },
      categoryField: { type: 'string' }, seriesField: { type: 'string' }, series: { type: 'array', items: { type: 'object' } },
      axis: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' }, title: { type: 'string' } } },
      target: { type: 'object', properties: { value: { type: 'number' }, label: { type: 'string' } } }, showValues: { type: 'boolean' } } },
    conditionalComponent: { properties: { id: {}, type: {}, condition: { type: 'object', properties: { left: { type: 'string' },
      operator: { enum: ['eq', 'gt', 'in'] }, right: { type: ['string', 'number', 'boolean', 'null', 'array'] } } }, when: { type: 'string', maxLength: 2000 },
      children: { type: 'array' } } },
  };

  it('draws a chart with pickers for its fields, a series editor and small forms for the axis and target line', () => {
    const f = fieldsFor('chart', phase4 as never);
    const kind = (k: string) => f.find(x => x.key === k)?.kind;
    expect(kind('categoryField')).toBe('itemField');
    expect(kind('seriesField')).toBe('itemField');
    expect(kind('series')).toBe('series');
    expect(kind('axis')).toBe('object');
    expect(kind('target')).toBe('object');
    expect(f.find(x => x.key === 'chartType')?.optionLabels?.['horizontalBar']).toBe('Horizontal bar');
    expect(f.some(x => x.kind === 'json')).toBe(false);
  });

  it('edits series, a target line and a condition as the schema says', () => {
    const p = panel({ id: 'c1', type: 'chart', chartType: 'bar', dataset: 'primary.rows', categoryField: 'site', series: [{ name: 'Accuracy', field: 'accuracy' }] });
    p.fixture.componentRef.setInput('definitions', { ...definitions, chartComponent: {
      properties: { id: {}, type: {}, dataset: { type: 'string' }, series: { type: 'array', items: { type: 'object' } },
        target: { type: 'object', properties: { value: { type: 'number' }, label: { type: 'string' } } } } } });
    p.fixture.detectChanges();
    p.pick('Series 1 aggregate', 'avg');
    expect(p.last()).toEqual({ key: 'series', value: [{ name: 'Accuracy', field: 'accuracy', aggregate: 'avg' }] });
    p.write('Target line Value', '12');
    expect(p.last()).toEqual({ key: 'target', value: { value: 12 } });
    const c = panel({ id: 'k1', type: 'conditional', condition: { left: 'primary.period', operator: 'in' }, children: [] });
    c.fixture.componentRef.setInput('definitions', phase4);
    c.fixture.detectChanges();
    c.write('Show when Value', 'Sep, Oct');
    expect(c.last()).toEqual({ key: 'condition', value: { left: 'primary.period', operator: 'in', right: ['Sep', 'Oct'] } });
  });

  it('gives a table column a total and style rules, a value or another field', () => {
    const p = panel({ id: 't1', type: 'table', dataset: 'primary.rows', columns: [{ id: 'a', field: 'accuracy' }] });
    p.pick('Column 1 total', 'avg');
    expect(p.last()).toEqual({ key: 'columns', value: [{ id: 'a', field: 'accuracy', total: 'avg' }] });
    p.fixture.componentInstance.addRule(0);
    p.write('Column 1 rule 1 value', '@ref_high');
    expect((p.last().value as { rules: unknown[] }[])[0].rules).toEqual([{ operator: 'gt', field: 'ref_high', tone: 'danger', style: 'fill' }]);
  });
});
