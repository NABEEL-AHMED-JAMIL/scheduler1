import {
  Component, DestroyRef, ElementRef, computed, effect, forwardRef, inject, input, model, output, signal, untracked, viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from './icon';

/** A badge's tone: the console's pill tones. */
export type AdvancedTone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';

/**
 * One choice of an advanced select, already shaped by the caller (plain strings only -- see combobox.ts for why a
 * function-typed input is avoided): a name, and optionally a line of description, a sample of what it holds, a badge, the
 * group it sits under, words it is also found by, and whether it can be chosen.
 */
export interface AdvancedOption {
  value: string;
  label: string;
  /** A second line under the name ("Last run, today 14:02 · 1 row · 71 columns"). */
  description?: string;
  /** What it holds, set in monospace on the right ("Ambrose", "2 rows"). */
  sample?: string;
  /** A short mark on the right ("Fits 79 of 83", "Same value"), in a pill of its tone. */
  badge?: string;
  badgeTone?: AdvancedTone;
  /** A heading the option sits under; consecutive options of one group share it. */
  group?: string;
  /** More words the search matches (an id, a key, a type). */
  keywords?: string;
  /** The name is a key or a column (monospace). */
  mono?: boolean;
  disabled?: boolean;
}

/** A row of the drawn list: a group's heading (its label) or an option (with its index among the options). */
export interface Row { kind: 'group' | 'option'; key: string; label: string; option: AdvancedOption | null; index: number; }

/** Past this many rows only those in view are drawn. */
export const VIRTUAL_AT = 60;
/** Rows drawn above and below the visible ones while virtualised. */
const OVERSCAN = 6;
/** Rows a Page Up or Page Down moves. */
const PAGE = 8;

/** The options a search keeps: a name that matches comes before one only its other words match, inside each group. */
export function filterOptions(options: AdvancedOption[], query: string): AdvancedOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const words = q.split(/\s+/);
  const groups: string[] = [];
  return options
    .map((o, i) => {
      const name = o.label.toLowerCase();
      const rest = [o.description, o.sample, o.keywords, o.group, o.value].filter(Boolean).join(' ').toLowerCase();
      const named = words.every(w => name.includes(w));
      const found = named || words.every(w => name.includes(w) || rest.includes(w));
      return { o, i, named, found };
    })
    .filter(x => x.found)
    .map(x => { const g = x.o.group ?? ''; if (!groups.includes(g)) groups.push(g); return x; })
    .sort((a, b) => groups.indexOf(a.o.group ?? '') - groups.indexOf(b.o.group ?? '') || Number(!a.named) - Number(!b.named) || a.i - b.i)
    .map(x => x.o);
}

/** The drawn rows: each group's heading before its first option. */
export function rowsOf(options: AdvancedOption[]): Row[] {
  const out: Row[] = [];
  let last: string | undefined;
  options.forEach((option, index) => {
    if (option.group && option.group !== last) out.push({ kind: 'group', label: option.group, key: 'g:' + option.group + ':' + index, option: null, index: -1 });
    last = option.group;
    out.push({ kind: 'option', option, index, key: 'o:' + option.value, label: option.label });
  });
  return out;
}

/**
 * The console's advanced select (owner 2026-10-27, "all select should be advance"): a combobox for a choice from a list a
 * native select does not serve -- pipelines, runs, columns of a source, people, templates. A search box narrows the list
 * as one types (by name first, then by description, sample and keywords); each option may carry a description, a sample
 * and a badge, and options sit under their groups. It follows the ARIA combobox pattern: the search box is the combobox,
 * it names the listbox and the option the arrow keys are on (aria-activedescendant), and a polite status says how many
 * options are shown. Arrow keys, Home and End, Page Up and Page Down move; Enter picks; Escape closes and gives focus back.
 * A loading list says so, an empty one says why, and past {@link VIRTUAL_AT} rows only those in view are drawn, so a
 * thousand options cost what twenty do.
 *
 * Two forms: a button that opens a panel (the default -- it shows the choice with its description and sample), or
 * `inline`, the search and list always shown in the page (a pipeline picker). Bound as `[(value)]` or as a form control.
 */
