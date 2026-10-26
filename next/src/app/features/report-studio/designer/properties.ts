import { Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Icon } from '../../../shared/ui/icon';
import { SchemaField, TreeNode } from '../report-studio.model';
import { AssetCard } from '../assets.model';
import { RsPickSearch } from '../pick-search';
import {
  Block, collections, innerPath, itemFields, lengthAt, sampleText, scalars, typeIcon, typeWord, valueAt,
} from './designer-model';

/** One setting of a component, as the form draws it. */
export interface PropField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'boolean' | 'enum' | 'binding' | 'listBinding' | 'collection' | 'columns' | 'items'
    | 'format' | 'style' | 'size' | 'itemField' | 'json' | 'asset' | 'imageSource' | 'filter' | 'rowField' | 'series' | 'object';
  group: 'content' | 'data' | 'format' | 'style' | 'layout';
  options?: string[];
  /** The words for an enum's options, where its own values are not words (QA 2026-10-20: emphasis). */
  optionLabels?: Record<string, string>;
  /** The enum's first option, when "Default" alone does not say what the default is. */
  defaultLabel?: string;
  min?: number;
  max?: number;
  hint?: string;
  /** An object setting's own settings (phase 4: a chart's axis and target line, a KPI's comparison, a condition). */
  props?: Record<string, JsonSchema>;
}

/** A table column's conditional style (phase 4): compare with a value or another field, or an expression; a theme tone. */
export interface ColumnRule { operator?: string; value?: string | number | boolean; field?: string; when?: string; tone?: string; style?: string; }

/** A change to one setting: the new value, or undefined to remove it. */
export interface PropChange { key: string; value: unknown; }

type JsonSchema = { type?: string | string[]; enum?: unknown[]; $ref?: string; maxLength?: number; minimum?: number; maximum?: number;
  properties?: Record<string, JsonSchema>; items?: JsonSchema };

/** The words for each setting; a setting not named here is shown by its own name. */
const LABELS: Record<string, string> = {
  name: 'Name', content: 'Text', level: 'Level', label: 'Label', title: 'Title', binding: 'Data', dataset: 'Collection', columns: 'Columns',
  emptyText: 'When empty', emptyState: 'When empty', repeatHeader: 'Repeat the header on every page', striped: 'Striped rows',
  maxRows: 'At most rows', allowPageBreak: 'May split across pages', markdown: 'Simple Markdown (bold, italic, bullets)', ordered: 'Numbered',
  layout: 'Layout', role: 'Part of the page', gap: 'Gap', width: 'Width', height: 'Height', assetRef: 'Image', alt: 'Alt text', align: 'Align',
  fit: 'Fit', missing: 'When the image is missing', thickness: 'Thickness', color: 'Colour', items: 'Items', itemField: 'Field of each item',
  format: 'Format', style: 'Style', size: 'Size', keepTogether: "Keep together · don't split across pages", pageBreakBefore: 'Start a new page before it',
  pageBreakAfter: 'Start a new page after it', hidden: 'Hidden (not in the report)', sort: 'Sort', size_spacer: 'Space',
  // MIG-406: signatures, stamps, images from the data, the grid.
  stampRef: 'Stamp beside it', caption: 'Caption', placement: 'Where', imageSource: 'Pictures from', imageField: 'Picture field',
  captionField: 'Caption field', captionFields: 'Caption fields (up to 4, joined with ·)', imageHeight: 'Picture height', maxItems: 'At most pictures', columns_grid: 'Pictures a row',
  // QA 2026-10-20 (media 3e1cb7d): row filters, a list's field, the value's size.
  filter: 'Show only rows where', field: 'Show this field of the first row', emphasis: 'Value size',
  // Report Studio phase 4: charts, KPI tiles, QR codes, conditional and repeated blocks.
  chartType: 'Type', subtitle: 'Subtitle', description: 'Text description (for readers who cannot see it)', categoryField: 'Category',
  seriesField: 'One series per', series: 'Values', stacking: 'Stacking', legend: 'Legend', maxCategories: 'At most categories',
  showValues: 'Show value labels', markers: 'Markers on the points', beginAtZero: 'Axis starts at zero', axis: 'Axis', target: 'Target line',
  palette: 'Colours (#RRGGBB, one per line)', showTable: 'Its figures as a table under it', nullLabel: 'Name of blank categories',
  comparison: 'Compare with', direction: 'Better when', thresholds: 'Status rules', sparkline: 'Trend line', nullText: 'When empty',
  sizeMm: 'Size (mm)', errorCorrection: 'Error correction', quietZone: 'Quiet zone (modules)', text_qr: 'Text',
  condition: 'Show when', when: 'Or an expression', as: 'Each item is called', divider: 'A line between items',
};

/** The words for the phase-4 enums. */
const OPTION_WORDS: Record<string, Record<string, string>> = {
  chartType: { bar: 'Bar', horizontalBar: 'Horizontal bar', stackedBar: 'Stacked bar', line: 'Line', area: 'Area', pie: 'Pie', doughnut: 'Doughnut',
    scatter: 'Scatter' },
  stacking: { none: 'Side by side', stacked: 'Stacked', percent: '100 % stacked' },
  legend: { auto: 'Automatic', top: 'Above', bottom: 'Below', right: 'Right', none: 'None' },
  sort: { none: 'As in the data', label: 'By name', valueAsc: 'Smallest first', valueDesc: 'Largest first' },
  direction: { up: 'Higher is better', down: 'Lower is better', neutral: 'Neither' },
  content: { verifyLink: 'Verify this report (signed in)', reportId: 'The report id', binding: 'A value from the data', text: 'Fixed text' },
  errorCorrection: { L: 'L · 7 %', M: 'M · 15 %', Q: 'Q · 25 %', H: 'H · 30 %' },
  operator: { eq: 'equals', ne: 'is not', lt: 'is below', lte: 'is at most', gt: 'is above', gte: 'is at least', isNull: 'is empty',
    isNotNull: 'is not empty', in: 'is one of', notIn: 'is none of', contains: 'contains', startsWith: 'starts with', endsWith: 'ends with' },
  aggregate: { sum: 'Sum', avg: 'Average', min: 'Lowest', max: 'Highest', count: 'Count', rows: 'Rows', countDistinct: 'Distinct values',
    percentOfTotal: '% of total' },
};

/** The fields of an object setting the phase-4 forms draw, in this order. */
const OBJECT_HINTS: Record<string, string> = {
  target: 'A dashed line at this value, with its label.', comparison: 'A field of the data, or a fixed value, to compare the KPI with.',
  sparkline: 'A list in the data, and the field of each item, drawn as a small trend line.',
  condition: 'The field on the left, how it compares, and the value on the right (a number, a word, or values separated by commas).',
};

const GROUPS: Record<string, PropField['group']> = {
  categoryField: 'data', seriesField: 'data', series: 'data', stacking: 'content', axis: 'format', target: 'content', comparison: 'data',
  sparkline: 'data', condition: 'data', when: 'data', as: 'data', maxCategories: 'data', palette: 'style', thresholds: 'format',
  binding: 'data', dataset: 'data', columns: 'data', itemField: 'data', emptyText: 'data', emptyState: 'data', maxRows: 'data', sort: 'data', captionFields: 'data',
  repeatHeader: 'data', striped: 'data', allowPageBreak: 'layout', format: 'format', style: 'style', size: 'layout', keepTogether: 'layout',
  pageBreakBefore: 'layout', pageBreakAfter: 'layout', hidden: 'layout', width: 'layout', height: 'layout', gap: 'layout',
};

const FORMAT_TYPES = ['text', 'number', 'integer', 'currency', 'percent', 'date', 'datetime', 'boolean', 'uppercase', 'lowercase', 'capitalize', 'mask',
  'count'];
/** A format type's words in the pickers, where its id alone does not say it ("count": how many items a list has). */
export const FORMAT_WORDS: Record<string, string> = { count: 'count (how many items)' };
/** The tones a chip (a small rounded badge) and a soft tint come in, with the colour each one is by default. */
export const TONES: { id: string; colour: string }[] = [
  // primary and accent are the theme's (a brand's main colour may be any colour), the others the palette's fixed ones.
  { id: 'primary', colour: 'main colour' }, { id: 'muted', colour: 'grey' }, { id: 'accent', colour: 'accent colour' }, { id: 'success', colour: 'green' },
  { id: 'warning', colour: 'amber' }, { id: 'danger', colour: 'red' },
];
const STYLE_ENUMS: Record<string, string[]> = {
  align: ['left', 'center', 'right', 'justify'], fontSize: ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'],
  color: ['primary', 'text', 'muted', 'accent', 'success', 'warning', 'danger'],
  background: ['primary', 'muted', 'accent', 'background', 'success', 'warning', 'danger', ...TONES.map(t => `${t.id}-soft`), 'none'],
  padding: ['none', 'xs', 'sm', 'md', 'lg', 'xl'], marginTop: ['none', 'xs', 'sm', 'md', 'lg', 'xl'], marginBottom: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
};
const SIZE_PATTERN = /^(\d{1,3}(\.\d)?mm|\d{1,3}%)$/;
const HEIGHT_PATTERN = /^\d{1,3}(\.\d)?mm$/;

