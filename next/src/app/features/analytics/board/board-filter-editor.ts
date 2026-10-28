import { Component, computed, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CHART_SLOTS } from '../../../shared/charts/status-color';
import { BoardApi } from './board-api';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { AnalyticsService, DatasetColumn } from '../analytics.service';
import { isDateType, isNumericType } from '../filter-builder';
import type { RangePreset } from '../../../shared/ui/date-range';
import { BoardFilterDef, FilterFamily, MAX_BOARD_FILTERS } from './board-filters';
import { BOARD_PRESETS } from './board-filter-bar';
import { InlineStatus, loadErrorText } from '../../../shared/ui/loading';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';

/** A dataset the board's tiles read: where a filter's values may come from. */
export interface FilterSourceOption { connection: string; path: string; label: string }

export interface BoardFilterEditorData {
  defs: BoardFilterDef[];
  sources: FilterSourceOption[];
}

/** One filter as the panel edits it: the definition's fields as plain strings. */
interface Draft {
  key: string;
  label: string;
  kind: 'values' | 'date';
  source: string;
  column: string;
  aliases: string;
  family?: FilterFamily;
  defaultPreset: RangePreset;
}

const PRESET_WORDS: Record<string, string> = { '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months', ytd: 'This year', all: 'All time' };

/** The family a column's DuckDB type belongs to. */
export function familyOfType(type: string | undefined): FilterFamily {
  if (isDateType(type)) return 'date';
  if (isNumericType(type)) return 'number';
  if (/^BOOL/i.test(type ?? '')) return 'boolean';
  return 'text';
}

/** A filter key from its label: "Admission source" -> "admission_source". */
export function keyOf(label: string, taken: ReadonlySet<string>): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'filter';
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  return key;
}

