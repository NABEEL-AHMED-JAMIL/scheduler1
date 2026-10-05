import { Component, effect, forwardRef, input, output, signal, untracked } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0'));

/** "7:5" or "07:05:00" -> "07:05"; anything else -> "". */
export function normaliseTime(value: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{1,2})/.exec((value ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * A time of day on the 24-hour clock, everywhere (owner, 2026-09-28). The browser's own time input draws itself in the
 * computer's locale -- "02:00 AM" beside a summary saying "02:00" (UI review U3) -- so this is two selects, hour and
 * minute, whose value is "HH:mm". Works as a form control or with [value] / (valueChange).
 */
@Component({
  selector: 'app-time-field',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeField), multi: true }],
  host: { class: 'time-field' },
  template: `
    <select class="input" [id]="inputId()" [attr.aria-label]="label() + ', hour'" [disabled]="disabled() || inactive()"
            (change)="pick($any($event.target).value, minute())">
      @if (!hour()) { <option value="" selected>—</option> }
      @for (h of hours; track h) { <option [value]="h" [selected]="h === hour()">{{ h }}</option> }
    </select>
    <span class="time-field-sep" aria-hidden="true">:</span>
    <select class="input" [attr.aria-label]="label() + ', minute'" [disabled]="disabled() || inactive()"
            (change)="pick(hour() || '00', $any($event.target).value)">
      @if (!minute()) { <option value="" selected>—</option> }
      @for (m of minutes; track m) { <option [value]="m" [selected]="m === minute()">{{ m }}</option> }
    </select>
    @if (clearable() && hour() && !disabled() && !inactive()) {
      <button type="button" class="btn btn-ghost btn-xs" [attr.aria-label]="'Clear ' + label()" (click)="clear()">Clear</button>
    }
  `,
})
export class TimeField implements ControlValueAccessor {
  readonly inputId = input('');
  /** The field's name, for the two selects' accessible names. */
  readonly label = input('Time');
  readonly clearable = input(false);
  /** Off without a form control (a disabled form renderer). */
  readonly inactive = input(false);
  readonly value = input<string | null | undefined>(undefined);
  readonly valueChange = output<string>();

  readonly hours = HOURS;
  readonly minutes = MINUTES;
  readonly hour = signal('');
  readonly minute = signal('');
  readonly disabled = signal(false);

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    effect(() => {
      const v = this.value();
      if (v !== undefined) untracked(() => this.writeValue(v ?? ''));
    });
  }

  pick(hour: string, minute: string): void {
    const h = hour || '00';
    const m = minute || '00';
    this.hour.set(h);
    this.minute.set(m);
    const v = `${h}:${m}`;
    this.onChange(v);
    this.onTouched();
    this.valueChange.emit(v);
  }

  clear(): void {
    this.hour.set('');
    this.minute.set('');
    this.onChange('');
    this.onTouched();
    this.valueChange.emit('');
  }

  writeValue(value: string | null): void {
    const v = normaliseTime(value);
    this.hour.set(v ? v.slice(0, 2) : '');
    this.minute.set(v ? v.slice(3, 5) : '');
  }

  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled.set(disabled); }
}