/** The settings a component type has, read from the template schema's definition for it (`<type>Component`). */
export function fieldsFor(type: string, definitions: Record<string, JsonSchema>): PropField[] {
  const def = definitions[`${type}Component`];
  const props = def?.properties ?? {};
  const out: PropField[] = [];
  for (const [key, s] of Object.entries(props)) {
    if (key === 'id' || key === 'type' || key === 'children') continue;
    const group = GROUPS[key] ?? 'content';
    const label = (type === 'spacer' && key === 'size' ? LABELS['size_spacer'] : LABELS[key]) ?? key;
    let field: PropField;
    if (s.$ref === '#/definitions/format') field = { key, label, kind: 'format', group: 'format' };
    else if (s.$ref === '#/definitions/style') field = { key, label, kind: 'style', group: 'style' };
    else if (s.$ref === '#/definitions/size') field = { key, label, kind: 'size', group: 'layout' };
    else if (s.$ref === '#/definitions/rowFilter') field = { key, label, kind: 'filter', group: 'data' };
    else if (key === 'field' && type === 'labelValue') field = { key, label, kind: 'rowField', group: 'data' };
    else if (key === 'emphasis' && Array.isArray(s.enum)) field = { key, label, kind: 'enum', group, options: s.enum.map(String),
      optionLabels: { kpi: 'Large (KPI)', normal: 'Normal (detail field)' }, defaultLabel: 'Default (large)' };
    else if (key === 'assetRef' || key === 'stampRef') field = { key, label: type === 'signature' && key === 'assetRef' ? 'Signature' : type === 'stamp' && key === 'assetRef' ? 'Stamp' : label,
      kind: 'asset', group: 'content', hint: key === 'assetRef' && (type === 'signature' || type === 'stamp') ? 'Approved, and yours to place (or granted to you).' : undefined };
    else if (key === 'imageSource') field = { key, label, kind: 'imageSource', group: 'data' };
    else if (key === 'binding' && type === 'imageGrid') field = { key, label: 'List', kind: 'listBinding', group: 'data' };
    else if (key === 'imageField' || key === 'captionField') field = { key, label, kind: 'itemField', group: 'data' };
    else if (key === 'categoryField' || key === 'seriesField') field = { key, label, kind: 'itemField', group: 'data' };
    else if (key === 'series') field = { key, label, kind: 'series', group: 'data' };
    else if (key === 'text' && type === 'qrCode') field = { key, label: LABELS['text_qr'], kind: 'text', group: 'content' };
    else if (key === 'when') field = { key, label, kind: 'textarea', group: 'data',
      hint: "e.g. primary.summary.rate > 12 and primary.site = 'North'. Paths, numbers, 'words', and, or, not, is null." };
    else if (s.type === 'object' && s.properties && Object.values(s.properties).every(p => p.type !== 'array' && p.type !== 'object'))
      field = { key, label, kind: 'object', group, props: s.properties, hint: OBJECT_HINTS[key] };
    else if (key === 'columns' && type === 'imageGrid') field = { key, label: LABELS['columns_grid'], kind: 'enum', group: 'layout', options: ['1', '2', '3', '4', '5', '6'] };
    else if (key === 'binding') field = { key, label, kind: type === 'list' ? 'listBinding' : 'binding', group: 'data' };
    else if (key === 'dataset') field = { key, label, kind: 'collection', group: 'data' };
    else if (key === 'columns') field = { key, label, kind: 'columns', group: 'data' };
    else if (key === 'items') field = { key, label, kind: 'items', group: 'content', hint: 'One per line, used when no data is bound.' };
    else if (key === 'itemField') field = { key, label, kind: 'itemField', group: 'data' };
    else if (Array.isArray(s.enum)) field = { key, label, kind: 'enum', group, options: s.enum.map(String), optionLabels: OPTION_WORDS[key] };
    else if (s.type === 'boolean') field = { key, label, kind: 'boolean', group };
    else if (s.type === 'integer' || s.type === 'number') {
      field = s.minimum !== undefined && s.maximum !== undefined && s.maximum - s.minimum <= 6
        ? { key, label, kind: 'enum', group, options: Array.from({ length: s.maximum - s.minimum + 1 }, (_, i) => String(s.minimum! + i)) }
        : { key, label, kind: 'number', group, min: s.minimum, max: s.maximum };
    } else if (s.type === 'string') field = { key, label, kind: (s.maxLength ?? 0) > 300 ? 'textarea' : 'text', group };
    else field = { key, label, kind: 'json', group: 'layout', hint: 'Edited as JSON.' };
    out.push(field);
  }
  return out;
}

/** A component's row filter (the schema's rowFilter): a field, and the value it equals, does not equal, or the values it is one of. */
export interface RowFilter { field: string; equals?: string; notEquals?: string; in?: string[]; }
export type FilterOp = 'equals' | 'notEquals' | 'in';
const FILTER_FIELD = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function withoutOp(f: RowFilter): RowFilter {
  const { equals: _e, notEquals: _n, in: _i, ...rest } = f;
  return rest;
}

/** The value(s) a filter compares with, whatever its operator. */
export function filterValues(f: RowFilter | null): string[] {
  if (!f) return [];
  if (Array.isArray(f.in)) return f.in.map(String);
  const v = f.notEquals ?? f.equals;
  return v === undefined ? [] : [String(v)];
}

/** One operator's part of a filter: "is" and "is not" take the first value, "is one of" all of them (at least one). */
export function opValue(op: FilterOp, values: string[]): Partial<RowFilter> {
  if (op === 'in') return { in: values.length ? values : [''] };
  return op === 'notEquals' ? { notEquals: values[0] ?? '' } : { equals: values[0] ?? '' };
}

/** The rows a filter keeps, compared as media-service does: as text, ignoring case and outer spaces (a missing value is blank). */
export function filterRows(rows: unknown[], f: RowFilter | null): unknown[] {
  if (!f) return rows;
  const norm = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim().toLowerCase();
  const want = filterValues(f).map(norm);
  return rows.filter(r => {
    const v = norm(valueAt(r, f.field));
    if (Array.isArray(f.in)) return want.includes(v);
    return f.notEquals !== undefined ? v !== want[0] : v === (want[0] ?? '');
  });
}

/**
 * The designer's right panel (MIG-404, Figma frame 3): the selected component's settings, drawn from the template schema
 * -- so a setting the schema gains appears here without a console change -- in groups: Content, Data (the collection and
 * field pickers read the test data's own paths, and say whether the data matches and how many sample rows it has),
 * Format, Style and Layout (width, height, keep together). Each change goes back to the designer, which keeps it on the
 * undo stack and saves the draft.
 */
