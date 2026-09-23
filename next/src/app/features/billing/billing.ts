import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { Combobox } from '../../shared/ui/combobox';
import { TableShell } from '../../shared/ui/data-table';
import { Bar, BarChart } from '../../shared/charts/bar-chart';
import { chartColor } from '../../shared/charts/status-color';
import { BillingApi, DayRow, MeterLine, PricedWith, SERVICES, SubjectRow, UsageQuery } from './billing.service';
import { HOURS_PER_DAY, daysInMonth, firstOfMonth, formatBytes, formatGb, formatMoney, formatQuantity, formatUnitPrice } from './billing-format';
import { WorkspacePicker } from './workspace-picker';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';

/** How many subjects a line unfolds to: the top buckets, prompts or objects behind it. */
const SUBJECTS_SHOWN = 25;
/** The forecast paces the rest of the month at the last week's daily average. */
const FORECAST_WINDOW_DAYS = 7;

/**
 * Cost & usage: what this workspace used this month and what it costs, as the meter says.
 *
 * Every number here is the same daily rollup an invoice will be built from -- there is no
 * estimate that differs from the bill except in being unfinished. The lines table is the
 * invoice's lines; a line opens to the subjects behind it (which bucket, which prompt, who
 * deleted what), so "why is storage $71" has an answer on the same screen.
 */