@Component({
  selector: 'app-advanced-select',
  imports: [Icon],
  template: `
    <div class="adv" [class.adv-inline]="inline()">
      @if (!inline()) {
        <button #trigger type="button" class="adv-trigger" [id]="id() || null" [disabled]="isDisabled()"
                aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-controls]="open() ? listId : null"
                [attr.aria-label]="ariaLabel() ? ariaLabel() + (chosen() ? ': ' + chosen()!.label : '') : null"
                [attr.aria-labelledby]="labelledBy() || null" [attr.aria-invalid]="invalid() || null"
                [class.is-invalid]="invalid()" (click)="toggle()" (keydown)="onTriggerKey($event)">
          @if (chosen(); as c) {
            <span class="adv-trigger-main">
              <span class="adv-name" [class.mono]="c.mono">{{ c.label }}</span>
              @if (c.sample) { <span class="adv-sample">{{ c.sample }}</span> }
            </span>
            @if (showDescription() && c.description) { <span class="adv-trigger-desc">{{ c.description }}</span> }
          } @else {
            <span class="adv-placeholder">{{ placeholder() }}</span>
          }
          <app-icon name="chevronDown" class="adv-chevron" />
        </button>
      }
      @if (open() || inline()) {
        <div class="adv-panel" [class.adv-pop]="!inline()" [style.width]="inline() ? null : panelWidth()" (mousedown)="keepFocus($event)">
          <div class="adv-search">
            <app-icon name="search" class="adv-search-icon" />
            <input #search type="text" class="adv-search-input" role="combobox" aria-autocomplete="list" autocomplete="off"
                   [attr.aria-expanded]="true" [attr.aria-controls]="listId" [attr.aria-activedescendant]="activeId()"
                   [attr.aria-label]="searchLabel()" [placeholder]="searchPlaceholder()" [value]="query()" [disabled]="isDisabled()"
                   (input)="onSearch($any($event.target).value)" (keydown)="onKey($event)" (blur)="onBlur($event)" />
            <span class="adv-count" aria-hidden="true">{{ countText() }}</span>
          </div>
          <div #list class="adv-list" role="listbox" [id]="listId" [attr.aria-label]="ariaLabel() || searchLabel()"
               [attr.aria-busy]="loading() || null" [style.max-height.px]="maxHeightPx()" (scroll)="onScroll($any($event.target).scrollTop)">
            @if (allowClear() && !query().trim() && !loading()) {
              <div role="option" class="adv-option adv-clear" [id]="listId + '-clear'" [attr.aria-selected]="!value()"
                   [class.is-active]="active() === -1" (mousedown)="pickClear($event)">{{ clearLabel() }}</div>
            }
            @if (loading()) {
              <div class="adv-state" role="status"><span class="spinner adv-spinner" aria-hidden="true"></span>{{ loadingText() }}</div>
            } @else if (!filtered().length) {
              <div class="adv-state">{{ query().trim() ? noMatchText() : emptyText() }}</div>
            } @else {
              @if (virtual()) { <div aria-hidden="true" [style.height.px]="padTop()"></div> }
              @for (r of windowRows(); track r.key) {
                @if (r.option; as o) {
                  <div role="option" class="adv-option" [id]="optionId(r.index)" [attr.aria-selected]="o.value === value()"
                       [attr.aria-disabled]="o.disabled ? 'true' : null" [class.is-active]="r.index === active()"
                       [class.is-chosen]="o.value === value()" [class.is-disabled]="o.disabled"
                       [class.adv-two]="twoLine()" (mousedown)="pick(o, $event)" (mousemove)="hover(r.index)">
                    <span class="adv-option-main">
                      <span class="adv-name" [class.mono]="o.mono">{{ o.label }}</span>
                      @if (o.description) { <span class="adv-desc">{{ o.description }}</span> }
                    </span>
                    @if (o.sample) { <span class="adv-sample">{{ o.sample }}</span> }
                    @if (o.badge) { <span class="pill adv-badge" [class]="'pill-' + (o.badgeTone || 'neutral')">{{ o.badge }}</span> }
                    @if (o.value === value()) { <app-icon name="check" class="adv-check" /> }
                  </div>
                } @else {
                  <div role="presentation" class="adv-group">{{ r.label }}</div>
                }
              }
              @if (virtual()) { <div aria-hidden="true" [style.height.px]="padBottom()"></div> }
            }
          </div>
          <span class="sr-only" role="status" aria-live="polite">{{ liveText() }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .adv { position: relative; min-width: 0; }
    .adv-trigger { display: flex; flex-direction: column; justify-content: center; gap: 0.125rem; width: 100%; min-height: 2.25rem;
      padding: 0.375rem 2rem 0.375rem 0.625rem; position: relative; text-align: left; background: var(--surface-raised);
      border: 1px solid var(--border-control); border-radius: var(--radius-md); color: var(--text-primary); font-size: 0.8125rem; }
    .adv-trigger:hover:not(:disabled) { border-color: var(--border-strong); }
    .adv-trigger:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
    .adv-trigger:disabled { opacity: 0.6; cursor: not-allowed; }
    .adv-trigger.is-invalid { border-color: var(--crit-text); }
    .adv-trigger-main { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
    .adv-trigger-desc { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .adv-placeholder { color: var(--text-muted); }
    .adv-chevron { position: absolute; right: 0.625rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
    .adv-panel { display: flex; flex-direction: column; background: var(--surface-raised); border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg); overflow: hidden; min-width: 0; }
    .adv-pop { position: absolute; z-index: 40; top: calc(100% + 0.25rem); left: 0; min-width: 100%; max-width: min(40rem, 92vw);
      box-shadow: 0 12px 32px color-mix(in oklab, var(--shadow-color) 16%, transparent); }
    .adv-search { display: flex; align-items: center; gap: 0.5rem; padding: 0 0.625rem; min-height: 2.375rem; border-bottom: 1px solid var(--border-subtle); }
    .adv-search-icon { color: var(--text-muted); flex-shrink: 0; }
    .adv-search-input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 0.8125rem;
      color: var(--text-primary); padding: 0.5rem 0; }
    .adv-count { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
    .adv-list { overflow-y: auto; padding: 0.25rem; }
    .adv-group { display: flex; align-items: flex-end; height: 2.25rem; padding: 0 0.5rem 0.375rem; font-size: 0.6875rem; font-weight: 600;
      letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); box-sizing: border-box; }
    .adv-option { display: flex; align-items: center; gap: 0.625rem; height: 2.25rem; padding: 0 0.5rem; border-radius: var(--radius-md);
      font-size: 0.8125rem; color: var(--text-primary); cursor: pointer; box-sizing: border-box; }
    .adv-option.adv-two { height: 3.25rem; }
    .adv-option.is-active { background: var(--surface-sunken); }
    .adv-option.is-chosen { background: var(--row-selected-bg); }
    .adv-option.is-chosen.is-active { background: var(--accent-soft); }
    .adv-option.is-disabled { opacity: 0.5; cursor: not-allowed; }
    .adv-clear { color: var(--text-secondary); }
    .adv-option-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .adv-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
    .adv-desc { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .adv-sample { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; max-width: 45%; }
    .adv-badge { flex-shrink: 0; white-space: nowrap; }
    .adv-check { color: var(--accent-text); flex-shrink: 0; }
    .adv-state { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 0.5rem; font-size: 0.8125rem; color: var(--text-muted); }
    .adv-spinner { --spinner-size: 1rem; }
  `,
  host: { '[attr.id]': 'null' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AdvancedSelect), multi: true }],
})
export class AdvancedSelect implements ControlValueAccessor {
  private static next = 0;
  readonly listId = `adv-list-${++AdvancedSelect.next}`;
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  readonly options = input<AdvancedOption[]>([]);
  /** The chosen option's value; '' for none. */
  readonly value = model<string>('');
  /** The id a `<label for>` points at (put on the button). */
  readonly id = input('');
  /** The name when no label names it (also the listbox's name). */
  readonly ariaLabel = input('');
  readonly labelledBy = input('');
  readonly placeholder = input('Choose…');
  readonly searchPlaceholder = input('Search');
  /** The search box's name, said by a screen reader ("Search pipelines"). */
  readonly searchLabel = input('Search the options');
  readonly emptyText = input('Nothing to choose from.');
  readonly noMatchText = input('Nothing matches the search.');
  readonly loadingText = input('Loading…');
  readonly loading = input(false);
  /** The search and the list shown in the page, not behind a button. */
  readonly inline = input(false);
  /** A "none" row at the top. */
  readonly allowClear = input(false);
  readonly clearLabel = input('None');
  /** The trigger shows the chosen option's description under its name. */
  readonly showDescription = input(true);
  readonly invalid = input(false);
  /** The panel's width (a CSS length); at least the trigger's. */
  readonly panelWidth = input<string | null>(null);
  /** How many rows the list shows before it scrolls. */
  readonly visibleRows = input(8);
  readonly disabled = input(false);
  /** A pick (also on the value). */
  readonly picked = output<AdvancedOption | null>();
  /** The search as typed (a caller that works out more about the options in view -- a pipeline's fit -- listens). */
  readonly searched = output<string>();

  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchRef = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly listRef = viewChild<ElementRef<HTMLElement>>('list');

