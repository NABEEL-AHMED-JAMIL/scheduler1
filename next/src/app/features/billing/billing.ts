import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { Combobox } from '../../shared/ui/combobox';
import { TableShell } from '../../shared/ui/data-table';
import { Bar, BarChart } from '../../shared/charts/bar-chart';
import { RouterLink } from '@angular/router';
import { chartColor } from '../../shared/charts/status-color';
import { AppliedTier, priceDigits } from './billing.service';

/** One row of billing.json/usage?groupBy=meter: a meter's month, priced. */
export interface MeterLine {
  meter: string; label: string; service: string; unit: string; per: number;
  unitPrice: number; quantity: number; amount: number; days: number;
  /** The calculation applied to the period: allowance first, then tier bands if the card has them. */
  includedQuantity: number; billableQuantity: number; tiers: AppliedTier[]; hasTiers: boolean; unpriced?: boolean;
}
/** The card the period is priced with, as the meter names it. */
interface PricedWith { version: number; name: string; currency: string; tenantSpecific: boolean; effectiveFrom: string; }
interface DayRow { day: string; amount: number; byService: Record<string, number>; }
interface SubjectRow { subject_type: string; subject_id: string; quantity: number; events: number; last: string | null; actor_user_id: number | null; actor_name?: string | null; }
interface TenantOption { tenantId: number; tenantName: string; }

