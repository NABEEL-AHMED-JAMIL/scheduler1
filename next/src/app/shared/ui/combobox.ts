import { Component, ElementRef, computed, forwardRef, input, signal, viewChild } from '@angular/core';
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
            <div class="px-3 py-2 text-sm text-[color:var(--text-muted)]">No matches</div>
          }
          @for (opt of filtered(); track opt.value; let i = $index) {
            <button type="button" role="option" class="menu-item"
                    [style.background]="i === highlighted() ? 'var(--surface-sunken)' : null"
                    [title]="opt.hint || ''"
                    (mousedown)="selectOption(opt, $event)">
              {{ opt.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
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
    if (!q) return opts;
    return opts.filter(o =>
      o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q));
  });

  /** The box shows the live filter text while open, and the resolved label once closed. */
  readonly displayValue = computed(() => this.open() ? this.query() : this.labelForValue());

  private labelForValue(): string {
    const v = this.value();
    if (!v) return '';
    const match = this.options().find(o => o.value === v);
    return match ? match.label : v;
  }

  writeValue(v: string | null): void {
    this.value.set(v ?? '');
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
  }

  onInput(text: string): void {
    this.query.set(text);
    this.open.set(true);
    this.highlighted.set(this.filtered().length ? 0 : -1);
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
    this.onChange(v);
    this.onTouched();
  }
}
