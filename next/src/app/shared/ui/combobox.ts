import { Component, ElementRef, computed, effect, forwardRef, input, output, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from './icon';

/** A pre-shaped row -- the caller maps its own data to this before handing it to the box, so
 *  the box itself only ever deals in plain strings, never accessor functions. (Angular's
 *  current template compiler mishandles a component input bound directly to a function-typed
 *  class property -- "Expected i18n meta to be a Message, but got: Function" -- so this shape
 *  is a deliberate way around that, not just a style choice.) */
export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * A type-to-filter dropdown for a `formControlName` that a plain `<select>` doesn't scale to --
 * a pipeline, task-type or lookup list that can run into the hundreds is unusable as a native
 * dropdown nobody can search. Drops in exactly where a `<select>` did: `[formControlName]` plus
 * a `[options]` array already shaped as `{value, label, hint?}`.
 */
@Component({
  selector: 'app-combobox',
  imports: [Icon],
  template: `
    <div class="relative">
      <input #inputEl [id]="id()" class="input pr-7" type="text" role="combobox"
             aria-autocomplete="list" [attr.aria-expanded]="open()" autocomplete="off"
             [value]="displayValue()" [placeholder]="placeholder()" [disabled]="disabled()"
             (focus)="onFocus()" (blur)="onBlur()"
             (input)="onInput($any($event.target).value)" (keydown)="onKeydown($event)" />
      @if (value() && !disabled()) {
        <button type="button" tabindex="-1"
                class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                aria-label="Clear" (mousedown)="onClear($event)">
          <app-icon name="close" size="0.8em" />
        </button>
      }
      @if (open()) {
        <div class="card absolute left-0 right-0 top-full mt-1 z-20 max-h-64 overflow-y-auto p-1 shadow-lg" role="listbox">
          @if (allowClear()) {
            <button type="button" role="option" class="menu-item"
                    [style.background]="highlighted() === -1 ? 'var(--surface-sunken)' : null"
                    (mousedown)="selectClear($event)">
              {{ clearLabel() }}
            </button>
          }
          @if (!filtered().length) {
            <div class="px-3 py-2 text-sm text-[color:var(--text-muted)]">
              @if (searching()) { Searching… }
              @else if (remote() && !query().trim()) { Type to search }
              @else { No matches }
            </div>
          }
          @for (opt of filtered(); track opt.value; let i = $index) {
            <button type="button" role="option" class="menu-item"
                    [style.background]="i === highlighted() ? 'var(--surface-sunken)' : null"
                    [title]="opt.hint || ''"
                    (mousedown)="selectOption(opt, $event)">
              {{ opt.label }}
            </button>
          }
          @if (remote() && filtered().length && filtered().length >= remoteCap()) {
            <div class="px-3 py-1.5 text-xs text-[color:var(--text-muted)]">First {{ remoteCap() }} — type more to narrow</div>
          }
        </div>
      }
    </div>
  `,
  // The caller writes id="taskType" on the host so its label's `for` finds the box, but the
  // same string is bound onto the inner <input>; without this the page carried two elements
  // with one id and the label pointed at the unfocusable host.
  host: { '[attr.id]': 'null' },
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => Combobox),
    multi: true,
  }],
})
export class Combobox implements ControlValueAccessor {
  readonly id = input<string>('');
  readonly placeholder = input('Type to search…');
  readonly options = input<ComboboxOption[]>([]);
  /** Whether an explicit "no value" row shows at the top of the list. */
  readonly allowClear = input(true);
  readonly clearLabel = input('None');

  /**
   * Hand the control a number rather than a string. Ids -- a topic, a task, a tenant -- are
   * numbers everywhere else in the form and its payload; a box that quietly turned them into
   * strings made `p.sourceTaskTypeId === topicId` false and the payload's ids quoted.
   */
  readonly numeric = input(false);

  /**
   * For a box that is not inside a form -- a list's filter bound to a signal. `selected` sets
   * the value; `selectedChange` reports a pick (as a string, '' for cleared). A form-bound box
   * ignores both and talks to its control.
   */
  readonly selected = input<string | number | null | undefined>(undefined);
  readonly selectedChange = output<string>();

