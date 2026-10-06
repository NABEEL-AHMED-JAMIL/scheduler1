import { Component, ElementRef, computed, effect, forwardRef, input, output, signal, untracked, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Icon } from './icon';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-05" -> "5 Oct 2026" (the console's 'date' format), with no time zone in between; "" when not a date. */
export function dayText(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? '').trim());
  if (!m) return '';
  const month = Number(m[2]);
  if (month < 1 || month > 12) return '';
  return `${Number(m[3])} ${MONTHS[month - 1]} ${m[1]}`;
}

/**
 * A calendar day, shown as the rest of the console writes it ("5 Oct 2026") rather than in the computer's locale
 * ("10/05/2026", UI review U3). The browser's own calendar still picks it: the button opens the native date input's
 * picker. The value is "yyyy-MM-dd". Works as a form control or with [value] / (valueChange).
 */
@Component({
  selector: 'app-date-field',
  imports: [Icon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true }],
  host: { class: 'date-field' },
  template: `
    <button type="button" class="input date-field-button" [id]="inputId()" [disabled]="disabled() || inactive()"
            [attr.aria-label]="label() + ': ' + (shown() || 'none picked')" (click)="open()">
      <app-icon name="calendar" size="0.95em" class="icon-muted" />
      <span [class.text-[color:var(--text-muted)]]="!shown()">{{ shown() || placeholder() }}</span>
    </button>
    <input #native type="date" class="date-field-native" tabindex="-1" aria-hidden="true" [value]="day()"
           [attr.min]="min() || null" [attr.max]="max() || null" (change)="pick($any($event.target).value)" />
    @if (clearable() && day() && !disabled() && !inactive()) {
      <button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-label]="'Clear ' + label()" (click)="pick('')">
        <app-icon name="close" size="0.85em" />
      </button>
    }
  `,
})
export class DateField implements ControlValueAccessor {
  readonly inputId = input('');
  readonly label = input('Date');
  readonly placeholder = input('Pick a date');
  readonly min = input<string | null | undefined>(null);
  readonly max = input<string | null | undefined>(null);
  readonly clearable = input(false);
  /** Off without a form control (a disabled form renderer). */
  readonly inactive = input(false);
  readonly value = input<string | null | undefined>(undefined);
  readonly valueChange = output<string>();

  private readonly native = viewChild<ElementRef<HTMLInputElement>>('native');
  readonly day = signal('');
  readonly disabled = signal(false);
  readonly shown = computed(() => dayText(this.day()));

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // [value] follows the page: a "Last 7 days" that resets the range redraws the field.
    effect(() => {
      const v = this.value();
      if (v !== undefined) untracked(() => this.day.set((v ?? '').slice(0, 10)));
    });
  }

  open(): void {
    const el = this.native()?.nativeElement;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  pick(value: string): void {
    this.day.set(value);
    this.onChange(value);
    this.onTouched();
    this.valueChange.emit(value);
  }

  writeValue(value: string | null): void { this.day.set((value ?? '').slice(0, 10)); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled.set(disabled); }
}