@Component({
  selector: 'app-rs-properties',
  imports: [Icon, NgTemplateOutlet, RsPickSearch],
  template: `
    @if (block(); as b) {
      <div class="rsd-props-head">
        <app-icon [name]="icon()" size="1.05rem" class="text-[color:var(--text-muted)]" />
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold truncate">{{ title() }}</h2>
          <p class="text-xs text-[color:var(--text-muted)] mono truncate">{{ b.id }}</p>
        </div>
        @if (!readonly()) {
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Duplicate (Ctrl+D)" title="Duplicate (Ctrl+D)" (click)="duplicate.emit()"><app-icon name="copy" /></button>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Delete (Delete)" title="Delete (Delete)" (click)="remove.emit()"><app-icon name="trash" class="icon-crit" /></button>
        }
      </div>
      @for (g of groups(); track g.id) {
        <section class="rsd-props-group" [attr.aria-label]="g.label">
          <h3 class="rsd-eyebrow">{{ g.label }}</h3>
          @for (f of g.fields; track f.key) {
            @switch (f.kind) {
              @case ('boolean') {
                <label class="rsd-check">
                  <input type="checkbox" class="checkbox" [checked]="value(f.key) === true" [disabled]="readonly()"
                         (change)="set(f.key, $any($event.target).checked ? true : undefined)" />
                  <span>{{ f.label }}</span>
                </label>
              }
              @case ('enum') {
                <label class="field">
                  <span class="label">{{ f.label }}</span>
                  <select class="input" [disabled]="readonly()" [attr.aria-label]="f.label" (change)="setEnum(f, $any($event.target).value)">
                    <option value="" [selected]="!text(f.key)">{{ f.defaultLabel ?? 'Default' }}</option>
                    @for (o of f.options; track o) { <option [value]="o" [selected]="o === text(f.key)">{{ f.optionLabels?.[o] ?? o }}</option> }
                  </select>
                  @if (f.key === 'emphasis' && text('layout') !== 'stacked') {
                    <span class="block field-note text-[color:var(--text-muted)]">Takes effect with the stacked layout.</span>
                  }
                </label>
              }
              @case ('number') {
                <label class="field">
                  <span class="label">{{ f.label }}</span>
                  <input class="input" type="number" [attr.min]="f.min ?? null" [attr.max]="f.max ?? null" [value]="text(f.key)" [disabled]="readonly()"
                         [attr.aria-label]="f.label" (change)="setNumber(f.key, $any($event.target).value)" />
                </label>
              }
              @case ('textarea') {
                <label class="field">
                  <span class="label">{{ f.label }}</span>
                  <textarea class="input text-sm" rows="4" [value]="text(f.key)" [disabled]="readonly()" [attr.aria-label]="f.label"
                            (input)="set(f.key, $any($event.target).value || undefined)"></textarea>
                  @if (b.type === 'text' || b.type === 'heading') {
                    <span class="block field-note text-[color:var(--text-muted)]">Fill in data with {{ '{{' }}{{ primary() }}.field{{ '}}' }}; nothing else is code.</span>
                  }
                </label>
              }
              @case ('items') {
                <label class="field">
                  <span class="label">{{ f.label }}</span>
                  <textarea class="input text-sm" rows="3" [value]="itemsText()" [disabled]="readonly()" [attr.aria-label]="f.label"
                            (input)="setItems($any($event.target).value)"></textarea>
                  <span class="block field-note text-[color:var(--text-muted)]">{{ f.hint }}</span>
                </label>
              }
              @case ('binding') {
                <div class="field">
                  <span class="label">Data field</span>
                  <input class="input mono text-xs" [value]="text('binding')" [disabled]="readonly()" list="rsd-scalars" aria-label="Data field"
                         placeholder="{{ primary() }}.summary.total" (change)="setBinding($any($event.target).value)" />
                  <datalist id="rsd-scalars">
                    @for (s of scalarFields(); track s.path) { <option [value]="primary() + '.' + s.path">{{ s.type }}</option> }
                    @if (b.type === 'labelValue') {
                      @for (c of lists(); track c.path) { <option [value]="primary() + '.' + c.path">list · one of its rows, or how many</option> }
                    }
                  </datalist>
                  <ng-container *ngTemplateOutlet="match; context: { $implicit: bindingMatch() }" />
                </div>
              }
              @case ('listBinding') {
                <label class="field">
                  <span class="label">Collection</span>
                  <select class="input mono text-xs" [disabled]="readonly()" aria-label="Collection" (change)="setCollection('binding', $any($event.target).value)">
                    <option value="" [selected]="!collectionOf('binding')">{{ hasData() ? 'Choose a list in the data' : 'No test data yet' }}</option>
                    @for (c of lists(); track c.path) { <option [value]="c.path" [selected]="c.path === collectionOf('binding')">{{ c.path }}</option> }
                    @if (collectionOf('binding') && !hasList(collectionOf('binding'))) { <option [value]="collectionOf('binding')" selected>{{ collectionOf('binding') }}</option> }
                  </select>
                </label>
                <ng-container *ngTemplateOutlet="match; context: { $implicit: listMatch('binding') }" />
              }
              @case ('collection') {
                <label class="field">
                  <span class="label">Collection</span>
                  <select class="input mono text-xs" [disabled]="readonly()" aria-label="Collection" (change)="setCollection('dataset', $any($event.target).value)">
                    <option value="" [selected]="!collectionOf('dataset')">{{ hasData() ? 'Choose a list in the data' : 'No test data yet' }}</option>
                    @for (c of lists(); track c.path) { <option [value]="c.path" [selected]="c.path === collectionOf('dataset')">{{ c.path }}</option> }
                    @if (collectionOf('dataset') && !hasList(collectionOf('dataset'))) { <option [value]="collectionOf('dataset')" selected>{{ collectionOf('dataset') }}</option> }
                  </select>
                </label>
                <ng-container *ngTemplateOutlet="match; context: { $implicit: listMatch('dataset') }" />
              }
              @case ('itemField') {
                <label class="field">
                  <span class="label">{{ f.label }}</span>
                  <select class="input mono text-xs" [disabled]="readonly()" [attr.aria-label]="f.label" (change)="set(f.key, $any($event.target).value || undefined)">
                    <option value="" [selected]="!text(f.key)">{{ f.key === 'itemField' ? 'The item itself' : 'None' }}</option>
                    @for (c of itemsOf(listKey()); track c.path) { <option [value]="c.path" [selected]="c.path === text(f.key)">{{ c.path }} · {{ c.type }}</option> }
                    @if (text(f.key) && !hasItemField(listKey(), text(f.key))) { <option [value]="text(f.key)" selected>{{ text(f.key) }}</option> }
                  </select>
                </label>
              }
              @case ('rowField') {
                @if (rowsShown()) {
                  <label class="field">
                    <span class="label">{{ f.label }}</span>
                    <select class="input mono text-xs" [disabled]="readonly()" [attr.aria-label]="f.label" (change)="set('field', $any($event.target).value || undefined)">
                      <option value="" [selected]="!text('field')">None · the list itself (Format: count)</option>
                      @for (c of itemsOf('binding'); track c.path) { <option [value]="c.path" [selected]="c.path === text('field')">{{ c.path }} · {{ c.type }}</option> }
                      @if (text('field') && !hasItemField('binding', text('field'))) { <option [value]="text('field')" selected>{{ text('field') }}</option> }
                    </select>
                  </label>
                }
              }
              @case ('filter') {
                @if (b.type !== 'labelValue' || rowsShown()) {
                  <div class="rsd-group flex flex-col gap-1.5" role="group" [attr.aria-label]="f.label">
                    <div class="rsd-filter-head">
                      <span class="label">{{ f.label }}</span>
                      @if (filter() && !readonly()) {
                        <button type="button" class="btn btn-ghost btn-sm" aria-label="Clear the filter" (click)="set('filter', undefined)"><app-icon name="close" />Clear</button>
                      }
                    </div>
                    <div class="rsd-two">
                      @if (filterFields().length) {
                        <select class="input mono text-xs" [disabled]="readonly()" aria-label="Filter field" (change)="setFilterField($any($event.target).value)">
                          <option value="" [selected]="!filter()">All rows</option>
                          @for (x of filterFields(); track x.path) { <option [value]="x.path" [selected]="x.path === filter()?.field">{{ x.path }}</option> }
                          @if (filter() && !hasFilterField(filter()!.field)) { <option [value]="filter()!.field" selected>{{ filter()!.field }}</option> }
                        </select>
                      } @else {
                        <input class="input mono text-xs" [value]="filter()?.field ?? ''" [disabled]="readonly()" aria-label="Filter field"
                               placeholder="Field (all rows)" (change)="setFilterField($any($event.target).value)" />
                      }
                      <select class="input text-xs" [disabled]="readonly() || !filter()" aria-label="Filter operator" (change)="setFilterOp($any($event.target).value)">
                        @for (o of filterOps; track o.id) { <option [value]="o.id" [selected]="o.id === filterOp()">{{ o.label }}</option> }
                      </select>
                    </div>
                    @if (filter()) {
                      @if (filterOp() === 'in') {
                        <textarea class="input text-sm" rows="3" [value]="filterValue()" [disabled]="readonly()" aria-label="Filter values"
                                  placeholder="One value per line" (change)="setFilterValue($any($event.target).value)"></textarea>
                      } @else {
                        <input class="input text-sm" maxlength="200" [value]="filterValue()" [disabled]="readonly()" aria-label="Filter value" list="rsd-filter-values"
                               placeholder="Value (empty: a blank cell)" (change)="setFilterValue($any($event.target).value)" />
                      }
                      <datalist id="rsd-filter-values">@for (v of filterSuggestions(); track v) { <option [value]="v"></option> }</datalist>
                      <span class="block field-note text-[color:var(--text-muted)]">Compared as text, ignoring capitals and spaces at the ends.</span>
                    }
                    <ng-container *ngTemplateOutlet="match; context: { $implicit: filterMatch() }" />
                  </div>
                }
              }
              @case ('series') {
                <div class="rsd-group flex flex-col gap-2" role="group" [attr.aria-label]="f.label">
                  <span class="label">{{ f.label }}</span>
                  @for (x of seriesList(); track $index; let i = $index) {
                    <div class="rsd-column">
                      <div class="rsd-column-top">
                        <input class="input text-sm" [value]="x.name ?? ''" [disabled]="readonly()" [attr.aria-label]="'Series ' + (i + 1) + ' name'"
                               placeholder="Name in the legend" (change)="setSeries(i, 'name', $any($event.target).value || undefined)" />
                        <input class="input rsd-colour" type="color" [value]="x.color ?? ''" title="The series' colour (automatic when not set)" [disabled]="readonly()" [attr.aria-label]="'Series ' + (i + 1) + ' colour'"
                               (change)="setSeries(i, 'color', $any($event.target).value.toUpperCase())" />
                        @if (!readonly() && seriesList().length > 1) {
                          <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Remove series ' + (i + 1)" (click)="removeSeries(i)"><app-icon name="close" /></button>
                        }
                      </div>
                      <div class="rsd-two">
                        <select class="input mono text-xs" [disabled]="readonly()" [attr.aria-label]="'Series ' + (i + 1) + ' field'" (change)="setSeries(i, 'field', $any($event.target).value)">
                          @if (!hasItemField('dataset', x.field)) { <option [value]="x.field" selected>{{ x.field || 'Choose a field' }}</option> }
                          @for (c of itemsOf('dataset'); track c.path) { <option [value]="c.path" [selected]="c.path === x.field">{{ c.path }} · {{ c.type }}</option> }
                        </select>
                        <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="'Series ' + (i + 1) + ' aggregate'" (change)="setSeries(i, 'aggregate', $any($event.target).value)">
                          @for (a of aggregates; track a) { <option [value]="a" [selected]="a === (x.aggregate ?? 'sum')">{{ words.aggregate[a] }}</option> }
                        </select>
                      </div>
                    </div>
                  }
                  @if (!readonly() && seriesList().length < 12) {
                    <button type="button" class="btn btn-default btn-sm self-start" (click)="addSeries()"><app-icon name="plus" />Series</button>
                  }
                </div>
              }
              @case ('object') {
                <div class="rsd-group flex flex-col gap-1.5" role="group" [attr.aria-label]="f.label">
                  <div class="rsd-filter-head">
                    <span class="label">{{ f.label }}</span>
                    @if (block()?.[f.key] && !readonly()) {
                      <button type="button" class="btn btn-ghost btn-sm" [attr.aria-label]="'Clear ' + f.label" (click)="set(f.key, undefined)"><app-icon name="close" />Clear</button>
                    }
                  </div>
                  <div class="rsd-two">
                    @for (k of objectKeys(f); track k) {
                      <label class="field" [class.rsd-span]="k === 'title' || k === 'categoryTitle' || k === 'left' || k === 'binding'">
                        <span class="label text-xs">{{ subLabel(k) }}</span>
                        @if (f.props![k].enum) {
                          <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="f.label + ' ' + subLabel(k)" (change)="setSub(f.key, k, $any($event.target).value, f.props![k])">
                            <option value="" [selected]="!subText(f.key, k)">—</option>
                            @for (o of f.props![k].enum!; track o) { <option [value]="o" [selected]="String(o) === subText(f.key, k)">{{ words.operator[String(o)] ?? o }}</option> }
                          </select>
                        } @else {
                          <input class="input text-xs" [class.mono]="k === 'left' || k === 'binding' || k === 'field'" [value]="subText(f.key, k)" [disabled]="readonly()"
                                 [attr.aria-label]="f.label + ' ' + subLabel(k)" (change)="setSub(f.key, k, $any($event.target).value, f.props![k])" />
                        }
                      </label>
                    }
                  </div>
                  @if (f.hint) { <span class="text-xs text-[color:var(--text-muted)]">{{ f.hint }}</span> }
                </div>
              }
              @case ('columns') {
                <div class="flex flex-col gap-2">
                  <span class="label">Columns</span>
                  @for (c of columns(); track $index; let i = $index) {
                    <div class="rsd-column">
                      <div class="rsd-column-top">
                        <input class="input text-sm" [value]="c.label ?? ''" [disabled]="readonly()" [attr.aria-label]="'Column ' + (i + 1) + ' label'"
                               placeholder="Label" (change)="setColumn(i, 'label', $any($event.target).value || undefined)" />
                        @if (!readonly()) {
                          <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Remove column ' + (i + 1)" (click)="removeColumn(i)">
                            <app-icon name="close" />
                          </button>
                        }
                      </div>
                      <div class="rsd-two">
                        <select class="input mono text-xs" [disabled]="readonly()" [attr.aria-label]="'Column ' + (i + 1) + ' field'"
                                (change)="setColumn(i, 'field', $any($event.target).value)">
                          @if (!hasItemField('dataset', c.field)) { <option [value]="c.field" selected>{{ c.field }}</option> }
                          @for (x of itemsOf('dataset'); track x.path) { <option [value]="x.path" [selected]="x.path === c.field">{{ x.path }}</option> }
                        </select>
                        <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="'Column ' + (i + 1) + ' format'"
                                (change)="setColumnFormat(i, $any($event.target).value)">
                          <option value="" [selected]="!c.format?.type && c.type !== 'image'">As written</option>
                          <option value="__image" [selected]="c.type === 'image'">Picture (a bucket key)</option>
                          @for (t of formatTypes; track t) { <option [value]="t" [selected]="t === c.format?.type && c.type !== 'image'">{{ formatWords[t] ?? t }}</option> }
                        </select>
                      </div>
                      @if (c.type !== 'image') {
                        <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="'Column ' + (i + 1) + ' chip'"
                                (change)="setColumnChip(i, $any($event.target).value)">
                          <option value="" [selected]="!c.chip">Plain value (no chip)</option>
                          @for (t of tones; track t.id) { <option [value]="t.id" [selected]="t.id === c.chip">Chip · {{ t.colour }} ({{ t.id }})</option> }
                        </select>
                      }
                      @if (c.type !== 'image') {
                        <div class="rsd-two">
                          <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="'Column ' + (i + 1) + ' total'" (change)="setColumnTotal(i, $any($event.target).value)">
                            <option value="" [selected]="!c.total">No total</option>
                            @for (a of totals; track a) { <option [value]="a" [selected]="a === c.total">Total · {{ words.aggregate[a] }}</option> }
                          </select>
                          <span class="text-xs text-[color:var(--text-muted)] self-center">{{ ruleCount(c) }}</span>
                        </div>
                        @for (r of c.rules ?? []; track $index; let k = $index) {
                          <div class="rsd-rule">
                            <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="'Column ' + (i + 1) + ' rule ' + (k + 1) + ' operator'" (change)="setRule(i, k, 'operator', $any($event.target).value)">
                              @for (o of ruleOps; track o) { <option [value]="o" [selected]="o === (r.operator ?? 'gt')">{{ words.operator[o] }}</option> }
                            </select>
                            <input class="input text-xs" [value]="r.field ? '@' + r.field : (r.value ?? '')" [disabled]="readonly()" placeholder="Value, or @field"
                                   [attr.aria-label]="'Column ' + (i + 1) + ' rule ' + (k + 1) + ' value'" (change)="setRule(i, k, 'value', $any($event.target).value)" />
                            <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="'Column ' + (i + 1) + ' rule ' + (k + 1) + ' tone'" (change)="setRule(i, k, 'tone', $any($event.target).value)">
                              @for (t of tones; track t.id) { <option [value]="t.id" [selected]="t.id === (r.tone ?? 'danger')">{{ t.colour }}</option> }
                            </select>
                            <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="'Column ' + (i + 1) + ' rule ' + (k + 1) + ' style'" (change)="setRule(i, k, 'style', $any($event.target).value)">
                              <option value="fill" [selected]="(r.style ?? 'fill') === 'fill'">Fill</option><option value="text" [selected]="r.style === 'text'">Text</option>
                              <option value="chip" [selected]="r.style === 'chip'">Chip</option>
                            </select>
                            @if (!readonly()) { <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Remove rule ' + (k + 1)" (click)="removeRule(i, k)"><app-icon name="close" /></button> }
                          </div>
                        }
                        @if (!readonly() && (c.rules?.length ?? 0) < 10) {
                          <button type="button" class="btn btn-default btn-sm self-start" (click)="addRule(i)"><app-icon name="plus" />Style rule</button>
                        }
                      }
                      @if (c.type === 'image') {
                        <input class="input mono text-xs" [value]="c.imageSource?.bucket ?? ''" [disabled]="readonly()" placeholder="Bucket of the pictures"
                               [attr.aria-label]="'Column ' + (i + 1) + ' bucket'" (change)="setColumnBucket(i, $any($event.target).value)" />
                      }
                    </div>
                  }
                  @if (!readonly()) {
                    <button type="button" class="btn btn-default btn-sm self-start" (click)="addColumn()"><app-icon name="plus" />Column</button>
                  }
                </div>
              }
              @case ('format') {
                <div class="rsd-two">
                  <label class="field">
                    <span class="label">Format</span>
                    <select class="input" [disabled]="readonly()" aria-label="Format" (change)="setFormat('type', $any($event.target).value)">
                      <option value="" [selected]="!formatType()">As written</option>
                      @for (t of formatTypes; track t) { <option [value]="t" [selected]="t === formatType()">{{ formatWords[t] ?? t }}</option> }
                    </select>
                  </label>
                  @if (formatType() === 'currency') {
                    <label class="field">
                      <span class="label">Currency</span>
                      <input class="input mono" maxlength="3" [value]="formatValue('currency')" [disabled]="readonly()" aria-label="Currency"
                             placeholder="USD" (change)="setFormat('currency', $any($event.target).value.toUpperCase())" />
                    </label>
                  }
                  @if (['number', 'currency', 'percent'].includes(formatType())) {
                    <label class="field">
                      <span class="label">Decimals</span>
                      <input class="input" type="number" min="0" max="10" [value]="formatValue('maximumFractionDigits')" [disabled]="readonly()"
                             aria-label="Decimals" (change)="setFormatNumber('maximumFractionDigits', $any($event.target).value)" />
                    </label>
                  }
                  @if (formatType() === 'percent') {
                    <label class="field">
                      <span class="label">The data holds</span>
                      <select class="input" [disabled]="readonly()" aria-label="Percent scale" (change)="setFormat('scale', $any($event.target).value)">
                        <option value="" [selected]="!formatValue('scale')">A ratio (0.112)</option><option value="percent" [selected]="formatValue('scale') === 'percent'">A percent (11.2)</option>
                      </select>
                    </label>
                  }
                  @if (formatType() === 'date' || formatType() === 'datetime') {
                    <label class="field">
                      <span class="label">Style</span>
                      <select class="input" [disabled]="readonly()" aria-label="Date style" (change)="setFormat('dateStyle', $any($event.target).value)">
                        @for (d of dateStyles; track d.id) { <option [value]="d.id" [selected]="d.id === formatValue('dateStyle')">{{ d.label }}</option> }
                      </select>
                    </label>
                  }
                </div>
              }
              @case ('style') {
                <div class="rsd-two">
                  @for (s of styleKeys; track s) {
                    <label class="field" [class.rsd-span]="s === 'background'">
                      <span class="label">{{ styleLabel(s) }}</span>
                      <select class="input" [disabled]="readonly()" [attr.aria-label]="styleLabel(s)" (change)="setStyle(s, $any($event.target).value)">
                        <option value="" [selected]="!styleValue(s)">Default</option>
                        @for (o of styleEnums[s]; track o) { <option [value]="o" [selected]="o === styleValue(s)">{{ styleOptionLabel(s, o) }}</option> }
                      </select>
                    </label>
                  }
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-1">
                  @for (s of styleFlags; track s) {
                    <label class="rsd-check"><input type="checkbox" class="checkbox" [checked]="styleFlag(s)" [disabled]="readonly()"
                           (change)="setStyle(s, $any($event.target).checked ? true : '')" /><span>{{ styleLabel(s) }}</span></label>
                  }
                </div>
              }
              @case ('size') {
                <div class="rsd-two">
                  <label class="field">
                    <span class="label">Width</span>
                    <input class="input" [value]="sizeValue('width')" [disabled]="readonly()" aria-label="Width" placeholder="Full width"
                           [attr.aria-invalid]="sizeBad('width') || null" (change)="setSize('width', $any($event.target).value)" />
                  </label>
                  <label class="field">
                    <span class="label">Height</span>
                    <input class="input" [value]="sizeValue('height')" [disabled]="readonly()" aria-label="Height" placeholder="As tall as it needs"
                           [attr.aria-invalid]="sizeBad('height') || null" (change)="setSize('height', $any($event.target).value)" />
                  </label>
                </div>
                <p class="text-xs text-[color:var(--text-muted)]">Width in mm or a share of the line (170 mm, 50%); height in mm, the least it takes.</p>
              }
              @case ('asset') {
                <label class="field">
                  <span class="label">{{ f.label }}</span>
                  @if (assetsPartial()) {
                    <app-rs-pick-search [shown]="assetChoices(f.key).length" [total]="assetTotals()[assetKinds(f.key).join(',')] ?? assetsTotal()"
                                        [label]="'Find ' + f.label" placeholder="Find an approved asset" [disabled]="readonly()"
                                        (search)="findAssets.emit({ q: $event, kinds: assetKinds(f.key) })" />
                  }
                  <select class="input" [disabled]="readonly()" [attr.aria-label]="f.label" (change)="pickAsset(f.key, $any($event.target).value)">
                    <option value="" [selected]="!text(f.key)">{{ f.key === 'stampRef' ? 'No stamp' : 'Choose an approved asset' }}</option>
                    @for (a of assetChoices(f.key); track a.assetId) {
                      <option [value]="a.assetId" [selected]="a.assetId === pickedAsset(f.key)" [disabled]="a.mayPlace === false">{{ a.name }} · v{{ a.currentVersion }}{{ a.mayPlace === false ? ' (needs a grant)' : '' }}</option>
                    }
                    @if (text(f.key) && !pickedAsset(f.key)) { <option [value]="''" selected>{{ text(f.key) }} (embedded)</option> }
                  </select>
                  @if (f.hint) { <span class="text-xs text-[color:var(--text-muted)]">{{ f.hint }}</span> }
                </label>
              }
              @case ('imageSource') {
                <div class="flex flex-col gap-1.5">
                  <span class="label">{{ f.label }}</span>
                  <div class="rsd-two">
                    <select class="input text-xs" [disabled]="readonly()" aria-label="Pictures from" (change)="setSource('kind', $any($event.target).value)">
                      <option value="BUCKET" [selected]="sourceOf().kind !== 'RUN_FILE'">A bucket (the field is a key)</option>
                      <option value="RUN_FILE" [selected]="sourceOf().kind === 'RUN_FILE'">A run's files (the field is a file id)</option>
                    </select>
                    @if (sourceOf().kind !== 'RUN_FILE') {
                      <input class="input mono text-xs" [value]="sourceOf().bucket ?? ''" [disabled]="readonly()" placeholder="Bucket" aria-label="Bucket"
                             (change)="setSource('bucket', $any($event.target).value)" />
                    }
                  </div>
                  @if (sourceOf().kind !== 'RUN_FILE') {
                    <input class="input mono text-xs" [value]="sourceOf().prefix ?? ''" [disabled]="readonly()" placeholder="Folder before the key (optional)" aria-label="Folder"
                           (change)="setSource('prefix', $any($event.target).value)" />
                  }
                  <span class="text-xs text-[color:var(--text-muted)]">Read as the person making the report; checked, and scaled to the size it prints at. Never a web address.</span>
                </div>
              }
              @case ('json') {
                <label class="field">
                  <span class="label">{{ f.label }}</span>
                  <textarea class="input mono text-xs" rows="3" [value]="json(f.key)" [disabled]="readonly()" [attr.aria-label]="f.label"
                            (change)="setJson(f.key, $any($event.target).value)"></textarea>
                </label>
              }
              @default {
                <label class="field">
                  <span class="label">{{ f.label }}</span>
                  <input class="input" [value]="text(f.key)" [disabled]="readonly()" [attr.aria-label]="f.label"
                         (input)="set(f.key, $any($event.target).value || undefined)" />
                </label>
              }
            }
          }
        </section>
      }
      <ng-template #match let-m>
        @if (m) {
          <p class="text-xs flex items-center gap-1" [class]="m.ok ? 'text-[color:var(--ok-text)]' : m.missing ? 'text-[color:var(--crit-text)]' : 'text-[color:var(--text-muted)]'" role="status">
            <app-icon [name]="m.ok ? 'checkCircle' : m.missing ? 'alert' : 'info'" />{{ m.text }}
          </p>
        }
      </ng-template>
    } @else {
      <div class="p-4 flex flex-col gap-2 text-sm text-[color:var(--text-muted)]">
        <h2 class="text-sm font-semibold text-[color:var(--text-primary)]">Nothing selected</h2>
        <p>Click a block on the page, or pick one in Layers, to change what it shows and where its data comes from.</p>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .rsd-column { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); }
    .rsd-column-top { display: flex; align-items: center; gap: 0.25rem; }
    .rsd-span { grid-column: 1 / -1; }
    .rsd-rule { display: grid; grid-template-columns: 1fr 1fr 0.8fr 0.7fr auto; gap: 0.25rem; align-items: center; }
    .rsd-colour { width: 2.25rem; padding: 0.125rem; flex: none; }
    /* A group of controls that set one thing (a filter, the series, a setting's parts): one bordered box, so its
       field, operator and value read as one, apart from the properties above and below. */
    .rsd-group { padding: 0.5rem 0.625rem 0.625rem; border: 1px solid var(--border-control);
      border-radius: var(--radius-md); background: var(--surface-sunken); }
    .rsd-filter-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 1.75rem; }
    .rsd-filter-head .label { margin-bottom: 0; }
  `,
})
export class PropertiesPanel {
  readonly block = input<Block | null>(null);
  /** The template schema's definitions (GET reportStudio.json/schema). */
  readonly definitions = input<Record<string, JsonSchema>>({});
  readonly label = input('');
  readonly readonly = input(false);
  /** The test data's schema, its first record and its shape (an inspect of the designer's test data). */
  readonly fields = input<SchemaField[]>([]);
  readonly sample = input<unknown>(undefined);
  readonly tree = input<TreeNode | undefined>(undefined);
  /** The primary dataset's names (its id, and its alias when it starts at the root); the first is written in new bindings. */
  readonly names = input<string[]>(['primary']);
  /** MIG-406: what this person may place (approved assets, their own or granted), and the template's asset entries. */
  readonly assets = input<AssetCard[]>([]);
  /**
   * Owner 2026-10-20: the designer reads the first 200 assets this person may place; when there are more, each picker
   * searches the service (findAssets) for its kinds. assetsTotal is what the first read matched, assetTotals each kind
   * group's last search.
   */
  readonly assetsTotal = input(0);
  readonly assetTotals = input<Record<string, number>>({});
  readonly assetsPartial = computed(() => this.assetsTotal() > this.assets().length || Object.keys(this.assetTotals()).length > 0);
  readonly findAssets = output<{ q: string; kinds: string[] }>();
  readonly templateAssets = input<Record<string, unknown>[]>([]);
  /** A library asset picked for a setting: the designer adds the template's asset entry and points the block at it. */
  readonly assetPicked = output<{ key: string; assetId: string | null }>();
  readonly changed = output<PropChange>();
  readonly duplicate = output<void>();
  readonly remove = output<void>();