/**
 * "Edit filters": what a board's bar offers. Each filter is a label, a dataset and a column -- its values are that
 * column's -- and, for a filter that should also land on files where the same idea has another name, those names. A
 * date filter names the date columns it lands on and the range the board opens on.
 *
 * The definitions are saved on the board (dashboard_config), so every reader gets the same bar; what a reader CHOOSES
 * is theirs, in the URL and their own storage.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-board-filter-editor',
  imports: [SidePanel, Icon, InlineStatus, AdvancedSelect],
  template: `
    <app-side-panel heading="Edit filters" subtitle="What this board's filter bar offers every reader">
      <div class="flex flex-col gap-3 min-w-0" data-test="bf-editor">
        @for (draft of drafts(); track $index; let i = $index) {
          <div role="group" class="card p-4 flex flex-col gap-2 min-w-0" [attr.aria-label]="draft.label || ('Filter ' + (i + 1))">
            <div class="flex items-center gap-2">
              <input class="input flex-1 min-w-0" [attr.aria-label]="'Filter ' + (i + 1) + ' label'" placeholder="Label, e.g. Department"
                     [value]="draft.label" (input)="patch(i, { label: $any($event.target).value })" />
              <select class="input w-auto" [attr.aria-label]="'Filter ' + (i + 1) + ' kind'" [value]="draft.kind" (change)="patch(i, { kind: $any($event.target).value })">
                <option value="values" [selected]="draft.kind === 'values'">Values</option>
                <option value="date" [selected]="draft.kind === 'date'" [disabled]="hasDate() && draft.kind !== 'date'">Date range</option>
              </select>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Remove filter ' + (draft.label || i + 1)" (click)="remove(i)"><app-icon name="trash" /></button>
            </div>
            <div class="grid grid-cols-2 gap-2 min-w-0">
              <app-advanced-select class="min-w-0" [ariaLabel]="'Filter ' + (i + 1) + ' dataset'" [options]="rowPicks()[i]?.sources ?? []"
                                   [value]="draft.source" (valueChange)="pickSource(i, $event)" placeholder="Dataset…"
                                   searchLabel="Search the datasets" emptyText="No tile of this board reads a dataset yet." panelWidth="24rem" />
              <!-- Owner 2026-10-27: a filter's saved column stays shown while its dataset's columns load (it looked lost). -->
              <app-advanced-select class="min-w-0" [ariaLabel]="'Filter ' + (i + 1) + ' column'" [options]="rowPicks()[i]?.columns ?? []"
                                   [value]="draft.column" (valueChange)="pickColumn(i, $event)" [disabled]="!draft.source" placeholder="Column…"
                                   searchLabel="Search the columns" [loading]="columnsLoading(draft)" loadingText="Loading columns…"
                                   unknownText="Not a column of this dataset" panelWidth="22rem"
                                   [emptyText]="draft.kind === 'date' ? 'This dataset has no date column.' : 'This dataset has no columns.'" />
            </div>
            @if (draft.source) {
              <app-inline-status [loading]="columnsLoading(draft)" [error]="columnsError(draft)"
                                 [empty]="!columnsLoading(draft) && !columnsError(draft) && !columnsFor(draft).length && schemaRead(draft)"
                                 label="Loading the dataset's columns…" emptyText="This dataset has no columns." (retry)="retryColumns(draft.source)" />
            }
            <input class="input min-w-0" [attr.aria-label]="'Filter ' + (i + 1) + ' other column names'" placeholder="Also lands on columns named… (comma separated)"
                   [value]="draft.aliases" (input)="patch(i, { aliases: $any($event.target).value })" />
            @if (draft.kind === 'date') {
              <label class="flex items-center gap-2 text-sm"><span class="text-[color:var(--text-secondary)]">Opens on</span>
                <select class="input w-auto" (change)="patch(i, { defaultPreset: $any($event.target).value })">
                  @for (p of presets; track p) { <option [value]="p" [selected]="p === draft.defaultPreset">{{ presetWords[p] }}</option> }
                </select>
              </label>
            }
          </div>
        } @empty {
          <p class="text-sm text-[color:var(--text-secondary)]">No filters yet. A filter narrows every tile whose data has its column, and the tiles that cannot take it say so.</p>
        }
        <div class="flex gap-2">
          <button type="button" class="btn btn-default btn-sm" [disabled]="drafts().length >= max" (click)="add('values')"><app-icon name="plus" />Add a filter</button>
          @if (!hasDate()) { <button type="button" class="btn btn-default btn-sm" (click)="add('date')"><app-icon name="calendar" />Add a date range</button> }
        </div>
        @if (error()) { <p class="text-sm text-crit-500">{{ error() }}</p> }
      </div>
      <div foot class="flex w-full gap-2 justify-end">
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" data-test="bf-editor-save" [disabled]="saving()" (click)="save()"><app-icon name="check" [busy]="saving()" />Save filters</button>
      </div>
    </app-side-panel>
  `,
})
export class BoardFilterEditor {
  readonly data = inject<BoardFilterEditorData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<BoardFilterDef[]>>(DialogRef);
  private readonly analytics = inject(AnalyticsService);
  private readonly api = inject(BoardApi);
  readonly saving = signal(false);

  readonly max = MAX_BOARD_FILTERS;
  readonly presets = BOARD_PRESETS;
  readonly presetWords = PRESET_WORDS;
  readonly familyOf = familyOfType;
  readonly drafts = signal<Draft[]>(this.data.defs.map(def => ({
    key: def.key, label: def.label, kind: def.kind,
    source: def.source ? def.source.connection + '\u0000' + def.source.path : '',
    column: def.source?.column ?? def.columns[0] ?? '',
    aliases: def.columns.filter(c => c !== (def.source?.column ?? def.columns[0])).join(', '),
    family: def.family, defaultPreset: def.defaultPreset ?? 'all',
  })));
  readonly error = signal('');
  private readonly schemas = signal<Record<string, DatasetColumn[]>>({});
  /** Each dataset's column read: loading, or why it failed (it failed silently, leaving only "Column…"). */
  private readonly schemaLoading = signal<Record<string, boolean>>({});
  private readonly schemaErrors = signal<Record<string, string>>({});

  /** The board's datasets, by name with where each is under it. */
  private readonly sourceOptions: AdvancedOption[] = this.data.sources.map(source => ({
    value: this.sourceKey(source), label: source.label, description: source.path !== source.label ? source.path : undefined, keywords: source.connection }));
  /**
   * Each filter's two pickers, by row: the datasets (a saved one the board's tiles no longer read kept and marked), and its
   * dataset's columns with their types -- a date range only the date ones; the saved column kept while they load.
   */
  readonly rowPicks = computed<{ sources: AdvancedOption[]; columns: AdvancedOption[] }[]>(() => this.drafts().map(draft => {
    const sources = draft.source && !this.sourceOptions.some(o => o.value === draft.source)
      ? [...this.sourceOptions, { value: draft.source, label: draft.source.slice(draft.source.indexOf('\u0000') + 1), mono: true,
          description: 'Not a dataset this board\'s tiles read', badge: 'Not found', badgeTone: 'warn' as const }]
      : this.sourceOptions;
    const columns: AdvancedOption[] = this.columnsFor(draft)
      .filter(column => draft.kind !== 'date' || familyOfType(column.type) === 'date')
      .map(column => ({ value: column.name, label: column.name, mono: true, sample: column.type, keywords: column.type }));
    if (this.columnsLoading(draft) && draft.column && !columns.some(o => o.value === draft.column)) columns.push({ value: draft.column, label: draft.column, mono: true });
    return { sources, columns };
  }));

  constructor() {
    for (const draft of this.drafts()) if (draft.source) this.loadColumns(draft.source);
  }

  sourceKey(source: FilterSourceOption): string { return source.connection + '\u0000' + source.path; }
  hasDate(): boolean { return this.drafts().some(d => d.kind === 'date'); }
  columnsFor(draft: Draft): DatasetColumn[] { return this.schemas()[draft.source] ?? []; }
  columnsLoading(draft: Draft): boolean { return !!this.schemaLoading()[draft.source]; }
  columnsError(draft: Draft): string { return this.schemaErrors()[draft.source] ?? ''; }
  schemaRead(draft: Draft): boolean { return !!this.schemas()[draft.source]; }
  retryColumns(key: string): void { this.loadColumns(key); }

  patch(at: number, change: Partial<Draft>): void {
    this.drafts.update(list => list.map((d, i) => i === at ? { ...d, ...change } : d));
  }

  add(kind: 'values' | 'date'): void {
    this.drafts.update(list => [...list, { key: '', label: kind === 'date' ? 'Date' : '', kind, source: '', column: '', aliases: '', defaultPreset: 'all' }]);
  }

  remove(at: number): void {
    this.drafts.update(list => list.filter((_, i) => i !== at));
  }

  pickSource(at: number, key: string): void {
    this.patch(at, { source: key, column: '' });
    if (key) this.loadColumns(key);
  }

  pickColumn(at: number, column: string): void {
    const draft = this.drafts()[at];
    const type = this.columnsFor(draft).find(c => c.name === column)?.type;
    const label = draft.label || column.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    this.patch(at, { column, family: familyOfType(type), label });
  }

  private loadColumns(key: string): void {
    if (this.schemas()[key] || this.schemaLoading()[key]) return;
    const cut = key.indexOf('\u0000');
    const set = (loading: boolean, error: string) => {
      this.schemaLoading.update(all => ({ ...all, [key]: loading }));
      this.schemaErrors.update(all => ({ ...all, [key]: error }));
    };
    set(true, '');
    this.analytics.schema(key.slice(0, cut), key.slice(cut + 1)).subscribe({
      next: response => {
        if (response.status === API_SUCCESS && response.data) {
          this.schemas.update(all => ({ ...all, [key]: response.data!.columns ?? [] }));
          set(false, '');
        } else {
          set(false, loadErrorText(response, 'The dataset\'s columns could not be read.'));
        }
      },
      error: err => set(false, loadErrorText(err, 'The dataset\'s columns could not be read.')),
    });
  }

  save(): void {
    const taken = new Set<string>();
    const defs: BoardFilterDef[] = [];
    for (const draft of this.drafts()) {
      const aliases = draft.aliases.split(',').map(a => a.trim()).filter(Boolean);
      const columns = [...new Set([draft.column, ...aliases].filter(Boolean))];
      if (!draft.label.trim() || !columns.length) {
        this.error.set('Every filter needs a label and a column.');
        return;
      }
      const key = draft.key && !taken.has(draft.key) ? draft.key : keyOf(draft.label, taken);
      taken.add(key);
      const def: BoardFilterDef = { key, label: draft.label.trim(), kind: draft.kind, columns };
      if (draft.kind === 'values') {
        if (draft.family) def.family = draft.family;
        if (draft.source && draft.column) {
          const cut = draft.source.indexOf('\u0000');
          def.source = { connection: draft.source.slice(0, cut), path: draft.source.slice(cut + 1), column: draft.column };
        }
      } else if (draft.defaultPreset !== 'all') {
        def.defaultPreset = draft.defaultPreset;
      }
      defs.push(def);
    }
    // Each values filter keeps its column's most frequent values in order: they take the board's colours, one each,
    // on every tile (charts/board-colors.ts), and do not move as the data does.
    const ordered = defs.filter(def => def.kind === 'values' && def.source);
    if (!ordered.length) { this.ref.close(defs); return; }
    this.saving.set(true);
    forkJoin(ordered.map(def => this.api.values(def.source!.connection, def.source!.path, def.source!.column, '', CHART_SLOTS)
      .pipe(catchError(() => of(null))))).subscribe(answers => {
      answers.forEach((answer, i) => {
        const values = answer?.status === API_SUCCESS ? (answer.data?.values ?? []).map(v => v.value) : [];
        if (values.length) ordered[i].colorOrder = values;
      });
      this.saving.set(false);
      this.ref.close(defs);
    });
  }
}