@Component({
  selector: 'app-billing',
  imports: [Icon, StatTile, Combobox, TableShell, BarChart, DecimalPipe, ServerTimePipe, RouterLink],
  templateUrl: './billing.html',
})
export class Billing implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  readonly workspaces = inject(WorkspacePicker);

  readonly isPlatformAdmin = this.auth.isPlatformAdmin;

  /** The month on screen, as its first day. */
  readonly month = signal(firstOfMonth(new Date()));
  readonly monthLabel = computed(() => new Date(this.month() + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  readonly isCurrentMonth = computed(() => this.month() === firstOfMonth(new Date()));

  readonly loading = signal(false);
  readonly error = signal('');
  readonly notConfigured = signal(false);
  readonly lines = signal<MeterLine[]>([]);
  readonly days = signal<DayRow[]>([]);
  readonly currency = signal('USD');
  readonly rateCard = signal<PricedWith | null>(null);
  /** The month before, priced as a whole -- the comparison the forecast is read against. */
  readonly previousTotal = signal<number | null>(null);

  // ---- the tiles ----
  readonly total = computed(() => this.lines().reduce((n, l) => n + l.amount, 0));
  readonly daysElapsed = computed(() => {
    const first = new Date(this.month() + 'T00:00:00');
    const today = new Date();
    if (!this.isCurrentMonth()) return daysInMonth(first);
    return Math.max(1, today.getDate());
  });
  readonly daysInMonth = computed(() => daysInMonth(new Date(this.month() + 'T00:00:00')));
  /** The sum of a day's amount by date, so a day with no usage counts as zero, not as absent. */
  private amountOn(day: string): number { return this.days().find(d => d.day === day)?.amount ?? 0; }
  private isoDay(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  /**
   * At the last seven calendar days' pace -- a guess, labelled as one. Calendar days, not the
   * last seven days that had usage: one burst of $5 on a quiet month is a $5/7 pace, not $5/day.
   */
  readonly forecast = computed(() => {
    if (!this.isCurrentMonth() || !this.days().length) return null;
    const today = new Date();
    let spent = 0, counted = 0;
    for (let back = 1; back <= FORECAST_WINDOW_DAYS; back++) {
      const d = new Date(today); d.setDate(today.getDate() - back);
      if (this.isoDay(d) < this.month()) break;            // the window does not reach into last month
      spent += this.amountOn(this.isoDay(d)); counted++;
    }
    if (!counted) return null;
    const perDay = spent / counted;
    return this.total() + perDay * Math.max(0, this.daysInMonth() - this.daysElapsed());
  });
  /** What yesterday cost -- the date, not the last row but one. */
  readonly yesterday = computed(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return this.amountOn(this.isoDay(d));
  });
  /** Bytes deleted this month; the meter carries bytes, the screen says KB/MB/GB. */
  readonly deletedBytes = computed(() => this.lines().find(l => l.meter === 'storage.bytes.deleted')?.quantity ?? 0);
  readonly deleteOps = computed(() => this.lines().find(l => l.meter === 'storage.ops.delete')?.quantity ?? 0);
  readonly churnAmount = computed(() => (this.lines().find(l => l.meter === 'storage.bytes.deleted')?.amount ?? 0) + (this.lines().find(l => l.meter === 'storage.ops.delete')?.amount ?? 0));
  /** Storage kept, averaged over the nights it was measured -- not over the month, which would understate a late start. */
  readonly storedGbAverage = computed(() => {
    const line = this.lines().find(l => l.meter === 'storage.gb_hours');
    return line ? line.quantity / HOURS_PER_DAY / Math.max(1, line.days) : 0;
  });
  readonly storedNights = computed(() => this.lines().find(l => l.meter === 'storage.gb_hours')?.days ?? 0);
  readonly seats = computed(() => {
    const line = this.lines().find(l => l.meter === 'seats.user_days');
    return line ? Math.round(line.quantity / Math.max(1, line.days)) : 0;
  });
  readonly seatsAmount = computed(() => this.lines().find(l => l.meter === 'seats.user_days')?.amount ?? 0);

  // ---- by service ----
  readonly byService = computed(() => {
    const totals = new Map<string, number>();
    for (const l of this.lines()) totals.set(l.service, (totals.get(l.service) ?? 0) + l.amount);
    const total = this.total() || 1;
    return SERVICES.filter(s => totals.has(s)).map((s, i) => ({ service: s, amount: totals.get(s)!, share: Math.round((totals.get(s)! / total) * 100), color: chartColor(i) }));
  });
  readonly serviceColor = computed(() => new Map(this.byService().map(s => [s.service, s.color])));

  // ---- by day, stacked by service ----
  readonly dayBars = computed<Bar[]>(() => this.days().map(d => ({
    name: d.day.slice(5),
    value: Math.round(d.amount * 100) / 100,
    segments: Object.entries(d.byService).map(([service, amount]) => ({ label: service, value: Math.round(amount * 100) / 100, color: this.serviceColor().get(service) ?? chartColor(5) })),
  })));
  readonly money = (v: number) => this.fmtMoney(v);

  // ---- drill-down ----
  readonly openLine = signal<MeterLine | null>(null);
  readonly subjects = signal<SubjectRow[]>([]);
  readonly subjectsLoading = signal(false);

  ngOnInit(): void {
    this.workspaces.ready(() => this.load());
  }

  pickTenant(id: string): void { this.workspaces.tenantId.set(id); this.load(); }
  shiftMonth(delta: number): void {
    const d = new Date(this.month() + 'T00:00:00');
    d.setMonth(d.getMonth() + delta);
    this.month.set(firstOfMonth(d));
    this.load();
  }

  readonly previousLabel = computed(() => { const d = new Date(this.month() + 'T00:00:00'); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString(undefined, { month: 'short' }); });

  /** The month on screen as a range, for the platform administrator's picked workspace. */
  private query(month = this.month()): UsageQuery {
    const first = new Date(month + 'T00:00:00');
    return { from: month, to: `${month.slice(0, 7)}-${String(daysInMonth(first)).padStart(2, '0')}`, tenantId: this.isPlatformAdmin() ? this.workspaces.effective() : null };
  }

  load(): void {
    this.loading.set(true); this.error.set(''); this.openLine.set(null); this.previousTotal.set(null);
    const before = new Date(this.month() + 'T00:00:00'); before.setMonth(before.getMonth() - 1);
    this.api.usageByMeter(this.query(firstOfMonth(before))).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.previousTotal.set((r.data?.rows ?? []).reduce((n, l) => n + Number(l.amount), 0)); },
      error: () => {},
    });
    this.api.usageByMeter(this.query()).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.loading.set(false); this.failed(r.message); return; }
        if (r.data?.rateCard) { this.rateCard.set(r.data.rateCard); this.currency.set(r.data.rateCard.currency || 'USD'); }
        this.lines.set((r.data?.rows ?? []).map(l => ({
          ...l, quantity: Number(l.quantity), amount: Number(l.amount), unitPrice: Number(l.unitPrice),
          includedQuantity: Number(l.includedQuantity ?? 0), billableQuantity: Number(l.billableQuantity ?? l.quantity),
          tiers: (l.tiers ?? []).map(t => ({ from: Number(t.from), to: t.to == null ? null : Number(t.to), units: Number(t.units), unit_price: Number(t.unit_price) })),
        })));
        this.api.usageByDay(this.query()).subscribe({
          next: d => {
            this.loading.set(false);
            if (d.status !== API_SUCCESS) { this.failed(d.message); return; }
            this.days.set((d.data?.rows ?? []).map(x => ({ day: String(x.day), amount: Number(x.amount), byService: Object.fromEntries(Object.entries(x.byService ?? {}).map(([k, v]) => [k, Number(v)])) })));
          },
          error: err => { this.loading.set(false); this.failed(err?.error?.message); },
        });
      },
      error: err => { this.loading.set(false); this.failed(err?.error?.message); },
    });
  }

  private failed(message?: string): void {
    if ((message || '').includes('not configured')) { this.notConfigured.set(true); return; }
    this.error.set(message || 'The metering service did not answer.');
  }

  /** The lines as a CSV -- the same figures, for a spreadsheet or the finance system. */
  exportCsv(): void {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['meter', 'label', 'service', 'quantity', 'unit', 'included_quantity', 'billable_quantity', 'unit_price', 'per', 'amount', 'currency', 'rate_card']];
    for (const l of this.lines()) rows.push([l.meter, l.label, l.service, String(l.quantity), l.unit, String(l.includedQuantity), String(l.billableQuantity), String(l.unitPrice), String(l.per), l.amount.toFixed(5), this.currency(), this.rateCard() ? `${this.rateCard()!.name} v${this.rateCard()!.version}` : '']);
    rows.push(['', 'Month to date', '', '', '', '', '', '', '', this.total().toFixed(5), this.currency(), '']);
    const blob = new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cost-usage-${this.month().slice(0, 7)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  /** Rolls the last two days again and reloads: the events of the last minutes, priced now. */
  refresh(): void {
    this.api.refreshUsage().subscribe({ next: () => this.load(), error: () => this.load() });
  }

  toggleLine(line: MeterLine): void {
    if (this.openLine()?.meter === line.meter) { this.openLine.set(null); return; }
    this.openLine.set(line); this.subjects.set([]); this.subjectsLoading.set(true);
    this.api.subjects(this.query(), line.meter, SUBJECTS_SHOWN).subscribe({
      next: r => { this.subjectsLoading.set(false); this.subjects.set((r.data?.rows ?? []).map(s => ({ ...s, quantity: Number(s.quantity), events: Number(s.events) }))); },
      error: () => this.subjectsLoading.set(false),
    });
  }

  fmtMoney(value: number): string { return formatMoney(value, this.currency()); }
  fmtBytes(bytes: number): string { return formatBytes(bytes); }
  fmtGb(gb: number): string { return formatGb(gb); }
  fmtQuantity(line: MeterLine): string { return line.unit === 'byte' || line.unit === 'GB' || line.unit === 'GB-hour' || line.unit === 'minute' ? formatQuantity(line.quantity, line.unit) : Math.round(line.quantity).toLocaleString(); }
  /** The unit price with enough digits to be a price, not "$0.0000". */
  fmtRate(line: MeterLine): string {
    if (line.unpriced) return 'not on the card';
    if (line.hasTiers) return 'tiered';
    return this.fmtUnitPrice(line.unitPrice, line.per, line.unit);
  }
  /** A quantity of the line's unit, for the allowance and the tier bands. */
  fmtUnits(line: MeterLine, q: number): string { return this.fmtQuantity({ ...line, quantity: q }); }
  fmtUnitPrice(p: number, per: number, unit: string): string { return formatUnitPrice(p, per, unit, this.currency()); }
  subjectLabel(s: SubjectRow): string { return s.subject_id || (s.subject_type ? `(${s.subject_type})` : '(no subject)'); }

}