  readonly formatTypes = FORMAT_TYPES;
  readonly dateStyles = [{ id: '', label: '19 Oct 2026' }, { id: 'long', label: '19 October 2026' }, { id: 'short', label: 'Short' },
    { id: 'iso', label: '2026-10-19' }];
  readonly styleEnums = STYLE_ENUMS;
  /** Background last, on a row of its own: its soft tints' words do not fit half the panel. */
  readonly styleKeys = ['align', 'fontSize', 'color', 'padding', 'marginTop', 'marginBottom', 'background'];
  readonly styleFlags = ['bold', 'italic', 'uppercase', 'border', 'chip'];
  readonly formatWords = FORMAT_WORDS;
  readonly tones = TONES;
  readonly filterOps: { id: FilterOp; label: string }[] = [{ id: 'equals', label: 'is' }, { id: 'notEquals', label: 'is not' }, { id: 'in', label: 'is one of' }];

  readonly primary = computed(() => this.names()[0] ?? 'primary');
  readonly hasData = computed(() => this.fields().length > 0);
  readonly lists = computed(() => collections(this.fields()));
  readonly scalarFields = computed(() => scalars(this.fields()));
  readonly icon = computed(() => typeIcon(this.block()?.type ?? ''));
  readonly title = computed(() => this.label() || typeWord(this.block()?.type ?? ''));

