import { Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { DateField, dayText } from './date-field';
import { Icon } from './icon';
import { localIsoDay } from './local-day';

/**
 * A range's preset: the rolling ones follow the clock, Custom keeps its two days. 'all' is no range at all (both days
 * empty): a dashboard over years of data opens on everything (showcase boards, 2026-10-12).
 */
export type RangePreset = 'today' | '7d' | '30d' | 'month' | '90d' | '12m' | 'ytd' | 'all' | 'custom';

/** A range as a page reads it: two calendar days, "yyyy-MM-dd", both included. */
export interface DateRange { from: string; to: string; preset: RangePreset; }

const LABELS: Record<RangePreset, string> = {
  today: 'Today', '7d': '7 days', '30d': '30 days', month: 'This month', '90d': '90 days', '12m': '12 months', ytd: 'This year',
  all: 'All time', custom: 'Custom',
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The two days a preset stands for on `today` (the reader's own calendar). Custom answers today alone. */
export function presetRange(preset: RangePreset, today: Date = new Date()): { from: string; to: string } {
  const to = localIsoDay(today);
  const back = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return localIsoDay(d); };
  switch (preset) {
    case '7d': return { from: back(6), to };
    case '30d': return { from: back(29), to };
    case 'month': return { from: to.slice(0, 8) + '01', to };
    case '90d': return { from: back(89), to };
    case '12m': { const d = new Date(today); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1); return { from: localIsoDay(d), to }; }
    case 'ytd': return { from: to.slice(0, 5) + '01-01', to };
    case 'all': return { from: '', to: '' };
    default: return { from: to, to };
  }
}

/**
 * "6 Oct – 12 Oct 2026": a range as a subtitle says it -- the year once when both days share it, one day alone when
 * they are the same day. Empty when either is not a day.
 */
export function rangeText(from: string, to: string): string {
  const a = dayText(from), b = dayText(to);
  if (!a || !b) return '';
  if (from === to) return a;
  return from.slice(0, 4) === to.slice(0, 4) ? `${a.slice(0, -5)} – ${b}` : `${a} – ${b}`;
}

/** The storage key of one screen's range for one viewer: each person keeps their own choice. */
export function rangeKey(screen: string, viewer: string | number | null | undefined): string {
  return `etl.range.${screen}.${viewer ?? 'anon'}`;
}

/**
 * The range a screen opens on: the viewer's last choice for it (a rolling preset is read against today, so "7 days"
 * stays the last seven), else `fallback`. Storage that is refused or holds rubbish gives the fallback.
 */
export function restoreRange(key: string | null | undefined, fallback: RangePreset = '7d', today: Date = new Date()): DateRange {
  const preset = (p: RangePreset): DateRange => ({ ...presetRange(p, today), preset: p });
  if (!key) return preset(fallback);
  let saved: Partial<DateRange> | null = null;
  try { saved = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { saved = null; }
  if (!saved || typeof saved !== 'object' || !saved.preset || !(saved.preset in LABELS)) return preset(fallback);
  if (saved.preset !== 'custom') return preset(saved.preset);
  return ISO.test(saved.from ?? '') && ISO.test(saved.to ?? '') && saved.from! <= saved.to!
    ? { from: saved.from!, to: saved.to!, preset: 'custom' } : preset(fallback);
}

/** Remembers a choice under `key`; a refused storage only means it is not remembered. */
export function saveRange(key: string | null | undefined, range: DateRange): void {
  if (!key) return;
  const value = range.preset === 'custom' ? range : { preset: range.preset };
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not remembered */ }
}

/**
 * Owner 2026-10-12 / UX review B1 (D3): ONE date-range control for every page that filters by date.
 *
 *   [Today | 7 days | 30 days | This month | Custom ▾]
 *
 * One segmented control, the header's 28 px, one baseline. A preset applies the moment it is chosen (no Apply button);
 * Custom opens a small popover with the From and To fields (their labels inside it, not floating above the header) and
 * applies on its own button. The page shows the range in its subtitle (`rangeText`). With `storageKey` the choice is
 * remembered per viewer (`rangeKey`), and the page opens on it through `restoreRange`.
 */
@Component({
  selector: 'app-date-range',
  imports: [DateField, Icon],
  host: { class: 'date-range' },
  styles: `
    :host { position: relative; display: inline-flex; align-items: center; }
    .date-range-pop {
      position: absolute; top: calc(100% + 0.375rem); right: 0; z-index: 40; width: max-content; min-width: 20rem;
      display: flex; flex-direction: column; gap: 0.75rem; padding: 0.875rem; text-align: left;
    }
    .date-range-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .date-range-fields .date-field-button { min-width: 0; width: 100%; }
    .date-range-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  `,
  template: `
    <div class="seg" role="group" [attr.aria-label]="label()">
      @for (p of presetsShown(); track p) {
        <button type="button" class="seg-btn" [class.seg-on]="value().preset === p" [attr.aria-pressed]="value().preset === p"
                [attr.data-preset]="p" (click)="choose(p)">{{ labels[p] }}</button>
      }
      @if (custom()) {
        <button type="button" class="seg-btn" data-preset="custom" [class.seg-on]="value().preset === 'custom'"
                [attr.aria-pressed]="value().preset === 'custom'" aria-haspopup="dialog" [attr.aria-expanded]="open()"
                (click)="toggle()">
          {{ value().preset === 'custom' ? customText() : 'Custom' }}
          <app-icon name="chevronDown" size="0.85em" />
        </button>
      }
    </div>
    @if (open()) {
      <div class="card shadow-xl date-range-pop" role="dialog" aria-label="Custom date range" (keydown.escape)="close()">
        <div class="date-range-fields">
          <div>
            <label class="label" [attr.for]="id + '-from'">From</label>
            <app-date-field [inputId]="id + '-from'" label="From" [value]="draftFrom()" [max]="draftTo() || maxDay()" [min]="minDay()"
                            (valueChange)="draftFrom.set($event)" />
          </div>
          <div>
            <label class="label" [attr.for]="id + '-to'">To</label>
            <app-date-field [inputId]="id + '-to'" label="To" [value]="draftTo()" [min]="draftFrom() || minDay()" [max]="maxDay()"
                            (valueChange)="draftTo.set($event)" />
          </div>
        </div>
        @if (draftError()) { <p class="field-note text-crit-500" role="alert">{{ draftError() }}</p> }
        <div class="date-range-actions">
          <button type="button" class="btn btn-default btn-sm" (click)="close()">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="!!draftError()" (click)="applyCustom()">Show this range</button>
        </div>
      </div>
    }
  `,
})
export class DateRangePicker {
  private static seq = 0;
  readonly id = `date-range-${++DateRangePicker.seq}`;
  readonly labels = LABELS;
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;

  /** The range shown; the page owns it and sets it from (rangeChange). */
  readonly value = input.required<DateRange>();
  /** The presets offered, in order (Custom is `custom`). */
  readonly presets = input<RangePreset[]>(['today', '7d', '30d', 'month']);
  readonly custom = input(true);
  /** Remembers the choice under this key (build it with rangeKey(screen, viewer)). */
  readonly storageKey = input<string | null>(null);
  /** The earliest and latest day Custom may pick (a page whose data only goes so far back). */
  readonly minDay = input<string | null>(null);
  readonly maxDay = input<string | null>(null);
  /** The longest custom range, in days (a server that refuses wider ones); none when 0. */
  readonly maxSpanDays = input(0);
  readonly label = input('Date range');
  readonly rangeChange = output<DateRange>();

  readonly presetsShown = computed(() => this.presets().filter(p => p !== 'custom'));
  readonly open = signal(false);
  readonly draftFrom = signal('');
  readonly draftTo = signal('');
  readonly customText = computed(() => rangeText(this.value().from, this.value().to) || 'Custom');
  readonly draftError = computed(() => {
    const from = this.draftFrom(), to = this.draftTo();
    if (!ISO.test(from) || !ISO.test(to)) return 'Pick a day in both fields.';
    if (from > to) return 'From must be on or before To.';
    const span = this.maxSpanDays();
    if (span > 0 && (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > span) return `Pick at most ${span} days.`;
    return '';
  });

  choose(preset: Exclude<RangePreset, 'custom'>): void {
    this.open.set(false);
    this.emit({ ...presetRange(preset), preset });
  }

  toggle(): void {
    if (this.open()) { this.close(); return; }
    this.draftFrom.set(this.value().from);
    this.draftTo.set(this.value().to);
    this.open.set(true);
  }

  close(): void { this.open.set(false); }

  applyCustom(): void {
    if (this.draftError()) return;
    this.open.set(false);
    this.emit({ from: this.draftFrom(), to: this.draftTo(), preset: 'custom' });
  }

  private emit(range: DateRange): void {
    saveRange(this.storageKey(), range);
    this.rangeChange.emit(range);
  }

  /** A click outside closes the popover (the native calendar's own clicks land on the hidden input inside it). */
  @HostListener('document:mousedown', ['$event'])
  onDocument(event: MouseEvent): void {
    if (this.open() && event.target instanceof Node && !this.host.contains(event.target)) this.open.set(false);
  }
}