  /**
   * A box over a list too long to hand over whole -- ten thousand topics -- asks for rows as
   * the person types. In remote mode the box does no filtering of its own: it emits `search`
   * with the typed text (debounced, and once with '' on focus so a list appears before any
   * typing) and shows whatever `options` the caller sets in answer, "Searching…" while
   * `searching` is on. `selectedLabel` names a value the current options do not include --
   * the row the box was opened with, before any search -- so it never shows a bare id.
   * The caller keeps that label current; it is not resolved here.
   */
  readonly remote = input(false);
  readonly searching = input(false);
  readonly selectedLabel = input('');
  /** How many rows the caller asks for; at that many, the list says there may be more. */
  readonly remoteCap = input(50);
  readonly search = output<string>();
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const v = this.selected();
      if (v === undefined) return;
      this.value.set(v == null ? '' : String(v));
      if (!this.open()) this.query.set(this.labelForValue());
    });
  }

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputEl');

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly query = signal('');
  readonly highlighted = signal(-1);

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  /** What the option list narrows to once accounting for the label AND the hint text. */
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const opts = this.options();
    if (!q || this.remote()) return opts;
    return opts.filter(o =>
      o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q));
  });

  /** The box shows the live filter text while open, and the resolved label once closed. */
  readonly displayValue = computed(() => this.open() ? this.query() : this.labelForValue());

  private labelForValue(): string {
    const v = this.value();
    if (!v) return '';
    const match = this.options().find(o => o.value === v);
    if (match) return match.label;
    return this.selectedLabel() || v;
  }

  /** Remote mode: ask the caller for rows, a beat after the last keystroke. */
  private askRemote(text: string, immediate = false): void {
    if (!this.remote()) return;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (immediate) { this.search.emit(text); return; }
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.search.emit(text); }, 250);
  }

  writeValue(v: string | number | null): void {
    this.value.set(v == null ? '' : String(v));
    if (!this.open()) this.query.set(this.labelForValue());
  }

  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  onFocus(): void {
    this.open.set(true);
    this.query.set(this.labelForValue());
    this.highlighted.set(-1);
    // Select-all so typing immediately replaces the current label rather than appending to it --
    // the same feel as clicking into a browser address bar with a page already loaded.
    queueMicrotask(() => this.inputRef()?.nativeElement.select());
    // The label is selected, so the first keystroke replaces it: the list that opens now is
    // the unfiltered first page, not "rows matching the current label".
    this.askRemote('', true);
  }

  onInput(text: string): void {
    this.query.set(text);
    this.open.set(true);
    this.highlighted.set(this.filtered().length ? 0 : -1);
    this.askRemote(text);
  }

  onBlur(): void {
    // A mousedown on an option already committed the selection and closed the panel (see
    // selectOption/selectClear) before blur has a chance to fire, so this only runs for a real
    // blur -- Tab away, click outside -- where the right move is to close and discard whatever
    // was mid-typed, reverting the box to match the control's actual value.
    this.open.set(false);
    this.query.set(this.labelForValue());
    this.onTouched();
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.filtered().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open.set(true);
      if (count) this.highlighted.set((this.highlighted() + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.open.set(true);
      if (count) this.highlighted.set((this.highlighted() - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const i = this.highlighted();
      if (i >= 0 && i < count) this.commit(this.filtered()[i].value);
      else if (count === 1) this.commit(this.filtered()[0].value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.open.set(false);
      this.query.set(this.labelForValue());
      this.inputRef()?.nativeElement.blur();
    }
  }

  selectOption(opt: ComboboxOption, event: Event): void {
    event.preventDefault();
    this.commit(opt.value);
  }

  selectClear(event: Event): void {
    event.preventDefault();
    this.commit('');
  }

  onClear(event: Event): void {
    event.preventDefault();
    this.commit('');
    this.inputRef()?.nativeElement.focus();
  }

  private commit(v: string): void {
    this.value.set(v);
    this.query.set(this.labelForValue());
    this.open.set(false);
    if (this.numeric()) this.onChange((v === '' ? null : Number(v)) as any);
    else this.onChange(v);
    this.selectedChange.emit(v);
    this.onTouched();
  }
}
