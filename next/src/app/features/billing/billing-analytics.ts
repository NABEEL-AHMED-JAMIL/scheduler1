import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { Bar, BarChart } from '../../shared/charts/bar-chart';
import { chartColor } from '../../shared/charts/status-color';
import { BillingApi, BillingAnalytics as Analytics, CostTrends, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, PaymentListRow, PipelineCostRow, paymentMethodLabel } from './billing.service';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { formatBytes, formatMoney, formatMoneyRound, monthShort, workspaceLabels } from './billing-format';
import { PageHeader } from '../../shared/ui/page-header';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { createTableSort } from '../../shared/ui/sort';
import { SortHeader } from '../../shared/ui/sort-header';
import { AppLoading, InlineStatus, loadErrorText } from '../../shared/ui/loading';
import { BlurLoader } from '../../shared/ui/blur-loader';
import { LoadError } from '../../shared/ui/load-error';

/** Every service's own colour in the month bars, in a stable order (Rates.LABELS' services). */
const SERVICE_ORDER = ['Pipelines', 'Model calls', 'Storage', 'Analytics & tools', 'API', 'Seats', 'Other'];
/** By pipeline shows this many of the range's pipelines. */
const PIPELINES_SHOWN = 15;
/** Payments shows the latest this many the server sends. */
const PAYMENTS_SHOWN = 50;

interface ServiceRow { service: string; amount: number; share: number; }
interface WorkspaceRow { tenantId: number; name: string; amount: number; share: number; }
type TenantRow = Analytics['tenants'][number];
interface ChurnRow { tenantId: number; tenantName: string; amount: number; deletedBytes: number; writtenBytes: number; tokens: number; }

/**
 * Billing › Analytics (owner #22, 2026-10-19; before, Platform › Billing analytics). Everyone who opens it sees the trends
 * of what was used -- by month, by service and by pipeline -- for their own workspace: a workspace administrator always
 * their own (the server decides that, billing.json/costTrends). A platform administrator picks a workspace with the shared
 * selector, or every workspace together (then by workspace instead of by pipeline), and with every workspace also sees the
 * cross-customer revenue -- invoiced, collected, open, overdue, churn and payments -- which stays the platform's alone.
 */
