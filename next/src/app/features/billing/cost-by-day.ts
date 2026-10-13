import { Component, LOCALE_ID, computed, inject, input, model } from '@angular/core';
import { formatDate } from '@angular/common';
import { CdkMenu, CdkMenuTrigger } from '@angular/cdk/menu';
import { EChart, EChartClick } from '../../shared/charts/echart/echart';
import { ChartThemes } from '../../shared/charts/echart/chart-themes';
import { CONSOLE_THEME } from '../../shared/charts/echart/echart-theme';
import { Icon } from '../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { formatMoney } from './billing-format';
import {
  CostDay, CostView, costByDayOption, dayOfClick, monthDays, orderServices, previousCumulative, roundsToZero, serviceCssColor,
} from './cost-by-day-model';

const VIEW_KEY = 'billing.costByDay.view';

function storedView(): CostView {
  try { return localStorage.getItem(VIEW_KEY) === 'cumulative' ? 'cumulative' : 'daily'; } catch { return 'daily'; }
}

/**
 * Cost by day (owner review 2026-10-12): every billing day of the month on a money axis -- the quiet days as zero, the days
 * still to come as the forecast's dashed outline -- stacked by service in the colours the By service table uses, or as the
 * month's running total against its forecast and last month's. Hovering a day shows its breakdown; clicking one picks it
 * (`selected`), which the page uses to show that day's lines. Drawn with the console's ECharts engine, loaded lazily.
 *
 * The figures are the meter's daily lines, before the month's allowances and tiers: the Month to date tile is after them.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-cost-by-day',
  imports: [EChart, Icon, Segmented, CdkMenu, CdkMenuTrigger],
  host: { class: 'flex flex-col min-w-0 h-full' },
  styles: `
    .cbd-swatch { display: inline-block; width: 0.625rem; height: 0.625rem; border-radius: var(--radius-sm); }
    .cbd-swatch.is-forecast { border: 1px dashed var(--text-muted); }
    .cbd-line { display: inline-block; width: 1rem; border-top: 2px solid var(--text-primary); }
    .cbd-line.is-dashed { border-top-style: dashed; }
    .cbd-line.is-muted { border-top-color: var(--text-muted); }
    /* The tooltip: HTML ECharts writes into the chart's box (cost-by-day-model.ts), styled here, never inline. */
    :host ::ng-deep .cbd-tip-head { font-weight: 600; margin-bottom: 0.25rem; }
    :host ::ng-deep .cbd-tip-row { display: flex; justify-content: space-between; gap: 1rem; }
    :host ::ng-deep .cbd-tip-row.is-strong { font-weight: 600; }
    :host ::ng-deep .cbd-tip-num { font-variant-numeric: tabular-nums; }
    :host ::ng-deep .cbd-tip-muted { color: var(--text-muted); }
    :host ::ng-deep .cbd-tip-total { border-top: 1px solid var(--border-subtle); margin-top: 0.25rem; padding-top: 0.25rem; }
    :host ::ng-deep .cbd-tip-note { color: var(--text-muted); margin-top: 0.25rem; font-size: 11px; }
  `,
  template: `
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="min-w-0 mr-auto">
        <h2 class="font-semibold text-sm flex items-center gap-2">Cost by day
          <button type="button" class="rules-chip" [cdkMenuTriggerFor]="aboutPanel" aria-haspopup="dialog" data-test="cost-by-day-info"
                  aria-label="About these figures">
            <app-icon name="info" size="0.95em" class="shrink-0" /><span>Before allowances</span>
          </button>
        </h2>
        <p class="text-xs text-[color:var(--text-muted)] truncate" data-test="cost-by-day-subtitle">{{ subtitle() }}</p>
      </div>
      <app-segmented ariaLabel="Cost by day view" [options]="views" [value]="view()" (valueChange)="setView($event)" data-test="cost-by-day-view" />
    </div>
    <ng-template #aboutPanel>
      <div cdkMenu class="card shadow-xl p-4 w-80 text-xs space-y-2" role="dialog" aria-label="About Cost by day">
        <p class="font-semibold text-sm">What the bars add up to</p>
        <p>Each day's usage at the rate card's prices, <b>before the month's allowances and tiers</b>. The days add up to
          {{ money(barsTotal()) }}.</p>
        <p><b>Month to date</b> ({{ money(monthToDate()) }}) is after them — the figure the month's invoice lists.</p>
        <p class="text-[color:var(--text-muted)]">Days are counted in {{ timeZone() || "the workspace's billing time zone" }}. Measured
          items (storage kept, seats, topics) land on the night they were measured.</p>
      </div>
    </ng-template>

    @if (empty()) {
      <div class="flex-1 grid place-items-center text-sm text-[color:var(--text-muted)] py-10" data-test="cost-by-day-empty">Nothing metered in this month yet.</div>
    } @else {
      <app-echart class="flex-1 mt-2" [option]="option()" [theme]="theme().ref" [height]="height()" (clicked)="pick($event)"
                  [label]="'Cost by day, ' + monthLabel()" data-test="cost-by-day-chart" />
    }

    <ul class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-[color:var(--text-secondary)]" aria-label="Legend" data-test="cost-by-day-legend">
      @if (view() === 'daily') {
        @for (s of legend(); track s.service) {
          <li class="flex items-center gap-1.5" [class.opacity-50]="s.zero" [attr.data-zero]="s.zero ? 'true' : null"
              [title]="s.zero ? s.service + ': under a cent this month' : s.service + ': ' + money(s.amount) + ' this month'">
            <span class="cbd-swatch" [style.background]="s.color"></span>{{ s.service }}
          </li>
        }
        @if (hasFuture() && pace() !== null) {
          <li class="flex items-center gap-1.5"><span class="cbd-swatch is-forecast"></span>Forecast pace</li>
        }
      } @else {
        <li class="flex items-center gap-1.5"><span class="cbd-line"></span>This month</li>
        @if (hasFuture() && pace() !== null) {
          <li class="flex items-center gap-1.5"><span class="cbd-line is-dashed"></span>Forecast</li>
        }
        @if (previousLine()) {
          <li class="flex items-center gap-1.5"><span class="cbd-line is-muted"></span>{{ previousLabel() }}</li>
        }
      }
      <li class="ml-auto text-[color:var(--text-muted)]">Click a day for its lines</li>
    </ul>
  `,
})
export class CostByDay {
  private readonly locale = inject(LOCALE_ID);
  private readonly themes = inject(ChartThemes);

  /** The month on screen, as its first day (yyyy-MM-01). */
  readonly month = input.required<string>();
  /** The workspace's today (yyyy-MM-dd, its billing zone); days after it are still to come. Null for a closed month's read. */
  readonly today = input<string | null>(null);
  readonly days = input<CostDay[]>([]);
  /** Last month's days, for the cumulative comparison; null or empty when it had none. */
  readonly previousDays = input<CostDay[] | null>(null);
  readonly previousLabel = input('Last month');
  /** The forecast's daily pace -- the Month to date tile's; null for a closed month. */
  readonly pace = input<number | null>(null);
  readonly monthToDate = input(0);
  readonly currency = input('USD');
  readonly timeZone = input<string | null>(null);
  readonly monthLabel = input('');
  readonly height = input(300);
  /** The picked day (yyyy-MM-dd), or null. */
  readonly selected = model<string | null>(null);
  readonly view = model<CostView>(storedView());

  readonly views: SegmentOption<CostView>[] = [{ id: 'daily', label: 'Daily' }, { id: 'cumulative', label: 'Cumulative' }];

  readonly theme = computed(() => this.themes.resolve(CONSOLE_THEME));
  readonly monthDays = computed(() => monthDays(this.month(), this.days(), this.today()));
  readonly hasFuture = computed(() => this.monthDays().some(d => d.future));
  readonly barsTotal = computed(() => this.monthDays().reduce((n, d) => n + d.amount, 0));
  readonly empty = computed(() => !this.days().length);
  /** The services drawn, with their month's total before allowances; under a cent is greyed in the legend. */
  readonly legend = computed(() => {
    const totals = new Map<string, number>();
    for (const d of this.monthDays()) for (const [s, v] of Object.entries(d.byService)) totals.set(s, (totals.get(s) ?? 0) + v);
    return orderServices(totals.keys()).map(service => ({
      service, amount: totals.get(service) ?? 0, zero: roundsToZero(totals.get(service) ?? 0), color: serviceCssColor(service),
    }));
  });
  readonly previousLine = computed(() => {
    const previous = this.previousDays();
    if (!previous?.length) return null;
    const first = this.month();
    const [y, m] = first.split('-').map(Number);
    const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-01`;
    return previousCumulative(previous, prev, this.monthDays().length);
  });
  readonly subtitle = computed(() => this.view() === 'daily'
    ? `Each day by service${this.timeZone() ? `, days in ${this.timeZone()}` : ''}`
    : `The month's running total${this.hasFuture() ? ', the forecast to month end' : ''}${this.previousLine() ? ' and ' + this.previousLabel() : ''}`);

  readonly option = computed(() => costByDayOption({
    view: this.view(),
    days: this.monthDays(),
    services: this.legend().map(s => s.service),
    pace: this.hasFuture() ? this.pace() : null,
    previous: this.view() === 'cumulative' ? this.previousLine() : null,
    previousLabel: this.previousLabel(),
    selected: this.selected(),
    money: v => this.money(v),
    dayHeading: day => this.dayHeading(day),
    dayShort: day => this.dayShort(day),
  }, this.theme().tokens));

  money(v: number): string { return formatMoney(v, this.currency(), Math.abs(v) > 0 && Math.abs(v) < 0.01 ? 4 : 2); }
  dayHeading(day: string): string { return formatDate(day + 'T00:00:00Z', 'EEE d MMM y', this.locale, 'UTC'); }
  dayShort(day: string): string { return formatDate(day + 'T00:00:00Z', 'd MMM', this.locale, 'UTC'); }

  setView(view: CostView): void {
    this.view.set(view);
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* a remembered view is a convenience */ }
  }

  /** A click on a day picks it; on the picked day again, unpicks it. A day still to come has no lines. */
  pick(click: EChartClick): void {
    const day = dayOfClick(click, this.monthDays());
    if (!day) return;
    this.selected.set(this.selected() === day ? null : day);
  }
}