  readonly open = signal(false);
  readonly query = signal('');
  readonly active = signal(-1);
  readonly scrollTop = signal(0);
  private readonly formDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  readonly filtered = computed(() => filterOptions(this.options(), this.query()));
  readonly rows = computed(() => rowsOf(this.filtered()));
  readonly chosen = computed(() => this.options().find(o => o.value === this.value()) ?? null);
  readonly twoLine = computed(() => this.options().some(o => !!o.description));
  readonly rowPx = computed(() => (this.twoLine() ? 52 : 36));
  readonly maxHeightPx = computed(() => this.rowPx() * this.visibleRows() + 8);
  readonly virtual = computed(() => this.rows().length > VIRTUAL_AT);
  private readonly firstRow = computed(() => (this.virtual() ? Math.max(0, Math.floor(this.scrollTop() / this.rowPx()) - OVERSCAN) : 0));
  private readonly lastRow = computed(() => (this.virtual()
    ? Math.min(this.rows().length, Math.ceil((this.scrollTop() + this.maxHeightPx()) / this.rowPx()) + OVERSCAN) : this.rows().length));
  readonly windowRows = computed(() => this.rows().slice(this.firstRow(), this.lastRow()));
  readonly padTop = computed(() => this.firstRow() * this.rowPx());
  readonly padBottom = computed(() => (this.rows().length - this.lastRow()) * this.rowPx());
  readonly activeId = computed(() => {
    const i = this.active();
    if (i === -1) return this.allowClear() && !this.query().trim() ? this.listId + '-clear' : null;
    return i >= 0 && i < this.filtered().length ? this.optionId(i) : null;
  });
  readonly countText = computed(() => {
    const all = this.options().length;
    const shown = this.filtered().length;
    return this.loading() ? '' : shown === all ? `${all}` : `${shown} of ${all}`;
  });
  readonly liveText = computed(() => {
    if (this.loading()) return this.loadingText();
    const n = this.filtered().length;
    return n === 0 ? (this.query().trim() ? this.noMatchText() : this.emptyText()) : `${n} option${n === 1 ? '' : 's'}`;
  });