@Component({
  selector: 'app-billing-analytics',
  imports: [PageHeader, Icon, StatTile, BarChart, RouterLink, DecimalPipe, Segmented, ServerTimePipe, WorkspaceSelect, SortHeader, AppLoading, InlineStatus, BlurLoader, LoadError],
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
  /** Owner 2026-10-27: the payments' own read, so "No payment yet." waits for its answer. */
  readonly paymentsLoading = signal(false);
  /** Which read is the latest: an answer for an earlier range or workspace never replaces a newer one. */
  private trendsSeq = 0;
  private revenueSeq = 0;
  private paymentsSeq = 0;
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
  readonly tenants = computed<TenantRow[]>(() => [...(this.data()?.tenants ?? [])].map(t => ({ ...t, tenantName: this.labels().get(t.tenantId) ?? t.tenantName, invoiced: Number(t.invoiced), collected: Number(t.collected), open: Number(t.open), overdue: Number(t.overdue) })).sort((a, b) => b.invoiced - a.invoiced));
  readonly churn = computed<ChurnRow[]>(() => {
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
  readonly serviceRows = computed<ServiceRow[]>(() => {
    const total = this.total();
    return (this.trends()?.byService ?? []).map(s => ({ ...s, amount: Number(s.amount), share: total > 0 ? Math.round(Number(s.amount) / total * 100) : 0 }));
  });
  /** Every pipeline of the range; the tile names the costliest (the first, as Billing sends them dearest first). */
  private readonly allPipelineRows = computed<PipelineCostRow[]>(() => (this.trends()?.byPipeline ?? []).map(p => ({ ...p, cost: Number(p.cost) })));
  readonly pipelineRows = computed(() => this.allPipelineRows().slice(0, PIPELINES_SHOWN));
  readonly workspaceRows = computed<WorkspaceRow[]>(() => {
    const total = this.total();
    return (this.trends()?.byWorkspace ?? []).map(w => ({ tenantId: w.tenantId, name: this.directory.nameOf(w.tenantId), amount: Number(w.amount),
      share: total > 0 ? Math.round(Number(w.amount) / total * 100) : 0 }));
  });
  readonly scopeName = computed(() => {
    if (!this.isPlatform()) return this.auth.user()?.tenantName || 'your workspace';
    return this.tenantId() === null ? 'every workspace' : this.directory.nameOf(this.tenantId());
  });

  // ---- sorting (owner 2026-10-27: "add a sort on each table") ----------------------------------------------------------
  /** By service, By pipeline and By workspace keep Billing's order until a heading is picked. */
  readonly serviceSort = createTableSort<ServiceRow>({
    id: 'billing-analytics-services',
    columns: { service: s => s.service, cost: { value: s => s.amount, kind: 'number' }, share: { value: s => s.share, kind: 'number' } },
  });
  readonly sortedServices = computed(() => this.serviceSort.apply(this.serviceRows()));
  /** Sorted over every pipeline of the range, then cut to the first PIPELINES_SHOWN. */
  readonly pipelineSort = createTableSort<PipelineCostRow>({
    id: 'billing-analytics-pipelines',
    columns: {
      pipeline: p => p.pipeline || 'Not tied to a pipeline',
      runs: { value: p => p.runs, kind: 'number' },
      cost: { value: p => p.cost, kind: 'number' },
      lastRun: { value: p => p.lastRunAt, kind: 'date' },
    },
  });
  readonly shownPipelineRows = computed(() => this.pipelineSort.apply(this.allPipelineRows()).slice(0, PIPELINES_SHOWN));
  readonly workspaceSort = createTableSort<WorkspaceRow>({
    id: 'billing-analytics-workspaces',
    columns: { workspace: w => w.name, cost: { value: w => w.amount, kind: 'number' }, share: { value: w => w.share, kind: 'number' } },
  });
  readonly sortedWorkspaces = computed(() => this.workspaceSort.apply(this.workspaceRows()));
  /** Revenue by workspace: the most invoiced first, as before. */
  readonly tenantSort = createTableSort<TenantRow>({
    id: 'billing-revenue-workspaces',
    initial: { key: 'invoiced', direction: 'desc' },
    columns: {
      workspace: t => t.tenantName,
      invoiced: { value: t => t.invoiced, kind: 'number' },
      open: { value: t => t.open, kind: 'number' },
      status: { value: t => this.statusLabel[t.status] || t.status, kind: 'status' },
    },
  });
  readonly sortedTenants = computed(() => this.tenantSort.apply(this.tenants()));
  /** Usage and churn: the most deleted first, as before. */
  readonly churnSort = createTableSort<ChurnRow>({
    id: 'billing-revenue-churn',
    initial: { key: 'deleted', direction: 'desc' },
    columns: {
      workspace: c => c.tenantName,
      cost: { value: c => c.amount, kind: 'number' },
      deleted: { value: c => c.deletedBytes, kind: 'number' },
      written: { value: c => c.writtenBytes, kind: 'number' },
      tokens: { value: c => c.tokens, kind: 'number' },
    },
  });
  readonly sortedChurn = computed(() => this.churnSort.apply(this.churn()));
  readonly PAYMENTS_SHOWN = PAYMENTS_SHOWN;
  /** Payments holds the latest PAYMENTS_SHOWN; a sort orders those, and the header says so. */
  readonly paymentSort = createTableSort<PaymentListRow>({
    id: 'billing-revenue-payments',
    note: `Sorts the latest ${PAYMENTS_SHOWN} shown`,
    columns: {
      date: { value: p => p.dateCreated, kind: 'date' },
      workspace: p => this.labels().get(p.tenantId) ?? p.tenantName ?? `Workspace ${p.tenantId}`,
      invoice: p => p.invoiceNumber,
      method: p => this.methodLabel(p.method),
      stripe: p => p.providerPaymentId,
      amount: { value: p => p.amount, kind: 'number' },
      state: { value: p => this.paymentState(p).label, kind: 'status', order: ['Declined', 'Rejected', 'To verify', 'Paid', 'Applied'] },
    },
  });
  readonly shownPayments = computed(() => this.paymentSort.apply(this.payments().slice(0, PAYMENTS_SHOWN)));

  ngOnInit(): void { this.load(); }
  setMonths(n: number): void { this.months.set(n); this.load(); }
  /** Another workspace is another scope: its trends load afresh rather than blur over the last one's (owner 2026-10-27). */
  pickWorkspace(id: number | null): void { this.tenantId.set(id); this.trends.set(null); this.load(); }
  monthWord(m: string): string { return monthShort(m); }
  loadPayments(): void {
    const seq = ++this.paymentsSeq;
    this.paymentsError.set(''); this.paymentsLoading.set(true);
    const unread = 'The payments could not be read.';
    this.api.payments(null).subscribe({
      next: r => {
        if (seq !== this.paymentsSeq) return;
        this.paymentsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.paymentsError.set(loadErrorText(r, unread)); return; }
        this.payments.set((r.data ?? []).map(p => ({ ...p, amount: Number(p.amount) })));
      },
      error: err => { if (seq !== this.paymentsSeq) return; this.paymentsLoading.set(false); this.paymentsError.set(loadErrorText(err, unread)); },
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
    // Owner 2026-10-27: a range picked again keeps the trends on screen under a blur; the latest read wins.
    const trendsSeq = ++this.trendsSeq;
    const trendsUnread = 'The cost trends could not be read.';
    this.trendsLoading.set(true); this.trendsError.set('');
    this.api.costTrends(iso(from), iso(to), this.isPlatform() ? this.tenantId() : null).subscribe({
      next: r => {
        if (trendsSeq !== this.trendsSeq) return;
        this.trendsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.trendsError.set(loadErrorText(r, trendsUnread)); this.trends.set(null); return; }
        this.trends.set(r.data ?? null);
      },
      error: err => { if (trendsSeq !== this.trendsSeq) return; this.trendsLoading.set(false); this.trendsError.set(loadErrorText(err, trendsUnread)); },
    });
    if (!this.showRevenue()) { this.revenueSeq++; this.loading.set(false); this.data.set(null); return; }
    // Cross-customer revenue: the platform's alone, over every workspace.
    const revenueSeq = ++this.revenueSeq;
    const revenueUnread = 'The billing analytics could not be read.';
    this.loading.set(true); this.error.set('');
    this.loadPayments();
    this.api.analytics(iso(from), iso(to)).subscribe({
      next: r => {
        if (revenueSeq !== this.revenueSeq) return;
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(loadErrorText(r, revenueUnread)); return; }
        this.data.set(r.data ?? null);
      },
      error: err => { if (revenueSeq !== this.revenueSeq) return; this.loading.set(false); this.error.set(loadErrorText(err, revenueUnread)); },
    });
  }
}
