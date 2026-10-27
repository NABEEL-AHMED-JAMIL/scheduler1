import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { Bar, BarChart } from '../../shared/charts/bar-chart';
import { chartColor } from '../../shared/charts/status-color';
import { BillingApi, BillingAnalytics as Analytics, CostTrends, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, PaymentListRow, paymentMethodLabel } from './billing.service';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { formatBytes, formatMoney, formatMoneyRound, monthShort, workspaceLabels } from './billing-format';
import { PageHeader } from '../../shared/ui/page-header';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';

/** Every service's own colour in the month bars, in a stable order (Rates.LABELS' services). */
const SERVICE_ORDER = ['Pipelines', 'Model calls', 'Storage', 'Analytics & tools', 'API', 'Seats', 'Other'];

/**
 * Billing › Analytics (owner #22, 2026-10-19; before, Platform › Billing analytics). Everyone who opens it sees the trends
 * of what was used -- by month, by service and by pipeline -- for their own workspace: a workspace administrator always
 * their own (the server decides that, billing.json/costTrends). A platform administrator picks a workspace with the shared
 * selector, or every workspace together (then by workspace instead of by pipeline), and with every workspace also sees the
 * cross-customer revenue -- invoiced, collected, open, overdue, churn and payments -- which stays the platform's alone.
 */