  constructor() {
    // A click outside closes the panel, as a native select does.
    const outside = (e: MouseEvent) => { if (this.open() && !this.host.contains(e.target as Node)) this.close(false); };
    document.addEventListener('mousedown', outside, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('mousedown', outside, true));
    // The chosen option is where the arrow keys start in an inline list.
    effect(() => {
      const opts = this.filtered();
      const v = this.value();
      untracked(() => {
        if (this.active() >= opts.length) this.active.set(opts.length ? 0 : -1);
        if (this.inline() && this.active() < 0) this.active.set(opts.findIndex(o => o.value === v));
      });
    });
  }

  optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  // ---------------------------------------------------------------- opening and closing

  toggle(): void {
    if (this.open()) this.close(true); else this.openPanel();
  }

  openPanel(seed = ''): void {
    if (this.isDisabled()) return;
    this.query.set(seed);
    this.open.set(true);
    const at = this.filtered().findIndex(o => o.value === this.value());
    this.active.set(seed ? (this.filtered().length ? 0 : -1) : at);
    this.scrollTop.set(0);
    queueMicrotask(() => {
      this.searchRef()?.nativeElement.focus();
      this.reveal(this.active());
    });
  }

  close(focusTrigger: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.query.set('');
    this.onTouched();
    if (focusTrigger) queueMicrotask(() => this.triggerRef()?.nativeElement.focus());
  }