/** The services a meter rolls up under, in the order the screen lists them. */
const SERVICES = ['Storage', 'Model calls', 'Seats', 'Pipelines', 'Analytics & tools', 'Other'];

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
  imports: [Icon, StatTile, Combobox, TableShell, BarChart, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './billing.html',
})
export class Billing implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly isPlatformAdmin = this.auth.isPlatformAdmin;

  /** The month on screen, as its first day. */
  readonly month = signal(Billing.firstOfMonth(new Date()));
  readonly monthLabel = computed(() => new Date(this.month() + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  readonly isCurrentMonth = computed(() => this.month() === Billing.firstOfMonth(new Date()));

  readonly tenants = signal<TenantOption[]>([]);
  readonly tenantId = signal<string>('');
  readonly tenantOptions = computed(() => this.tenants().map(t => ({ value: String(t.tenantId), label: t.tenantName })));

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
    if (!this.isCurrentMonth()) return Billing.daysInMonth(first);
    return Math.max(1, today.getDate());
  });
  readonly daysInMonth = computed(() => Billing.daysInMonth(new Date(this.month() + 'T00:00:00')));
  /** At the last seven days' pace -- a guess, labelled as one. */
  readonly forecast = computed(() => {
    if (!this.isCurrentMonth()) return null;
    const recent = this.days().slice(-7);
    if (!recent.length) return null;
    const perDay = recent.reduce((n, d) => n + d.amount, 0) / recent.length;
    return this.total() + perDay * Math.max(0, this.daysInMonth() - this.daysElapsed());
  });
  readonly yesterday = computed(() => {
    const d = this.days();
    return d.length >= 2 ? d[d.length - 2].amount : d.length ? d[0].amount : 0;
  });
  /** Bytes deleted this month; the meter carries bytes, the screen says KB/MB/GB. */
  readonly deletedBytes = computed(() => this.lines().find(l => l.meter === 'storage.bytes.deleted')?.quantity ?? 0);
  readonly deleteOps = computed(() => this.lines().find(l => l.meter === 'storage.ops.delete')?.quantity ?? 0);
  readonly churnAmount = computed(() => (this.lines().find(l => l.meter === 'storage.bytes.deleted')?.amount ?? 0) + (this.lines().find(l => l.meter === 'storage.ops.delete')?.amount ?? 0));
  readonly storedGbDays = computed(() => (this.lines().find(l => l.meter === 'storage.gb_hours')?.quantity ?? 0) / 24);
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
    if (this.isPlatformAdmin()) {
      this.http.get<ApiResponse<TenantOption[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: r => {
          if (r.status !== API_SUCCESS) return;
          this.tenants.set(r.data ?? []);
          if (!this.tenantId() && this.tenants().length) { this.tenantId.set(String(this.tenants()[0].tenantId)); this.load(); }
        },
        error: () => {},
      });
    } else {
      this.load();
    }
  }

  pickTenant(id: string): void { this.tenantId.set(id); this.load(); }
  shiftMonth(delta: number): void {
    const d = new Date(this.month() + 'T00:00:00');
    d.setMonth(d.getMonth() + delta);
    this.month.set(Billing.firstOfMonth(d));
    this.load();
  }

  readonly previousLabel = computed(() => { const d = new Date(this.month() + 'T00:00:00'); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString(undefined, { month: 'short' }); });

  private params(extra: Record<string, string> = {}, month = this.month()): Record<string, string> {
    const from = month;
    const first = new Date(from + 'T00:00:00');
    const to = `${from.slice(0, 7)}-${String(Billing.daysInMonth(first)).padStart(2, '0')}`;
    const p: Record<string, string> = { from, to, ...extra };
    if (this.isPlatformAdmin() && this.tenantId()) p['tenantId'] = this.tenantId();
    return p;
  }

  load(): void {
    this.loading.set(true); this.error.set(''); this.openLine.set(null); this.previousTotal.set(null);
    const before = new Date(this.month() + 'T00:00:00'); before.setMonth(before.getMonth() - 1);
    this.http.get<ApiResponse<{ rows: { amount: number }[] }>>(`${API_BASE}/billing.json/usage`, { params: this.params({ groupBy: 'meter' }, Billing.firstOfMonth(before)) }).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.previousTotal.set((r.data?.rows ?? []).reduce((n, l) => n + Number(l.amount), 0)); },
      error: () => {},
    });
    this.http.get<ApiResponse<{ rows: MeterLine[]; rateCard?: PricedWith }>>(`${API_BASE}/billing.json/usage`, { params: this.params({ groupBy: 'meter' }) }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.loading.set(false); this.failed(r.message); return; }
        if (r.data?.rateCard) { this.rateCard.set(r.data.rateCard); this.currency.set(r.data.rateCard.currency || 'USD'); }
        this.lines.set((r.data?.rows ?? []).map(l => ({
          ...l, quantity: Number(l.quantity), amount: Number(l.amount), unitPrice: Number(l.unitPrice),
          includedQuantity: Number(l.includedQuantity ?? 0), billableQuantity: Number(l.billableQuantity ?? l.quantity),
          tiers: (l.tiers ?? []).map(t => ({ from: Number(t.from), to: t.to == null ? null : Number(t.to), units: Number(t.units), unit_price: Number(t.unit_price) })),
        })));
        this.http.get<ApiResponse<{ rows: DayRow[] }>>(`${API_BASE}/billing.json/usage`, { params: this.params({ groupBy: 'day' }) }).subscribe({
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
    this.http.post<ApiResponse>(`${API_BASE}/billing.json/refresh`, null).subscribe({ next: () => this.load(), error: () => this.load() });
  }

  toggleLine(line: MeterLine): void {
    if (this.openLine()?.meter === line.meter) { this.openLine.set(null); return; }
    this.openLine.set(line); this.subjects.set([]); this.subjectsLoading.set(true);
    this.http.get<ApiResponse<{ rows: SubjectRow[] }>>(`${API_BASE}/billing.json/subjects`, { params: this.params({ meter: line.meter, limit: '25' }) }).subscribe({
      next: r => { this.subjectsLoading.set(false); this.subjects.set((r.data?.rows ?? []).map(s => ({ ...s, quantity: Number(s.quantity), events: Number(s.events) }))); },
      error: () => this.subjectsLoading.set(false),
    });
  }

  fmtMoney(value: number): string {
    const abs = Math.abs(value);
    const digits = abs > 0 && abs < 0.01 ? 4 : 2;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: this.currency(), minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }
  /** Bytes as a person reads them: 2 KB is not "0 GB". */
  fmtBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 2 })} GB`;
  }
  fmtGb(gb: number): string { return this.fmtBytes(gb * 1024 * 1024 * 1024); }
  fmtQuantity(line: MeterLine): string {
    const q = line.quantity;
    if (line.unit === 'byte') return this.fmtBytes(q);
    if (line.unit === 'GB') return this.fmtGb(q);
    if (line.unit === 'GB-hour') return q < 1 ? `${this.fmtGb(q / 24)} · day` : q.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (line.unit === 'minute') return q < 1 ? `${(q * 60).toLocaleString(undefined, { maximumFractionDigits: 1 })} s` : q.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return Math.round(q).toLocaleString();
  }
  /** The unit price with enough digits to be a price, not "$0.0000". */
  fmtRate(line: MeterLine): string {
    if (line.unpriced) return 'not on the card';
    if (line.hasTiers) return 'tiered';
    return this.fmtUnitPrice(line.unitPrice, line.per, line.unit);
  }
  /** A quantity of the line's unit, for the allowance and the tier bands. */
  fmtUnits(line: MeterLine, q: number): string { return this.fmtQuantity({ ...line, quantity: q }); }
  fmtUnitPrice(p: number, per: number, unit: string): string {
    const digits = priceDigits(p);
    const price = new Intl.NumberFormat(undefined, { style: 'currency', currency: this.currency(), minimumFractionDigits: digits, maximumFractionDigits: digits }).format(p);
    // A byte meter is priced per GB; saying "$0.01 / 1,073,741,824 per byte" would be true and unreadable.
    if (unit === 'byte' && per === 1024 * 1024 * 1024) return `${price} per GB`;
    return `${price}${per > 1 ? ' / ' + per.toLocaleString() : ''} per ${unit}`;
  }
  subjectLabel(s: SubjectRow): string { return s.subject_id || (s.subject_type ? `(${s.subject_type})` : '(no subject)'); }

  static firstOfMonth(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
  static daysInMonth(d: Date): number { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
}
