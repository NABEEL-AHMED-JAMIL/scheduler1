import { Component, ElementRef, OnInit, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';
import { Icon } from '../../../shared/ui/icon';
import { AppLoading, InlineStatus } from '../../../shared/ui/loading';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { InspectResult, ReportVersionRow, SampleRow, SchemaField, SourceRef, TemplateDefinition, bundleParts } from '../report-studio.model';
import { firstRecord, rootPathOf, sampleText, scalars, valueAt } from '../designer/designer-model';
import { TemplateField, TemplateFields, templateFields } from './template-fields';
import { Choice, FieldMatch, HOW_WORDS, Prior, autoMatch, describe, mappingBody, priorFrom } from './auto-match';
import { DataCard, DataSources } from './data-sources';
import { FieldPicker, Picked, typeWord } from './field-picker';
import { MappingPreview } from './mapping-preview';

/** Which rows of a list the report reads: the first, one picked, one report per row, or all of them in one report. */
export type RowMode = 'first' | 'row' | 'each' | 'all';
type Filter = 'all' | 'needs' | 'changed';

/** One report per row makes at most this many reports at once. */
export const EACH_MAX = 50;
/** A template with at most this many fields shows them all, open. */
const FEW = 12;
/** Columns shown before "+ N more". */
const COLUMNS_SHOWN = 12;

/** A group of the template's fields, as the page shows it. */
export interface FieldGroup { name: string; rows: FieldMatch[]; needs: number; empty: number; matched: number; }

/** The version's root path read as its data's start and the row it picked: "$[0]" is the first row of "$". */
export function splitRoot(root: string | null | undefined): { base: string; row: number | null } {
  const r = (root ?? '$').trim() || '$';
  const m = /^(.*)\[(\d+)\]$/.exec(r);
  return m ? { base: m[1] || '$', row: Number(m[2]) } : { base: r, row: null };
}

/** Where the report reads, from the data's shape, the template's and the person's choice of rows. */
export function rootFor(base: string, shape: InspectResult['shape'] | null, readsRows: boolean, mode: RowMode, row: number): string {
  if (shape !== 'list' || readsRows || mode === 'all') return base;
  return `${base}[${mode === 'row' ? Math.max(0, row) : 0}]`;
}

/** The template's fields in its own groups, each with its counts. */
export function groupsOf(matches: FieldMatch[], sections: string[]): FieldGroup[] {
  return sections.map(name => {
    const rows = matches.filter(m => m.field.section === name);
    return { name, rows, needs: rows.filter(r => r.state === 'needs').length, empty: rows.filter(r => r.state === 'empty').length,
      matched: rows.filter(r => r.state === 'matched').length };
  }).filter(g => g.rows.length);
}

/**
 * Data and mapping (Create report step 2; owner-approved redesign 2026-10-27). The data first -- on Generate again the
 * version's own frozen data and its mapping, so nothing starts blank -- then every template field matched automatically
 * (by key, by the template's label, by names written differently and synonyms, by type; a list's columns too), and only
 * what a person must settle in "Needs you" at the top, each with a suggestion, a sample, Use it and Choose…. The rest is
 * grouped by the template's own sections and labels, collapsed with "All matched" or "N need you", with filters and a
 * search; a live preview of the template's pages sits beside it, and a footer says what still needs a source.
 */
@Component({
  selector: 'app-rs-data-mapping',
  imports: [FormsModule, AdvancedSelect, Icon, AppLoading, InlineStatus, DataSources, FieldPicker, MappingPreview],
  templateUrl: './data-mapping.html',
  styleUrl: './data-mapping.css',
})
export class DataMapping implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  readonly definition = input.required<TemplateDefinition>();
  readonly templateId = input('');
  readonly samples = input<SampleRow[]>([]);
  /** Generate again: the version the next is made from (its data and its mapping). */
  readonly version = input<ReportVersionRow | null>(null);
  readonly pipelineJobId = input<number | null>(null);
  readonly stepKey = input<string | null>(null);
  readonly tenantId = input<number | null>(null);
  /** Whether "one report per row" may be offered (a new report; Generate again makes one version). */
  readonly manyReports = input(true);

  readonly source = model<SourceRef | null>(null);
  readonly rootPath = model('$');
  readonly mapping = model<Record<string, unknown>>({});
  /** Fields a person must settle before the preview: none, or how many. */
  readonly blocking = model(0);
  /** One report per row: how many (0 for one report). */
  readonly eachRow = model(0);
  readonly dataLabel = model('');
  readonly next = output<void>();
  readonly back = output<void>();

  readonly card = signal<DataCard>('run');
  readonly inspect = signal<InspectResult | null>(null);
  readonly inspecting = signal(false);
  readonly inspectError = signal('');
  readonly base = signal('$');
  readonly baseDraft = signal('$');
  readonly rowMode = signal<RowMode>('first');
  readonly rowIndex = signal(0);
  /** The person's own choices on this page; they stay while the data changes, if they still fit. */
  readonly choices = signal<Record<string, Prior>>({});
  readonly filter = signal<Filter>('all');
  readonly query = signal('');
  private readonly toggled = signal<Record<string, boolean>>({});
  readonly editing = signal<string | null>(null);
  readonly hovered = signal<string | null>(null);
  readonly allColumns = signal(false);

  readonly again = computed(() => !!this.version());
  readonly guide = computed<TemplateFields>(() => templateFields(this.definition()));
  readonly schema = computed<SchemaField[]>(() => this.inspect()?.schema ?? []);
  readonly records = computed(() => this.inspect()?.records ?? 0);
  readonly isList = computed(() => this.inspect()?.shape === 'list');
  /** Several rows a record-shaped template could read one at a time. */
  readonly manyRows = computed(() => this.isList() && !this.guide().readsRows && this.records() > 1);
  readonly sampleRows = computed(() => {
    const s = this.inspect()?.sample;
    return Array.isArray(s) ? s : s ? [s] : [];
  });
  /** The row the matching and the samples read. */
  readonly record = computed(() => {
    const rows = this.sampleRows();
    if (this.guide().readsRows || !this.isList()) return this.isList() ? rows[0] : firstRecord(this.inspect());
    return rows[this.rowMode() === 'row' ? Math.min(this.rowIndex(), rows.length - 1) : 0] ?? rows[0];
  });
  readonly rowOptions = computed<AdvancedOption[]>(() => {
    const cols = scalars(this.schema()).slice(0, 3).map(c => c.path);
    return this.sampleRows().slice(0, 500).map((r, i) => ({ value: String(i), label: `Row ${i + 1}`,
      description: cols.map(c => sampleText(valueAt(r, c))).filter(Boolean).join(' · ') }));
  });
  readonly columnsShown = computed(() => {
    const rec = this.record();
    const top = this.schema().filter(f => !f.path.includes('.') && !f.path.includes('[]') && f.path !== '$');
    return top.map(f => {
      const v = valueAt(rec, f.path);
      return { name: f.path, value: Array.isArray(v) ? `${v.length} row${v.length === 1 ? '' : 's'}` : sampleText(v), type: typeWord(f.type) };
    });
  });

  /** The version's own choices (its kept mapping), the start of Generate again. */
  readonly kept = computed<Record<string, Prior>>(() => {
    const v = this.version();
    if (!v) return {};
    return priorFrom((v.config?.['mapping'] as Record<string, unknown> | undefined) ?? {}, this.guide().fields);
  });
  /** The fields the version's mapping named (so a change from them shows under "Changed from vN"). */
  private readonly keptNamed = computed(() => new Set(Object.keys((this.version()?.config?.['mapping'] as Record<string, unknown> | undefined) ?? {})));

  readonly matches = computed<FieldMatch[]>(() => {
    if (!this.inspect()) return [];
    return autoMatch(this.guide().fields, this.schema(), this.record(), { ...this.kept(), ...this.choices() });
  });
  readonly needs = computed(() => this.matches().filter(m => m.state === 'needs'));
  readonly requiredNeeds = computed(() => this.needs().filter(m => m.field.required));
  readonly matched = computed(() => this.matches().filter(m => m.state === 'matched').length);
  readonly emptyCount = computed(() => this.matches().filter(m => m.state === 'empty').length);
  readonly changed = computed(() => (this.again() ? this.matches().filter(m => (m.state === 'matched' && m.how !== 'kept')
    || (m.state !== 'matched' && this.keptNamed().has(m.field.path))) : []));
  readonly listsFed = computed(() => this.matches().filter(m => m.field.list && !m.field.rootRow && m.state === 'matched'));
  readonly listsFedText = computed(() => {
    const l = this.listsFed();
    return l.slice(0, 4).map(m => m.field.label.toLowerCase()).join(', ') + (l.length > 4 ? ', …' : '');
  });
  readonly groups = computed(() => groupsOf(this.shownMatches(), this.guide().sections));
  /** The rows the filter and the search leave. */
  readonly shownMatches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const changed = new Set(this.changed().map(m => m.field.path));
    return this.matches().filter(m => {
      if (this.filter() === 'needs' && m.state !== 'needs') return false;
      if (this.filter() === 'changed' && !changed.has(m.field.path)) return false;
      if (!q) return true;
      return [m.field.label, m.field.path, m.field.section, m.sample, describe(m.choice)].some(t => t.toLowerCase().includes(q));
    });
  });
  readonly few = computed(() => this.guide().fields.length <= FEW);

  readonly howWords = HOW_WORDS;
  readonly columnsLimit = COLUMNS_SHOWN;
  readonly eachMax = EACH_MAX;
  readonly bundleParts = bundleParts;
  readonly versionNo = computed(() => this.version()?.version ?? 0);

  /** Where the field being looked at prints (the canvas outlines it). */
  readonly focusComponent = computed(() => {
    const path = this.editing() ?? this.hovered();
    return path ? this.guide().fields.find(f => f.path === path)?.components[0] ?? null : null;
  });
  readonly flaggedComponents = computed(() => this.needs().flatMap(m => m.field.components.slice(0, 1)));

  constructor() {
    effect(() => {
      const s = this.source();
      const base = this.base();
      untracked(() => this.read(s, base));
    });
    effect(() => {
      // The page's choices, as the preview and the generation take them.
      const body = mappingBody(this.matches());
      const root = rootFor(this.base(), this.inspect()?.shape ?? null, this.guide().readsRows, this.rowMode(), this.rowIndex());
      const each = this.rowMode() === 'each' && this.manyRows() ? Math.min(EACH_MAX, this.records()) : 0;
      untracked(() => {
        if (JSON.stringify(body) !== JSON.stringify(this.mapping())) this.mapping.set(body);
        if (root !== this.rootPath()) this.rootPath.set(root);
        if (this.blocking() !== this.needs().length) this.blocking.set(this.needs().length);
        if (this.eachRow() !== each) this.eachRow.set(each);
        const label = this.inspect()?.label ?? '';
        if (this.dataLabel() !== label) this.dataLabel.set(label);
      });
    });
  }

  ngOnInit(): void {
    const v = this.version();
    const { base, row } = splitRoot(v ? (v.config?.['rootPath'] as string | undefined) : rootPathOf(this.definition()));
    this.base.set(base);
    this.baseDraft.set(base);
    if (row !== null) { this.rowIndex.set(row); this.rowMode.set(row > 0 ? 'row' : 'first'); }
  }

  private seq = 0;

  private read(source: SourceRef | null, base: string): void {
    const seq = ++this.seq;
    this.inspectError.set('');
    if (!source) { this.inspect.set(null); this.inspecting.set(false); return; }
    this.inspecting.set(true);
    this.api.inspect(source, base || '$').subscribe({
      next: r => {
        if (seq !== this.seq) return;
        this.inspecting.set(false);
        this.inspect.set(r);
        if (this.rowIndex() >= r.records) { this.rowIndex.set(0); if (this.rowMode() === 'row') this.rowMode.set('first'); }
      },
      error: e => {
        if (seq !== this.seq) return;
        this.inspecting.set(false);
        this.inspect.set(null);
        this.inspectError.set(studioError(e, 'The data could not be read.').message);
      },
    });
  }

  /** Try again after the data could not be read: the same source and start. */
  retryRead(): void {
    this.read(this.source(), this.base());
  }

  setBase(value: string): void {
    const v = value.trim() || '$';
    this.baseDraft.set(v);
    if (v !== this.base()) this.base.set(v);
  }

  setRow(value: string): void {
    this.rowIndex.set(Number(value) || 0);
    this.rowMode.set('row');
  }

  // ---------------------------------------------------------------- groups and rows

  isOpen(g: FieldGroup): boolean {
    const t = this.toggled()[g.name];
    if (t !== undefined) return t;
    return this.few() || g.needs > 0 || this.filter() !== 'all' || !!this.query().trim() || this.groups().length === 1;
  }

  toggle(g: FieldGroup, open: boolean): void {
    this.toggled.update(t => ({ ...t, [g.name]: open }));
  }

  groupState(g: FieldGroup): { text: string; tone: string } {
    if (g.needs) return { text: `${g.needs} need${g.needs === 1 ? 's' : ''} you`, tone: 'pill-crit' };
    if (!g.empty) return { text: 'All matched', tone: 'pill-ok' };
    return { text: `${g.matched} matched · ${g.empty} print${g.empty === 1 ? 's' : ''} empty`, tone: 'pill-neutral' };
  }

  groupCount(g: FieldGroup): string {
    const lists = g.rows.filter(r => r.field.list && !r.field.rootRow).length;
    return `${g.rows.length} field${g.rows.length === 1 ? '' : 's'}${lists ? ` · ${lists} list${lists === 1 ? '' : 's'}` : ''}`;
  }

  howText(m: FieldMatch): string {
    if (m.state === 'needs') return 'Needs you';
    if (m.state === 'empty') return m.field.conditionOnly ? 'Not in this data: the block it decides stays hidden' : 'Not in this data: prints empty';
    if (m.how === 'kept') return this.again() ? `Kept from v${this.versionNo()}` : 'Kept';
    if (m.choice.kind === 'blank') return 'Left blank';
    if (m.choice.kind === 'fixed') return 'A fixed value';
    if (m.choice.kind === 'combine' && m.how !== 'yours') return 'Combined';
    return this.howWords[m.how];
  }

  /** The row's choice in a few words (the trigger's text). */
  choiceText(m: FieldMatch): string {
    switch (m.choice.kind) {
      case 'column': return m.choice.path;
      case 'combine': return m.choice.parts.filter(p => 'path' in p).map(p => (p as { path: string }).path).join(' + ');
      case 'fixed': return 'Fixed value';
      case 'blank': return 'Left blank';
      default: return 'Choose a source';
    }
  }

  columnsText(m: FieldMatch): string {
    const got = m.columns.filter(c => c.source).length;
    return `${got} of ${m.columns.length} column${m.columns.length === 1 ? '' : 's'} matched`;
  }

  /** A list's columns read under another name, or not found: the ones a person may want to see. */
  columnDiffs(m: FieldMatch): FieldMatch['columns'] {
    return m.columns.filter(c => c.source !== c.column);
  }

  fieldKind(f: TemplateField): string {
    if (f.conditionOnly) return 'decides what shows';
    if (f.picture) return 'a picture';
    if (f.list && !f.rootRow) return 'a list';
    return f.rootRow ? 'a column of every row' : '';
  }

  open(path: string): void {
    this.editing.set(this.editing() === path ? null : path);
  }

  chosen(path: string, picked: Picked): void {
    this.choices.update(c => ({ ...c, [path]: { choice: picked.choice, from: 'yours', columns: picked.columns } }));
    this.closePicker(path);
  }

  closePicker(path: string): void {
    this.editing.set(null);
    queueMicrotask(() => (Array.from(this.host.querySelectorAll('[data-field-trigger]'))
      .find(e => e.getAttribute('data-field-trigger') === path) as HTMLElement | undefined)?.focus());
  }

  useSuggestion(m: FieldMatch): void {
    if (!m.suggestion) return;
    const columns: Record<string, string> = {};
    for (const c of m.columns) if (c.source) columns[c.column] = c.source;
    this.choices.update(c => ({ ...c, [m.field.path]: { choice: m.suggestion as Choice, from: 'yours', columns } }));
  }

  /** "Show me": the fields that need a person, the first one's button in focus. */
  showMe(): void {
    this.filter.set('all');
    queueMicrotask(() => {
      const box = this.host.querySelector('[data-needs]') as HTMLElement | null;
      box?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      (box?.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
    });
  }

  goNext(): void {
    if (this.needs().length || !this.inspect()) return;
    this.next.emit();
  }
}
