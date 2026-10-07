import { Component, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { Combobox } from '../../shared/ui/combobox';
import { TableShell } from '../../shared/ui/data-table';
import { Bar, BarChart } from '../../shared/charts/bar-chart';
import { chartColor } from '../../shared/charts/status-color';
import { BillingApi, DayRow, MeterLine, PricedWith, RunRow, SERVICES, SubjectRow, UsageQuery } from './billing.service';
import { HOURS_PER_DAY, daysInMonth, firstOfMonth, formatBytes, formatGb, formatMoney, formatQuantity, formatUnitPrice, moneyDigits, pluralUnit, shiftDay } from './billing-format';
import { WorkspacePicker } from './workspace-picker';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';

/** How many subjects a line unfolds to: the top buckets, prompts or objects behind it. */
const SUBJECTS_SHOWN = 25;
/** How many runs the Cost per run table reads at a time. */
const RUNS_PAGE = 25;
/** The forecast paces the rest of the month at the last week's daily average. */
const FORECAST_WINDOW_DAYS = 7;

/** Under half a cent: rounds to $0.00, so it reads "< $0.01" and waits behind the toggle. */
function isTiny(amount: number): boolean {
  return Math.abs(Number(amount) || 0) < 0.005;
}

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
  readonly workspaces = inject(WorkspacePicker);

  readonly isPlatformAdmin = this.auth.isPlatformAdmin;

  /** The month on screen, as its first day. */
  readonly month = signal(firstOfMonth(new Date()));
  /** Months and days as the console writes them (MIG-295); month() is a calendar day, which the pipe keeps on its own day. */
  private readonly clock = new ServerTimePipe(inject(LOCALE_ID));
  /** "September 2026". It went through toLocaleDateString, so it followed the browser's language, not the console's. */
  readonly monthLabel = computed(() => this.clock.transform(this.month(), 'month') ?? '');
  /**
   * H9: the workspace's billing calendar, as Billing answered it -- its zone, today there and the month under way there. The
   * days on this page are those, never the browser's or UTC's: an evening's run in Chicago is that evening's usage.
   */
  readonly timeZone = signal<string | null>(null);
  readonly today = signal<string | null>(null);
  private readonly billingMonth = signal<string | null>(null);
  /** The month first shown is the browser's guess; the workspace's own month (its zone) replaces it once, on the first answer. */
  private followBillingMonth = true;
  readonly isCurrentMonth = computed(() => this.month().slice(0, 7) === (this.billingMonth() ?? firstOfMonth(new Date()).slice(0, 7)));

  readonly loading = signal(false);
  readonly error = signal('');
  readonly notConfigured = signal(false);
  readonly lines = signal<MeterLine[]>([]);
  /**
   * The Amount column reads in cents (UI review U12). It used to share four decimals whenever one line was under a
   * cent, so every line read "$3.0662" beside five lines of "$0.0000". Lines under half a cent now wait behind a
   * toggle, and shown they read "< $0.01" with the exact figure on the tooltip.
   */
  readonly lineDigits = computed(() => 2);
  readonly showTinyLines = signal(false);
  readonly tinyLines = computed(() => this.lines().filter(l => isTiny(l.amount)));
  readonly tinyTotal = computed(() => this.tinyLines().reduce((n, l) => n + l.amount, 0));
  readonly shownLines = computed(() => this.showTinyLines() ? this.lines() : this.lines().filter(l => !isTiny(l.amount)));
  readonly days = signal<DayRow[]>([]);
  readonly currency = signal('USD');
  readonly rateCard = signal<PricedWith | null>(null);
  /** Lines used and priced by no card -- neither this workspace's own nor the default: billed at 0, and said above the table. */
  readonly unpricedLines = computed(() => this.lines().filter(l => l.unpriced && Number(l.quantity) !== 0));
  /** Which cards the unpriced lines are missing from: the workspace's own and the default, or the one card that prices it. */
  readonly unpricedWhere = computed(() => {
    const card = this.rateCard();
    if (card?.tenantSpecific) return `neither this workspace's card nor ${card.fallback?.name || 'the default card'}`;
    return `no rate card (not on ${card?.name || 'the rate card in effect'})`;
  });
  /** Lines this workspace's own card does not name, priced from the default card (rate card fallback). */
  readonly fallbackLines = computed(() => this.lines().filter(l => !!l.pricedFrom));
  /** The month before, priced as a whole -- the comparison the forecast is read against. */
  readonly previousTotal = signal<number | null>(null);

  // ---- the tiles ----
  readonly total = computed(() => this.lines().reduce((n, l) => n + l.amount, 0));
  readonly daysElapsed = computed(() => {
    const first = new Date(this.month() + 'T00:00:00');
    if (!this.isCurrentMonth()) return daysInMonth(first);
    // Today in the workspace's zone (yyyy-MM-dd from Billing); the browser's day only until Billing has answered.
    const today = this.today();
    return Math.max(1, today ? Number(today.split('-')[2]) : new Date().getDate());
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
    const today = this.todayInWorkspace();
    let spent = 0, counted = 0;
    for (let back = 1; back <= FORECAST_WINDOW_DAYS; back++) {
      const day = shiftDay(today, -back);
      if (day < this.month()) break;                        // the window does not reach into last month
      spent += this.amountOn(day); counted++;
    }
    if (!counted) return null;
    const perDay = spent / counted;
    return this.total() + perDay * Math.max(0, this.daysInMonth() - this.daysElapsed());
  });
  /** What yesterday cost -- the date, not the last row but one: the day before today in the workspace's zone (H9). */
  readonly yesterday = computed(() => this.amountOn(shiftDay(this.todayInWorkspace(), -1)));
  /** Today as the workspace's bill names it; the browser's day only until Billing has answered. */
  private todayInWorkspace(): string { return this.today() ?? this.isoDay(new Date()); }
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
    // "16 Sep", not the raw "09-16" cut from the ISO day, which read as a US month-first date.
    name: this.clock.transform(d.day, 'day') ?? d.day,
    value: Math.round(d.amount * 100) / 100,
    segments: Object.entries(d.byService).map(([service, amount]) => ({ label: service, value: Math.round(amount * 100) / 100, color: this.serviceColor().get(service) ?? chartColor(5) })),
  })));
  readonly money = (v: number) => this.fmtMoney(v);

  // ---- drill-down ----
  readonly openLine = signal<MeterLine | null>(null);
  readonly subjects = signal<SubjectRow[]>([]);
  readonly subjectsLoading = signal(false);
  /** A drill-down that could not be read says so, rather than "No subject recorded". */
  readonly subjectsError = signal('');

  // ---- cost per run (MIG-308) ----
  readonly runs = signal<RunRow[]>([]);
  readonly runsTotal = signal(0);
  readonly runsLoading = signal(false);
  readonly runsError = signal('');
  private runsPage = 0;
  /** The precision the run Cost column shares, as the lines' Amount does. */
  readonly runDigits = computed(() => moneyDigits(this.runs().map(r => r.amount)));
  readonly moreRuns = computed(() => this.runs().length < this.runsTotal());

  ngOnInit(): void {
    this.workspaces.ready(() => this.load());
  }

  pickTenant(id: string): void { this.workspaces.tenantId.set(id); this.followBillingMonth = true; this.load(); }
  shiftMonth(delta: number): void {
    this.followBillingMonth = false;
    const d = new Date(this.month() + 'T00:00:00');
    d.setMonth(d.getMonth() + delta);
    this.month.set(firstOfMonth(d));
    this.load();
  }

  /** The month before, named in full ("August 2026") as every billing period is, not a bare "Aug". */
  readonly previousLabel = computed(() => { const d = new Date(this.month() + 'T00:00:00'); d.setMonth(d.getMonth() - 1); return this.clock.transform(firstOfMonth(d), 'month') ?? ''; });

  /** The month on screen as a range, for the platform administrator's picked workspace. */
  private query(month = this.month()): UsageQuery {
    const first = new Date(month + 'T00:00:00');
    return { from: month, to: `${month.slice(0, 7)}-${String(daysInMonth(first)).padStart(2, '0')}`, tenantId: this.isPlatformAdmin() ? this.workspaces.effective() : null };
  }

  load(): void {
    this.loading.set(true); this.error.set(''); this.openLine.set(null); this.previousTotal.set(null);
    this.runs.set([]); this.runsTotal.set(0); this.runsPage = 0; this.loadRuns();
    const before = new Date(this.month() + 'T00:00:00'); before.setMonth(before.getMonth() - 1);
    this.api.usageByMeter(this.query(firstOfMonth(before))).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.previousTotal.set((r.data?.rows ?? []).reduce((n, l) => n + Number(l.amount), 0)); },
      error: () => {},
    });
    this.api.usageByMeter(this.query()).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.loading.set(false); this.failed(r.message); return; }
        // H9: the workspace's billing calendar. On the first answer, show the workspace's own month (its zone may already
        // be in the next, or still in the last, while the browser's is not).
        this.timeZone.set(r.data?.timeZone ?? null);
        this.today.set(r.data?.today ?? null);
        this.billingMonth.set(r.data?.currentMonth ?? null);
        const own = r.data?.currentMonth;
        if (this.followBillingMonth) {
          this.followBillingMonth = false;
          if (own && own !== this.month().slice(0, 7)) { this.month.set(`${own}-01`); this.load(); return; }
        }
        this.rateCard.set(r.data?.rateCard ?? null);
        if (r.data?.rateCard) this.currency.set(r.data.rateCard.currency || 'USD');
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

  /** The next page of the month's model-call runs, each at its own model's rate. */
  loadRuns(): void {
    this.runsLoading.set(true); this.runsError.set('');
    const page = this.runsPage + 1;
    this.api.runs(this.query(), page, RUNS_PAGE).subscribe({
      next: r => {
        this.runsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.runsError.set(r.message || 'The runs could not be read.'); return; }
        this.runsPage = page;
        this.runsTotal.set(Number(r.data?.total ?? 0));
        this.runs.update(list => [...list, ...(r.data?.rows ?? []).map(x => ({
          ...x, tokens_in: Number(x.tokens_in), tokens_out: Number(x.tokens_out), amount: Number(x.amount),
          lines: (x.lines ?? []).map(l => ({ ...l, quantity: Number(l.quantity), per: Number(l.per), unit_price: Number(l.unit_price), amount: Number(l.amount) })),
        }))]);
      },
      error: err => { this.runsLoading.set(false); this.runsError.set(err?.error?.message || 'The runs could not be read.'); },
    });
  }

  /** After a failed read: the month's runs from the first page. */
  retryRuns(): void { this.runs.set([]); this.runsTotal.set(0); this.runsPage = 0; this.loadRuns(); }

  /** What a run was: the prompt, the document step, the tool run, the question, or a console call. */
  runLabel(r: RunRow): string {
    switch (r.subject_type) {
      case 'prompt': return r.subject_id && r.subject_id !== 'prompt' ? `Prompt ${r.subject_id}` : 'Prompt';
      case 'document': return 'Document extraction';
      case 'tool_run': return 'Tool run';
      case 'ask': return 'Question';
      case 'ad-hoc': return 'Console call';
      default: return r.subject_type || 'Model call';
    }
  }
  /** Each priced line of a run as "2,000 tokens in at $0.40 / 1,000". */
  runRates(r: RunRow): string {
    return r.lines.map(l => `${Math.round(l.quantity).toLocaleString()} ${l.meter.startsWith('ai.tokens.in') ? 'in' : 'out'} at ${this.fmtUnitPrice(l.unit_price, l.per, l.unit)}`).join(' · ');
  }
  fmtRunAmount(value: number): string { return formatMoney(value, this.currency(), this.runDigits()); }
  runActor(r: RunRow): string { return r.actor_name || (r.actor_user_id ? `User #${r.actor_user_id}` : 'Pipeline'); }

  private failed(message?: string): void {
    if ((message || '').includes('not configured')) { this.notConfigured.set(true); return; }
    this.error.set(message || 'The metering service did not answer.');
  }

  /** The lines as a CSV -- the same figures, for a spreadsheet or the finance system. */
  exportCsv(): void {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['meter', 'label', 'service', 'quantity', 'unit', 'included_quantity', 'billable_quantity', 'unit_price', 'per', 'amount', 'currency', 'rate_card']];
    const cardOf = (l: MeterLine) => l.pricedFrom ? `${l.pricedFrom.name} v${l.pricedFrom.version}` : l.unpriced ? 'none' : this.rateCard() ? `${this.rateCard()!.name} v${this.rateCard()!.version}` : '';
    for (const l of this.lines()) rows.push([l.meter, l.label, l.service, String(l.quantity), l.unit, String(l.includedQuantity), String(l.billableQuantity), String(l.unitPrice), String(l.per), l.amount.toFixed(5), this.currency(), cardOf(l)]);
    rows.push(['', 'Month to date', '', '', '', '', '', '', '', this.total().toFixed(5), this.currency(), '']);
    const blob = new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cost-usage-${this.month().slice(0, 7)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  /**
   * Rolls the last two days again and reloads: the events of the last minutes, priced now. The
   * platform administrator re-prices every workspace; a workspace administrator only their own.
   */
  refresh(): void {
    this.loading.set(true);
    const roll = this.isPlatformAdmin() ? this.api.refreshUsage() : this.api.refreshWorkspace();
    roll.subscribe({ next: () => this.load(), error: () => this.load() });
  }

  toggleLine(line: MeterLine): void {
    if (this.openLine()?.meter === line.meter) { this.openLine.set(null); return; }
    this.openLine.set(line); this.subjects.set([]); this.subjectsError.set(''); this.subjectsLoading.set(true);
    this.api.subjects(this.query(), line.meter, SUBJECTS_SHOWN).subscribe({
      next: r => {
        this.subjectsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.subjectsError.set(r.message || 'The events behind this line could not be read.'); return; }
        this.subjects.set((r.data?.rows ?? []).map(s => ({ ...s, quantity: Number(s.quantity), events: Number(s.events) }))); },
      error: err => { this.subjectsLoading.set(false); this.subjectsError.set(err?.error?.message || 'The events behind this line could not be read.'); },
    });
  }

  fmtMoney(value: number): string { return formatMoney(value, this.currency()); }
  /** An amount in the line-by-line table, at the precision its column shares. */
  fmtAmount(value: number): string {
    return isTiny(value) && value !== 0 ? `< ${formatMoney(0.01, this.currency(), 2)}` : formatMoney(value, this.currency(), this.lineDigits());
  }
  /** The exact amount, for the tooltip of a figure shown in cents. */
  fmtExact(value: number): string { return formatMoney(value, this.currency(), 4); }
  fmtBytes(bytes: number): string { return formatBytes(bytes); }
  fmtGb(gb: number): string { return formatGb(gb); }
  /**
   * A quantity with its unit, always (UI review U12): "1.5 s" sat beside a Unit column saying "minute" and "527.1 KB"
   * beside "byte". The figure now carries the unit it is written in, and the Unit column is gone.
   */
  fmtQuantity(line: MeterLine): string {
    const q = Number(line.quantity) || 0;
    const unit = line.unit ?? '';
    if (unit === 'byte' || unit === 'GB') return formatQuantity(q, unit);
    if (unit === 'GB-hour') return q < 1 ? formatQuantity(q, unit) : `${q.toLocaleString('en-US', { maximumFractionDigits: 1 })} GB-hours`;
    if (unit === 'minute') return q < 1 ? formatQuantity(q, unit) : `${q.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${q === 1 ? 'minute' : 'minutes'}`;
    const n = Math.round(q).toLocaleString('en-US');
    return !unit || unit === 'each' ? n : `${n} ${Math.round(q) === 1 ? unit : pluralUnit(unit)}`;
  }
  /** The unit price with enough digits to be a price, not "$0.0000". */
  fmtRate(line: MeterLine): string {
    if (line.unpriced) return 'Not on any card';
    if (line.hasTiers) return 'Tiered';
    return this.fmtUnitPrice(line.unitPrice, line.per, line.unit);
  }
  /** A quantity of the line's unit, for the allowance and the tier bands. */
  fmtUnits(line: MeterLine, q: number): string { return this.fmtQuantity({ ...line, quantity: q }); }
  fmtUnitPrice(p: number, per: number, unit: string): string { return formatUnitPrice(p, per, unit, this.currency()); }
  /** Who caused the events: a person by name, else by id, else the pipeline that ran unattended. */
  actorLabel(s: SubjectRow): string { return s.actor_name || (s.actor_user_id ? `User #${s.actor_user_id}` : 'Pipeline'); }
  subjectLabel(s: SubjectRow): string { return s.subject_id || (s.subject_type ? `(${s.subject_type})` : '(no subject)'); }

}