@Component({
  selector: 'app-billing-analytics',
  imports: [PageHeader, Icon, StatTile, BarChart, RouterLink, DecimalPipe, Segmented, ServerTimePipe, WorkspaceSelect],
  templateUrl: './billing-analytics.html',
})
export class BillingAnalyticsPage implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  readonly directory = inject(WorkspaceDirectory);
  readonly isPlatform = computed(() => this.auth.isPlatformAdmin() && !this.auth.isManagedSession());
  /** The platform administrator's pick; null is every workspace. A workspace administrator's is theirs (the server's). */
  readonly tenantId = signal<number | null>(this.directory.remembered());
  /** Cross-customer revenue: the platform's, over every workspace. */
  readonly showRevenue = computed(() => this.isPlatform() && this.tenantId() === null);
  readonly trends = signal<CostTrends | null>(null);
  readonly trendsError = signal('');
  readonly trendsLoading = signal(true);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly months = signal(6);
  readonly rangeOptions: SegmentOption<string>[] = [3, 6, 12].map(n => ({ id: String(n), label: `Last ${n} months` }));
  readonly data = signal<Analytics | null>(null);
  readonly statusLabel = INVOICE_STATUS_LABEL;
  readonly statusTone = INVOICE_STATUS_TONE;
  /** MIG-359: the latest payments in every workspace -- cards through Stripe (paid and declined), slips, credit notes applied. */
  readonly payments = signal<PaymentListRow[]>([]);
  readonly paymentsError = signal('');
  readonly methodLabel = paymentMethodLabel;
  readonly cardPayments = computed(() => this.payments().filter(p => p.provider === 'stripe'));

  readonly bars = computed<Bar[]>(() => (this.data()?.months ?? []).map(m => ({
    name: monthShort(m.month), value: Math.round(Number(m.invoiced ?? 0) * 100) / 100,
    segments: [
      { label: 'Collected', value: Math.round(Number(m.collected ?? 0) * 100) / 100, color: chartColor(2) },
      { label: 'Open', value: Math.round((Number(m.invoiced ?? 0) - Number(m.collected ?? 0)) * 100) / 100, color: chartColor(1) },
    ],
  })));
  /**
   * Every workspace's name for these tables. One with usage but no invoice yet is still named -- from the
   * workspace list, not the bills -- and two that share a name carry their ids, or a table shows one row twice.
   */
  readonly labels = computed(() => {
    const known = new Map<number, string>(this.directory.workspaces().map(t => [t.tenantId, t.tenantName]));
    for (const t of this.data()?.tenants ?? []) if (!known.has(t.tenantId)) known.set(t.tenantId, t.tenantName);
    return workspaceLabels([...known].map(([tenantId, tenantName]) => ({ tenantId, tenantName })));
  });
  readonly tenants = computed(() => [...(this.data()?.tenants ?? [])].map(t => ({ ...t, tenantName: this.labels().get(t.tenantId) ?? t.tenantName, invoiced: Number(t.invoiced), collected: Number(t.collected), open: Number(t.open), overdue: Number(t.overdue) })).sort((a, b) => b.invoiced - a.invoiced));
  readonly churn = computed(() => {
    const names = this.labels();
    return (this.data()?.usageByTenant ?? []).map(u => ({ tenantId: u.tenantId, tenantName: names.get(u.tenantId) ?? `Workspace ${u.tenantId}`, amount: Number(u.amount),
      deletedBytes: Number(u.quantityByMeter?.['storage.bytes.deleted'] ?? 0), writtenBytes: Number(u.quantityByMeter?.['storage.bytes.written'] ?? 0), tokens: Number(u.quantityByMeter?.['ai.tokens.in'] ?? 0) + Number(u.quantityByMeter?.['ai.tokens.out'] ?? 0) }))
      .sort((a, b) => b.deletedBytes - a.deletedBytes);
  });
  /**
   * Rate card fallback: the workspaces that used a meter no card prices -- neither their own nor the default -- billed at 0
   * for it. Empty when every meter used has a price somewhere, which is the normal state.
   */
  readonly unpriced = computed(() => {
    const names = this.labels();
    return (this.data()?.usageByTenant ?? []).filter(u => (u.unpricedMeters ?? []).length)
      .map(u => ({ tenantId: u.tenantId, tenantName: names.get(u.tenantId) ?? `Workspace ${u.tenantId}`, meters: u.unpricedMeters ?? [] }));
  });
  /** Under Collected: the share and how fast it came, or plainly that nothing has yet. */
  readonly collectedFoot = computed(() => {
    const d = this.data();
    if (!d || !(Number(d.collected) > 0)) return 'nothing collected yet';
    const days = Number(d.medianDaysToPay);
    return `${this.collectedShare()}% · median ${days} day${days === 1 ? '' : 's'} to pay`;
  });
  /** The months the revenue covers (an answer without any says none). */
  readonly monthCount = computed(() => this.data()?.months?.length ?? 0);
  readonly collectedShare = computed(() => { const d = this.data(); return d && Number(d.invoiced) > 0 ? Math.round(Number(d.collected) / Number(d.invoiced) * 100) : 0; });
  readonly money = (v: number) => formatMoneyRound(v);
  readonly money2 = (v: number) => formatMoney(v);
  fmtBytes(b: number): string { return formatBytes(b); }

  // ---- the trends ------------------------------------------------------------------------------------------------
  readonly services = computed(() => {
    const seen = new Set<string>((this.trends()?.byService ?? []).map(s => s.service));
    return [...SERVICE_ORDER.filter(s => seen.has(s)), ...[...seen].filter(s => !SERVICE_ORDER.includes(s))];
  });
  readonly monthBars = computed<Bar[]>(() => (this.trends()?.months ?? []).map(m => ({
    name: monthShort(m.month), value: Math.round(Number(m.amount ?? 0) * 100) / 100,
    segments: this.services().map((service, i) => ({ label: service, value: Math.round(Number(m.byService?.[service] ?? 0) * 100) / 100, color: chartColor(i) })),
  })));
  readonly total = computed(() => Number(this.trends()?.total ?? 0));
  readonly thisMonth = computed(() => { const m = this.trends()?.months ?? []; return m.length ? Number(m[m.length - 1].amount) : 0; });
  readonly lastMonth = computed(() => { const m = this.trends()?.months ?? []; return m.length > 1 ? Number(m[m.length - 2].amount) : null; });
  readonly topService = computed<{ service: string; amount: number } | null>(() => (this.trends()?.byService ?? [])[0] ?? null);
  readonly serviceRows = computed(() => {
    const total = this.total();
    return (this.trends()?.byService ?? []).map(s => ({ ...s, amount: Number(s.amount), share: total > 0 ? Math.round(Number(s.amount) / total * 100) : 0 }));
  });
  readonly pipelineRows = computed(() => (this.trends()?.byPipeline ?? []).slice(0, 15).map(p => ({ ...p, cost: Number(p.cost) })));
  readonly workspaceRows = computed(() => {
    const total = this.total();
    return (this.trends()?.byWorkspace ?? []).map(w => ({ tenantId: w.tenantId, name: this.directory.nameOf(w.tenantId), amount: Number(w.amount),
      share: total > 0 ? Math.round(Number(w.amount) / total * 100) : 0 }));
  });
  readonly scopeName = computed(() => {
    if (!this.isPlatform()) return this.auth.user()?.tenantName || 'your workspace';
    return this.tenantId() === null ? 'every workspace' : this.directory.nameOf(this.tenantId());
  });

  ngOnInit(): void { this.load(); }
  setMonths(n: number): void { this.months.set(n); this.load(); }
  pickWorkspace(id: number | null): void { this.tenantId.set(id); this.load(); }
  monthWord(m: string): string { return monthShort(m); }
  loadPayments(): void {
    this.paymentsError.set('');
    this.api.payments(null).subscribe({
      next: r => { if (r.status !== API_SUCCESS) { this.paymentsError.set(r.message); return; } this.payments.set((r.data ?? []).map(p => ({ ...p, amount: Number(p.amount) }))); },
      error: err => this.paymentsError.set(err?.error?.message || 'Could not read the payments.'),
    });
  }
  paymentState(p: PaymentListRow): { label: string; tone: string } {
    if (p.status === 'verified') return { label: p.method === 'credit_note' ? 'Applied' : 'Paid', tone: 'pill-ok' };
    if (p.status === 'rejected') return { label: p.method === 'card' && p.provider ? 'Declined' : 'Rejected', tone: 'pill-crit' };
    return { label: 'To verify', tone: 'pill-warn' };
  }
  load(): void {
    const to = new Date(); const from = new Date(to.getFullYear(), to.getMonth() - (this.months() - 1), 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.trendsLoading.set(true); this.trendsError.set('');
    this.api.costTrends(iso(from), iso(to), this.isPlatform() ? this.tenantId() : null).subscribe({
      next: r => { this.trendsLoading.set(false); if (r.status !== API_SUCCESS) { this.trendsError.set(r.message); this.trends.set(null); return; } this.trends.set(r.data ?? null); },
      error: err => { this.trendsLoading.set(false); this.trendsError.set(err?.error?.message || 'Could not read the cost trends.'); },
    });
    if (!this.showRevenue()) { this.data.set(null); return; }
    // Cross-customer revenue: the platform's alone, over every workspace.
    this.loading.set(true); this.error.set('');
    this.loadPayments();
    this.api.analytics(iso(from), iso(to)).subscribe({
      next: r => { this.loading.set(false); if (r.status !== API_SUCCESS) { this.error.set(r.message); return; } this.data.set(r.data ?? null); },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read billing analytics.'); },
    });
  }
}
