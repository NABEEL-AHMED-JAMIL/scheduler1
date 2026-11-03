import { Component, computed, input, output, signal, effect, untracked } from '@angular/core';
import { DateField } from '../../../shared/ui/date-field';

/**
 * When a photo was taken -- the person's word, as the camera's own date-time is removed on upload: the day from the console's
 * date field ("23 Oct 2026") and the time on the 24-hour clock ("10:12"). The value is "yyyy-MM-ddTHH:mm", the wall clock.
 */
@Component({
  selector: 'app-taken-field',
  imports: [DateField],
  styles: `
    :host { display: flex; gap: 0.5rem; align-items: center; }
    app-date-field { flex: 1 1 auto; min-width: 0; }
    .tf-time { width: 5.5rem; flex: none; font-variant-numeric: tabular-nums; }
  `,
  template: `
    <app-date-field [inputId]="inputId()" label="Taken" [value]="day()" [max]="maxDay()" (valueChange)="setDay($event)" />
    <input class="input tf-time" inputmode="numeric" placeholder="HH:mm" aria-label="Time taken, 24-hour" [value]="time()"
           (input)="setTime($any($event.target).value)" [class.input-invalid]="!timeOk()" data-test="taken-time" />
  `,
})
export class TakenField {
  readonly inputId = input('');
  readonly value = input('');
  readonly max = input('');
  readonly valueChange = output<string>();

  readonly day = signal('');
  readonly time = signal('');
  readonly maxDay = computed(() => this.max().slice(0, 10));
  readonly timeOk = computed(() => !this.time() || /^([01]?\d|2[0-3]):[0-5]\d$/.test(this.time()));

  constructor() {
    effect(() => {
      const v = this.value();
      untracked(() => { this.day.set(v.slice(0, 10)); this.time.set(v.slice(11, 16)); });
    });
  }

  setDay(day: string): void {
    this.day.set(day);
    this.emit();
  }

  setTime(time: string): void {
    this.time.set(time.trim());
    this.emit();
  }

  private emit(): void {
    if (!this.day() || !this.timeOk()) return;
    const [h, m] = (this.time() || '00:00').split(':');
    this.valueChange.emit(`${this.day()}T${h.padStart(2, '0')}:${m}`);
  }
}