  readonly groups = computed(() => {
    const b = this.block();
    if (!b) return [];
    const all = fieldsFor(b.type, this.definitions());
    const order: { id: PropField['group']; label: string }[] = [
      { id: 'content', label: 'Content' }, { id: 'data', label: 'Data' }, { id: 'format', label: 'Format' },
      { id: 'style', label: 'Style' }, { id: 'layout', label: 'Layout' },
    ];
    return order.map(g => ({ ...g, fields: all.filter(f => f.group === g.id) })).filter(g => g.fields.length);
  });

  readonly columns = computed(() => (Array.isArray(this.block()?.['columns']) ? this.block()!['columns'] : []) as
    { id: string; label?: string; field: string; format?: { type?: string }; type?: string; imageSource?: { kind?: string; bucket?: string }; chip?: string;
      total?: string; rules?: ColumnRule[] }[]);

  // ---------------------------------------------------------------- phase 4: series, small objects, totals and rules

  readonly words = OPTION_WORDS as Record<string, Record<string, string>> & { aggregate: Record<string, string>; operator: Record<string, string> };
  readonly aggregates = ['sum', 'avg', 'min', 'max', 'count', 'rows', 'countDistinct', 'percentOfTotal'];
  readonly totals = ['sum', 'avg', 'min', 'max', 'count', 'countDistinct'];
  readonly ruleOps = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'isNull', 'isNotNull'];
  readonly String = String;
  /** The list whose items the field pickers offer: a chart's or repeat's collection, else the bound list. */
  readonly listKey = computed(() => (this.block()?.['dataset'] !== undefined || ['chart', 'repeat'].includes(this.block()?.type ?? '') ? 'dataset' : 'binding'));
  readonly seriesList = computed(() => (Array.isArray(this.block()?.['series']) ? this.block()!['series'] : []) as
    { name?: string; field: string; aggregate?: string; color?: string }[]);

  private seriesCopy(): Record<string, unknown>[] {
    return JSON.parse(JSON.stringify(this.seriesList())) as Record<string, unknown>[];
  }

  setSeries(i: number, key: string, value: string | undefined): void {
    const list = this.seriesCopy();
    if (!list[i]) return;
    if (value === undefined || (key === 'aggregate' && value === 'sum')) delete list[i][key]; else list[i][key] = value;
    this.set('series', list);
  }

  addSeries(): void {
    const list = this.seriesCopy();
    const first = this.itemsOf('dataset').find(f => f.type === 'number' || f.type === 'integer');
    list.push({ name: `Series ${list.length + 1}`, field: first?.path ?? 'value' });
    this.set('series', list);
  }

  removeSeries(i: number): void {
    const list = this.seriesCopy();
    list.splice(i, 1);
    this.set('series', list);
  }

  objectKeys(f: PropField): string[] {
    return Object.keys(f.props ?? {});
  }

  subLabel(k: string): string {
    return ({ min: 'From', max: 'To', title: 'Axis title', categoryTitle: 'Category axis title', value: 'Value', label: 'Label', binding: 'Data',
      field: 'Field of each item', left: 'Field', operator: 'Comparison', right: 'Value' } as Record<string, string>)[k] ?? k;
  }

  subText(key: string, k: string): string {
    const o = this.block()?.[key] as Record<string, unknown> | undefined;
    const v = o?.[k];
    return v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  }

  /** One setting of an object setting: numbers as numbers, a condition's values separated by commas as a list. */
  setSub(key: string, k: string, raw: string, schema: JsonSchema): void {
    const o = { ...((this.block()?.[key] ?? {}) as Record<string, unknown>) };
    const v = raw.trim();
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!v) delete o[k];
    else if (types.includes('number') && !types.includes('string')) {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      o[k] = n;
    } else if (k === 'right') {
      const op = String(o['operator'] ?? '');
      o[k] = op === 'in' || op === 'notIn' ? v.split(',').map(x => x.trim()).filter(Boolean)
        : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v;
    } else o[k] = v;
    this.set(key, Object.keys(o).length ? o : undefined);
  }

  setColumnTotal(i: number, total: string): void {
    const cols = this.columnList() as Record<string, unknown>[];
    if (!cols[i]) return;
    if (total) cols[i]['total'] = total; else delete cols[i]['total'];
    this.set('columns', cols);
  }

  ruleCount(c: { rules?: ColumnRule[] }): string {
    const n = c.rules?.length ?? 0;
    return n ? `${n} style rule${n === 1 ? '' : 's'} · the first that holds wins` : 'No style rules';
  }

  private rulesOf(i: number): { cols: Record<string, unknown>[]; rules: ColumnRule[] } {
    const cols = this.columnList() as Record<string, unknown>[];
    return { cols, rules: (cols[i]?.['rules'] as ColumnRule[] | undefined) ?? [] };
  }

  addRule(i: number): void {
    const { cols, rules } = this.rulesOf(i);
    if (!cols[i]) return;
    cols[i]['rules'] = [...rules, { operator: 'gt', value: 0, tone: 'danger', style: 'fill' }];
    this.set('columns', cols);
  }

  removeRule(i: number, k: number): void {
    const { cols, rules } = this.rulesOf(i);
    rules.splice(k, 1);
    if (rules.length) cols[i]['rules'] = rules; else delete cols[i]['rules'];
    this.set('columns', cols);
  }

  /** A rule's setting; a value written "@ref_high" compares with that field of the row. */
  setRule(i: number, k: number, key: 'operator' | 'value' | 'tone' | 'style', raw: string): void {
    const { cols, rules } = this.rulesOf(i);
    const r = { ...(rules[k] ?? {}) } as ColumnRule;
    if (key === 'value') {
      const v = raw.trim();
      delete r.value;
      delete r.field;
      if (v.startsWith('@')) r.field = v.slice(1);
      else if (v) r.value = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    } else (r as Record<string, unknown>)[key] = raw;
    rules[k] = r;
    cols[i]['rules'] = rules;
    this.set('columns', cols);
  }
  readonly itemsText = computed(() => (Array.isArray(this.block()?.['items']) ? (this.block()!['items'] as unknown[]).map(String).join('\n') : ''));
  readonly formatType = computed(() => String((this.block()?.['format'] as { type?: string } | undefined)?.type ?? ''));

  /** Whether the bound field is in the test data: its sample value, or why it is not. */
  readonly bindingMatch = computed(() => {
    const binding = this.text('binding');
    if (!binding) return null;
    if (!this.hasData()) return { ok: false, missing: false, text: 'Pick test data to check this field.' };
    const inner = innerPath(binding, this.names());
    if (inner === null) return { ok: false, missing: false, text: 'Reads another dataset of the template.' };
    const v = valueAt(this.sample(), inner);
    if (v === undefined && !this.fields().some(f => f.path === inner)) {
      return { ok: false, missing: true, text: `${inner} is not in the test data.` };
    }
    if (Array.isArray(v) && this.block()?.type === 'labelValue') {
      const rows = filterRows(v, this.filter());
      const field = this.text('field');
      const total = lengthAt(this.tree(), inner) ?? v.length;
      if (field) return { ok: true, missing: false, text: `Data matches · first row's ${field}: ${rows.length ? sampleText(valueAt(rows[0], field)) : 'no row'}` };
      if (this.formatType() === 'count') {
        return { ok: true, missing: false, text: !this.filter() ? `Data matches · ${total} rows`
          : `Data matches · ${rows.length} of the sample's ${v.length} rows${total > v.length ? ` (the data has ${total})` : ''}` };
      }
      return { ok: false, missing: false, text: `A list of ${total}: pick its field below, or Format › count.` };
    }
    return { ok: true, missing: false, text: `Data matches · sample: ${sampleText(v)}` };
  });

  // ---------------------------------------------------------------- row filters and a list's field (QA 2026-10-20)

  /** The setting whose list a filter's rows come from: a table's collection, else the block's own binding. */
  readonly rowsKey = computed(() => (this.block()?.type === 'table' ? 'dataset' : 'binding'));

  /** A label and value shows its list's settings when its binding is a list (or they are set already). */
  readonly rowsShown = computed(() => {
    const path = this.collectionOf('binding');
    return (!!path && this.hasList(path)) || !!this.text('field') || !!this.filter();
  });

  readonly filter = computed(() => {
    const f = this.block()?.['filter'];
    return f && typeof f === 'object' && typeof (f as RowFilter).field === 'string' ? (f as RowFilter) : null;
  });

  readonly filterOp = computed<FilterOp>(() => {
    const f = this.filter();
    return f && Array.isArray(f.in) ? 'in' : f && f.notEquals !== undefined ? 'notEquals' : 'equals';
  });

  readonly filterValue = computed(() => filterValues(this.filter()).join(this.filterOp() === 'in' ? '\n' : ''));

  readonly filterFields = computed(() => this.itemsOf(this.rowsKey()).filter(f => !/object|list|array/i.test(f.type)));

  /** The sample's rows of the filter's list, or null when the test data does not have it. */
  private readonly sampleRows = computed(() => {
    const path = this.collectionOf(this.rowsKey());
    if (!path || !this.hasData()) return null;
    const v = valueAt(this.sample(), path);
    return Array.isArray(v) ? v : null;
  });

  /** The values the filter's field takes in the sample (at most 30), offered as the value. */
  readonly filterSuggestions = computed(() => {
    const field = this.filter()?.field;
    const rows = this.sampleRows();
    if (!field || !rows) return [];
    const seen = new Set<string>();
    for (const r of rows) {
      const v = valueAt(r, field);
      if (v !== undefined && v !== null && typeof v !== 'object' && String(v).trim()) seen.add(String(v).trim());
      if (seen.size >= 30) break;
    }
    return [...seen];
  });

  /** How many sample rows the filter keeps. */
  readonly filterMatch = computed(() => {
    const f = this.filter();
    if (!f) return null;
    const rows = this.sampleRows();
    if (!rows) return { ok: false, missing: false, text: this.hasData() ? 'The list is not in the test data.' : 'Pick test data to see which rows it keeps.' };
    if (rows.length && !rows.some(r => valueAt(r, f.field) !== undefined)) return { ok: false, missing: true, text: `${f.field} is not in the rows.` };
    const kept = filterRows(rows, f).length;
    const total = lengthAt(this.tree(), this.collectionOf(this.rowsKey())) ?? rows.length;
    const of = `${rows.length} sample row${rows.length === 1 ? '' : 's'}${total > rows.length ? ` (the data has ${total})` : ''}`;
    return kept ? { ok: true, missing: false, text: `Keeps ${kept} of ${of}` } : { ok: false, missing: true, text: `Keeps none of the ${of}` };
  });

  hasFilterField(field: string): boolean {
    return this.filterFields().some(f => f.path === field);
  }

  /** A field starts a filter ("is", no value yet: a blank cell); no field removes it. */
  setFilterField(raw: string): void {
    const field = raw.trim();
    if (!field) { this.set('filter', undefined); return; }
    if (!FILTER_FIELD.test(field)) return;
    const f = this.filter();
    this.set('filter', f ? { ...withoutOp(f), field, ...opValue(this.filterOp(), filterValues(f)) } : { field, equals: '' });
  }

  /** Another operator keeps the value(s) written so far. */
  setFilterOp(op: string): void {
    const f = this.filter();
    if (!f || (op !== 'equals' && op !== 'notEquals' && op !== 'in')) return;
    this.set('filter', { ...withoutOp(f), ...opValue(op, filterValues(f)) });
  }

  setFilterValue(raw: string): void {
    const f = this.filter();
    if (!f) return;
    const op = this.filterOp();
    const values = op === 'in' ? [...new Set(raw.split('\n').map(v => v.trim().slice(0, 200)).filter(Boolean))].slice(0, 20) : [raw.trim().slice(0, 200)];
    this.set('filter', { ...withoutOp(f), ...opValue(op, values) });
  }

  styleOptionLabel(key: string, option: string): string {
    if (key !== 'background') return option;
    if (option === 'none') return 'None (transparent)';
    const tone = TONES.find(t => `${t.id}-soft` === option);
    return tone ? `Soft ${tone.colour} (${tone.id})` : option;
  }

  value(key: string): unknown {
    return this.block()?.[key];
  }

  text(key: string): string {
    const v = this.block()?.[key];
    return v === undefined || v === null ? '' : String(v);
  }

  json(key: string): string {
    const v = this.block()?.[key];
    return v === undefined ? '' : JSON.stringify(v);
  }

  set(key: string, value: unknown): void {
    this.changed.emit({ key, value });
  }

  setEnum(f: PropField, raw: string): void {
    if (!raw) { this.set(f.key, undefined); return; }
    const numeric = f.options?.every(o => /^\d+$/.test(o));
    this.set(f.key, numeric ? Number(raw) : raw);
  }

  setNumber(key: string, raw: string): void {
    this.set(key, raw === '' ? undefined : Number(raw));
  }

  setJson(key: string, raw: string): void {
    try {
      this.set(key, raw.trim() ? JSON.parse(raw) : undefined);
    } catch {
      // left as it was: the box shows the setting again on the next draw
    }
  }

  setItems(raw: string): void {
    const items = raw.split('\n').map(l => l.trim()).filter(Boolean);
    this.set('items', items.length ? items : undefined);
  }

  setBinding(raw: string): void {
    const v = raw.trim();
    this.set('binding', v || undefined);
  }

  /** A collection's path inside the data (the binding without its dataset name). */
  collectionOf(key: string): string {
    const v = this.text(key);
    return v ? (innerPath(v, this.names()) ?? v) : '';
  }

  hasList(path: string): boolean {
    return this.lists().some(c => c.path === path);
  }

  setCollection(key: string, path: string): void {
    this.set(key, path ? `${this.primary()}.${path}` : undefined);
  }

  itemsOf(key: string): SchemaField[] {
    return itemFields(this.fields(), this.collectionOf(key));
  }

  hasItemField(key: string, field: string): boolean {
    return this.itemsOf(key).some(f => f.path === field);
  }

  /** Whether a list binding is in the test data, and how many sample rows it has. */
  listMatch(key: string): { ok: boolean; missing: boolean; text: string } | null {
    const path = this.collectionOf(key);
    if (!path) return null;
    if (!this.hasData()) return { ok: false, missing: false, text: 'Pick test data to check this collection.' };
    const n = lengthAt(this.tree(), path);
    const v = valueAt(this.sample(), path);
    const count = n ?? (Array.isArray(v) ? v.length : null);
    if (count === null) return { ok: false, missing: true, text: `${path} is not a list in the test data.` };
    const missing = this.columns().filter(c => !this.hasItemField(key, c.field)).map(c => c.field);
    if (key === 'dataset' && missing.length) {
      return { ok: false, missing: true, text: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not in the items · ${count} sample rows` };
    }
    return { ok: true, missing: false, text: `Data matches · ${count} sample row${count === 1 ? '' : 's'}` };
  }

  private columnList(): { id: string; label?: string; field: string; format?: Record<string, unknown> }[] {
    return JSON.parse(JSON.stringify(this.columns())) as { id: string; label?: string; field: string; format?: Record<string, unknown> }[];
  }

  setColumn(i: number, key: 'label' | 'field', value: string | undefined): void {
    const cols = this.columnList();
    if (!cols[i]) return;
    if (value === undefined) delete cols[i][key]; else cols[i][key] = value;
    this.set('columns', cols);
  }

  setColumnFormat(i: number, type: string): void {
    const cols = this.columnList() as ({ type?: string; imageSource?: Record<string, unknown>; imageWidth?: string } & { format?: Record<string, unknown> })[];
    if (!cols[i]) return;
    if (type === '__image') {
      cols[i].type = 'image';
      delete cols[i].format;
      delete (cols[i] as { chip?: string }).chip;
      cols[i].imageSource = cols[i].imageSource ?? { kind: 'BUCKET', bucket: '' };
      cols[i].imageWidth = cols[i].imageWidth ?? '20mm';
    } else {
      delete cols[i].type;
      delete cols[i].imageSource;
      delete cols[i].imageWidth;
      if (!type) delete cols[i].format; else cols[i].format = { ...(cols[i].format ?? {}), type };
    }
    this.set('columns', cols);
  }

  /** A column's values as small rounded badges in a tone, or plain. */
  setColumnChip(i: number, tone: string): void {
    const cols = this.columnList() as ({ chip?: string })[];
    if (!cols[i]) return;
    if (TONES.some(t => t.id === tone)) cols[i].chip = tone; else delete cols[i].chip;
    this.set('columns', cols);
  }

  setColumnBucket(i: number, bucket: string): void {
    const cols = this.columnList() as ({ imageSource?: Record<string, unknown> })[];
    if (!cols[i]) return;
    cols[i].imageSource = { kind: 'BUCKET', bucket: bucket.trim() };
    this.set('columns', cols);
  }

  /** The approved assets a setting may pick: signatures for a signature, stamps for a stamp, logos and images otherwise. */
  assetChoices(key: string): AssetCard[] {
    const want = this.assetKinds(key);
    return this.assets().filter(a => want.includes(a.kind));
  }

  /** The kinds a setting picks from. */
  assetKinds(key: string): string[] {
    const type = this.block()?.type;
    return key === 'stampRef' || type === 'stamp' ? ['STAMP'] : type === 'signature' ? ['SIGNATURE'] : ['LOGO', 'IMAGE'];
  }

  /** The library asset a block's setting points at (through the template's asset entry), or null. */
  pickedAsset(key: string): string | null {
    const ref = this.text(key);
    const entry = this.templateAssets().find(e => e['id'] === ref);
    return entry && typeof entry['assetRef'] === 'string' ? (entry['assetRef'] as string) : null;
  }

  pickAsset(key: string, assetId: string): void {
    this.assetPicked.emit({ key, assetId: assetId || null });
  }

  sourceOf(): { kind?: string; bucket?: string; prefix?: string } {
    return (this.value('imageSource') ?? {}) as { kind?: string; bucket?: string; prefix?: string };
  }

  setSource(key: 'kind' | 'bucket' | 'prefix', v: string): void {
    const s = { ...this.sourceOf() } as Record<string, unknown>;
    if (key === 'kind' && v === 'RUN_FILE') { this.set('imageSource', { kind: 'RUN_FILE' }); return; }
    s['kind'] = s['kind'] ?? 'BUCKET';
    if (v.trim()) s[key] = v.trim(); else delete s[key];
    this.set('imageSource', s);
  }

  addColumn(): void {
    const cols = this.columnList();
    const taken = new Set(cols.map(c => c.id));
    let n = cols.length + 1;
    while (taken.has(`c${n}`)) n++;
    const field = this.itemsOf('dataset').find(f => !cols.some(c => c.field === f.path))?.path ?? 'field';
    cols.push({ id: `c${n}`, label: field, field });
    this.set('columns', cols);
  }

  removeColumn(i: number): void {
    const cols = this.columnList();
    cols.splice(i, 1);
    this.set('columns', cols);
  }

  formatValue(key: string): string {
    const f = this.block()?.['format'] as Record<string, unknown> | undefined;
    const v = f?.[key];
    return v === undefined || v === null ? '' : String(v);
  }

  setFormat(key: string, value: string): void {
    const f = { ...((this.block()?.['format'] as Record<string, unknown> | undefined) ?? {}) };
    if (key === 'type' && !value) { this.set('format', undefined); return; }
    if (value) f[key] = value; else delete f[key];
    if (!f['type']) f['type'] = 'text';
    this.set('format', f);
  }

  setFormatNumber(key: string, raw: string): void {
    const f = { ...((this.block()?.['format'] as Record<string, unknown> | undefined) ?? {}) };
    if (raw === '') delete f[key]; else f[key] = Math.max(0, Math.min(10, Number(raw)));
    this.set('format', f);
  }

  styleLabel(key: string): string {
    const words: Record<string, string> = { align: 'Align', fontSize: 'Text size', color: 'Text colour', background: 'Background', padding: 'Padding',
      marginTop: 'Space above', marginBottom: 'Space below', bold: 'Bold', italic: 'Italic', uppercase: 'Capitals', border: 'Border',
      chip: 'Show as a chip (small rounded badge)' };
    return words[key] ?? key;
  }

  styleValue(key: string): string {
    const s = this.block()?.['style'] as Record<string, unknown> | undefined;
    return s?.[key] === undefined ? '' : String(s[key]);
  }

  styleFlag(key: string): boolean {
    return (this.block()?.['style'] as Record<string, unknown> | undefined)?.[key] === true;
  }

  setStyle(key: string, value: unknown): void {
    const s = { ...((this.block()?.['style'] as Record<string, unknown> | undefined) ?? {}) };
    if (value === '' || value === undefined) delete s[key]; else s[key] = value;
    this.set('style', Object.keys(s).length ? s : undefined);
  }

  sizeValue(key: 'width' | 'height'): string {
    const s = this.block()?.['size'] as Record<string, string> | undefined;
    return (s?.[key] ?? '').replace(/mm$/, ' mm');
  }

  sizeBad(key: 'width' | 'height'): boolean {
    const v = this.sizeValue(key).replace(/\s+/g, '');
    return !!v && !(key === 'width' ? SIZE_PATTERN : HEIGHT_PATTERN).test(v);
  }

  setSize(key: 'width' | 'height', raw: string): void {
    let v = raw.replace(/\s+/g, '').toLowerCase();
    if (/^\d{1,3}(\.\d)?$/.test(v)) v += 'mm';
    const s = { ...((this.block()?.['size'] as Record<string, string> | undefined) ?? {}) };
    if (!v) delete s[key];
    else if ((key === 'width' ? SIZE_PATTERN : HEIGHT_PATTERN).test(v)) s[key] = v;
    else return;
    this.set('size', Object.keys(s).length ? s : undefined);
  }
}
