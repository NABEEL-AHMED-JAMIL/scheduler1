import { AfterViewInit, Component, ElementRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';
import { Icon } from '../../../shared/ui/icon';
import { SchemaField } from '../report-studio.model';
import { collections, itemFields, sampleText, scalars, valueAt } from '../designer/designer-model';
import { Choice, ColumnMatch, FieldMatch, HOW_WORDS, Part, combined, matchColumns, normal, score } from './auto-match';

type Tab = 'column' | 'combine' | 'fixed' | 'list';

/** What a person chose for a field: the choice, and for a list its columns ({column: item field}). */
export interface Picked { choice: Choice; columns: Record<string, string>; }

/** A type in a word, as a column list shows it. */
export function typeWord(type: string): string {
  return ({ string: 'text', integer: 'whole number', number: 'number', boolean: 'yes/no', date: 'date', datetime: 'date and time', array: 'list',
    object: 'group', null: 'empty' } as Record<string, string>)[type] ?? type;
}

/**
 * Choosing one field's source (Report data and mapping, owner 2026-10-27, drawing 3): A column -- searchable, each with
 * its type, the first row's value and how well it matches -- or columns combined with text between them, the result on
 * the first row shown, or a fixed value printed on every report. A list picks the data's list and each of its columns. An
 * optional field may be left blank; a required one may not. The choice is kept with the report, so the next Generate again
 * starts from it.
 */
@Component({
  selector: 'app-rs-field-picker',
  imports: [FormsModule, AdvancedSelect, Icon],
  templateUrl: './field-picker.html',
  styleUrl: './field-picker.css',
  host: { role: 'dialog', '[attr.aria-label]': '"Choose a source for " + match().field.label', '(keydown.escape)': 'onEscape($event)' },
})
export class FieldPicker implements OnInit, AfterViewInit {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  readonly match = input.required<FieldMatch>();
  readonly schema = input.required<SchemaField[]>();
  readonly record = input<unknown>(undefined);
  readonly chosen = output<Picked>();
  readonly cancelled = output<void>();

  readonly tab = signal<Tab>('column');
  readonly column = signal('');
  readonly parts = signal<Part[]>([]);
  readonly fixed = signal('');
  readonly text = signal(' ');
  readonly list = signal('');
  readonly columnChoices = signal<Record<string, string>>({});

  readonly field = computed(() => this.match().field);
  readonly isList = computed(() => this.field().list && !this.field().rootRow);
  readonly tabs = computed<{ id: Tab; label: string }[]>(() => {
    if (this.isList()) return [{ id: 'list', label: 'A list' }];
    if (this.field().rootRow) return [{ id: 'column', label: 'A column' }];
    return [{ id: 'column', label: 'A column' }, { id: 'combine', label: 'Combine columns' }, { id: 'fixed', label: 'A fixed value' }];
  });

  /** The data's single values, each with its type, the first row's value and a hint of how well it matches. */
  readonly columnOptions = computed<AdvancedOption[]>(() => {
    const f = this.field();
    const join = this.combinedText();
    const hints = new Map(this.match().candidates.map(c => [c.path, c]));
    return scalars(this.schema()).map((c): AdvancedOption => {
      const v = valueAt(this.record(), c.path);
      const sample = sampleText(v);
      const known = hints.get(c.path);
      const s = known ?? { ...score(f, c), path: c.path };
      const same = !!join && sample === join && this.parts().length > 1;
      const badge = same ? 'Same value as the combination' : s.score >= 85 ? HOW_WORDS[s.how] : s.score >= 60 ? 'Similar name' : undefined;
      return { value: c.path, label: c.path, mono: true, description: typeWord(c.type), sample, badge, badgeTone: s.score >= 85 || same ? 'info' : 'neutral' };
    }).sort((a, b) => Number(!!b.badge) - Number(!!a.badge));
  });

  readonly addOptions = computed<AdvancedOption[]>(() => scalars(this.schema()).map(c => ({ value: c.path, label: c.path, mono: true,
    description: typeWord(c.type), sample: sampleText(valueAt(this.record(), c.path)) })));

  readonly listOptions = computed<AdvancedOption[]>(() => {
    const f = this.field();
    return collections(this.schema()).map((c): AdvancedOption => {
      const v = valueAt(this.record(), c.path);
      const items = new Set(itemFields(this.schema(), c.path).map(i => normal(i.path)));
      const has = f.columns.filter(col => items.has(normal(col))).length;
      return { value: c.path, label: c.path, mono: true, description: `${itemFields(this.schema(), c.path).length} columns`,
        sample: Array.isArray(v) ? `${v.length} row${v.length === 1 ? '' : 's'}` : undefined,
        badge: f.columns.length ? `${has} of ${f.columns.length} columns` : undefined, badgeTone: f.columns.length && has === f.columns.length ? 'ok' : 'neutral' };
    });
  });

  /** The chosen list's columns, each matched (the person's choices first). */
  readonly listColumns = computed<ColumnMatch[]>(() => matchColumns(this.field(), this.list() || null, this.schema(), this.record(), this.columnChoices()));
  readonly itemOptions = computed<AdvancedOption[]>(() => {
    const first = (() => { const v = valueAt(this.record(), this.list()); return Array.isArray(v) ? v[0] : undefined; })();
    return itemFields(this.schema(), this.list()).map(i => ({ value: i.path, label: i.path, mono: true, description: typeWord(i.type),
      sample: sampleText(valueAt(first, i.path)) }));
  });

  readonly combinedText = computed(() => combined(this.parts(), this.record()));
  readonly canUse = computed(() => {
    switch (this.tab()) {
      case 'column': return !!this.column();
      case 'combine': return this.parts().some(p => 'path' in p);
      case 'fixed': return this.fixed().trim().length > 0;
      case 'list': return !!this.list();
    }
  });
  readonly note = computed(() => (this.field().required
    ? "Required: it can't be left blank. The choice is saved with this report, so the next Generate again keeps it."
    : 'Optional: it may be left blank (it prints the template\'s empty text). The choice is saved with this report.'));

  ngOnInit(): void {
    const m = this.match();
    const start = m.choice.kind !== 'none' ? m.choice : m.suggestion ?? { kind: 'none' as const };
    if (this.isList()) {
      this.tab.set('list');
      this.list.set(start.kind === 'column' ? start.path : '');
      const cols: Record<string, string> = {};
      for (const c of m.columns) if (c.source) cols[c.column] = c.source;
      this.columnChoices.set(cols);
      return;
    }
    switch (start.kind) {
      case 'column': this.tab.set('column'); this.column.set(start.path); break;
      case 'combine': this.tab.set(this.field().rootRow ? 'column' : 'combine'); this.parts.set([...start.parts]); break;
      case 'fixed': this.tab.set('fixed'); this.fixed.set(start.value); break;
      default: this.tab.set('column');
    }
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => (this.host.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement | null)?.focus());
  }

  onTabKey(e: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    const to = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : -1;
    if (to < 0) return;
    e.preventDefault();
    this.tab.set(tabs[to].id);
    queueMicrotask(() => (this.host.querySelectorAll('[role="tab"]')[to] as HTMLElement | undefined)?.focus());
  }

  /** The "+ Add a column" box goes back to its placeholder after each pick. */
  readonly adding = signal('');

  addColumn(path: string): void {
    if (!path) return;
    this.parts.update(p => (p.length && 'path' in p[p.length - 1] ? [...p, { text: ' ' }, { path }] : [...p, { path }]));
    this.adding.set(path);
    queueMicrotask(() => this.adding.set(''));
  }

  addText(): void {
    const t = this.text();
    if (!t) return;
    this.parts.update(p => [...p, { text: t }]);
  }

  removePart(i: number): void {
    this.parts.update(p => p.filter((_, at) => at !== i));
  }

  isColumn(p: Part): boolean {
    return 'path' in p;
  }

  partLabel(p: Part): string {
    if ('path' in p) return p.path;
    return p.text === ' ' ? 'space' : p.text === ', ' ? 'comma' : `“${p.text}”`;
  }

  partSample(p: Part): string {
    return 'path' in p ? sampleText(valueAt(this.record(), p.path)) : '';
  }

  setColumn(column: string, source: string): void {
    this.columnChoices.update(c => {
      const next = { ...c };
      if (source) next[column] = source; else delete next[column];
      return next;
    });
  }

  use(): void {
    if (!this.canUse()) return;
    switch (this.tab()) {
      case 'column': this.chosen.emit({ choice: { kind: 'column', path: this.column() }, columns: {} }); break;
      case 'combine': this.chosen.emit({ choice: { kind: 'combine', parts: this.parts() }, columns: {} }); break;
      case 'fixed': this.chosen.emit({ choice: { kind: 'fixed', value: this.fixed() }, columns: {} }); break;
      case 'list': {
        const cols: Record<string, string> = {};
        for (const c of this.listColumns()) if (c.source) cols[c.column] = c.source;
        this.chosen.emit({ choice: { kind: 'column', path: this.list() }, columns: cols });
        break;
      }
    }
  }

  blank(): void {
    if (this.field().required) return;
    this.chosen.emit({ choice: { kind: 'blank' }, columns: {} });
  }

  onEscape(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.cancelled.emit();
  }
}