  /** A press inside the panel keeps focus in the search box, so blur does not close it before the pick lands. */
  keepFocus(e: MouseEvent): void {
    if (e.target !== this.searchRef()?.nativeElement) e.preventDefault();
  }

  onBlur(e: FocusEvent): void {
    if (this.inline()) { this.onTouched(); return; }
    const to = e.relatedTarget as Node | null;
    if (to && this.host.contains(to)) return;
    this.close(false);
  }

  onTriggerKey(e: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      this.openPanel();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.openPanel(e.key);
    }
  }

  // ---------------------------------------------------------------- searching and moving

  onSearch(text: string): void {
    this.query.set(text);
    this.searched.emit(text);
    this.active.set(this.filtered().length ? 0 : -1);
    this.scrollTop.set(0);
    const list = this.listRef()?.nativeElement;
    if (list) list.scrollTop = 0;
  }

  onScroll(top: number): void {
    this.scrollTop.set(top);
  }

  hover(index: number): void {
    if (this.active() !== index) this.active.set(index);
  }

  onKey(e: KeyboardEvent): void {
    const n = this.filtered().length;
    const move = (to: number) => { e.preventDefault(); if (!n) return; this.active.set(this.skip(to, to >= this.active() ? 1 : -1)); this.reveal(this.active()); };
    switch (e.key) {
      case 'ArrowDown': move(this.active() < 0 ? 0 : Math.min(n - 1, this.active() + 1)); break;
      case 'ArrowUp': move(Math.max(0, this.active() - 1)); break;
      case 'Home': move(0); break;
      case 'End': move(n - 1); break;
      case 'PageDown': move(Math.min(n - 1, Math.max(0, this.active()) + PAGE)); break;
      case 'PageUp': move(Math.max(0, this.active() - PAGE)); break;
      case 'Enter': {
        e.preventDefault();
        const i = this.active();
        if (i === -1 && this.allowClear() && !this.query().trim()) { this.commit(''); break; }
        const o = this.filtered()[i] ?? (n === 1 ? this.filtered()[0] : undefined);
        if (o && !o.disabled) this.commit(o.value);
        break;
      }
      case 'Escape':
        if (!this.inline() && this.open()) { e.preventDefault(); e.stopPropagation(); this.close(true); }
        else if (this.query()) { e.preventDefault(); this.onSearch(''); }
        break;
      case 'Tab':
        if (!this.inline()) this.close(false);
        break;
    }
  }

  /** The nearest option from `to` in `direction` that can be chosen; `to` itself when none can. */
  private skip(to: number, direction: 1 | -1): number {
    const rows = this.filtered();
    for (let i = to; i >= 0 && i < rows.length; i += direction) if (!rows[i].disabled) return i;
    for (let i = to; i >= 0 && i < rows.length; i -= direction) if (!rows[i].disabled) return i;
    return to;
  }

  /** Scrolls the list so an option is in view (virtualised rows are found by their place, not their element). */
  private reveal(index: number): void {
    const list = this.listRef()?.nativeElement;
    if (!list || index < 0) return;
    const at = this.rows().findIndex(r => r.option !== null && r.index === index);
    if (at < 0) return;
    const clear = this.allowClear() && !this.query().trim() ? this.rowPx() : 0;
    const top = clear + at * this.rowPx();
    const view = list.clientHeight || this.maxHeightPx();
    let next = this.scrollTop();
    if (top < next) next = top;
    else if (top + this.rowPx() > next + view) next = top + this.rowPx() - view;
    list.scrollTop = next;
    this.scrollTop.set(next);
  }

  // ---------------------------------------------------------------- picking

  pick(o: AdvancedOption, e: Event): void {
    e.preventDefault();
    if (o.disabled) return;
    this.commit(o.value);
  }

  pickClear(e: Event): void {
    e.preventDefault();
    this.commit('');
  }

  private commit(v: string): void {
    this.value.set(v);
    this.onChange(v);
    this.picked.emit(this.options().find(o => o.value === v) ?? null);
    if (!this.inline()) this.close(true);
    else { this.onTouched(); this.active.set(this.filtered().findIndex(o => o.value === v)); }
  }

  // ---------------------------------------------------------------- forms

  writeValue(v: string | number | null): void {
    this.value.set(v == null ? '' : String(v));
  }

  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.formDisabled.set(disabled); }
}
