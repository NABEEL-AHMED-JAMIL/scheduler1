import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { Bar, BarChart } from '../../shared/charts/bar-chart';
import { chartColor } from '../../shared/charts/status-color';
import { WorkspacePicker } from './workspace-picker';
import { BillingApi, BillingAnalytics as Analytics, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from './billing.service';
import { formatBytes, formatMoney, formatMoneyRound } from './billing-format';

/** The platform's view: invoiced, collected, open and overdue across every workspace, and who churns data. */
@Component({
  selector: 'app-billing-analytics',
  imports: [Icon, StatTile, BarChart, RouterLink, DecimalPipe],
  templateUrl: './billing-analytics.html',
})
export class BillingAnalyticsPage implements OnInit {
  private readonly api = inject(BillingApi);
  readonly workspaces = inject(WorkspacePicker);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly months = signal(6);
  readonly data = signal<Analytics | null>(null);
  readonly statusLabel = INVOICE_STATUS_LABEL;
  readonly statusTone = INVOICE_STATUS_TONE;

  readonly bars = computed<Bar[]>(() => (this.data()?.months ?? []).map(m => ({
    name: m.month.slice(2), value: Math.round(Number(m.invoiced ?? 0) * 100) / 100,
    segments: [
      { label: 'Collected', value: Math.round(Number(m.collected ?? 0) * 100) / 100, color: chartColor(2) },
      { label: 'Open', value: Math.round((Number(m.invoiced ?? 0) - Number(m.collected ?? 0)) * 100) / 100, color: chartColor(1) },
    ],
  })));
  readonly tenants = computed(() => [...(this.data()?.tenants ?? [])].map(t => ({ ...t, invoiced: Number(t.invoiced), collected: Number(t.collected), open: Number(t.open), overdue: Number(t.overdue) })).sort((a, b) => b.invoiced - a.invoiced));
  readonly churn = computed(() => {
    // A workspace with usage but no invoice yet is still named -- from the workspace list, not the bills.
    const names = new Map<number, string>(this.workspaces.tenants().map(t => [t.tenantId, t.tenantName]));
    for (const t of this.tenants()) names.set(t.tenantId, t.tenantName);
    return (this.data()?.usageByTenant ?? []).map(u => ({ tenantId: u.tenantId, tenantName: names.get(u.tenantId) ?? `Workspace ${u.tenantId}`, amount: Number(u.amount),
      deletedBytes: Number(u.quantityByMeter?.['storage.bytes.deleted'] ?? 0), writtenBytes: Number(u.quantityByMeter?.['storage.bytes.written'] ?? 0), tokens: Number(u.quantityByMeter?.['ai.tokens.in'] ?? 0) + Number(u.quantityByMeter?.['ai.tokens.out'] ?? 0) }))
      .sort((a, b) => b.deletedBytes - a.deletedBytes);
  });
  readonly collectedShare = computed(() => { const d = this.data(); return d && Number(d.invoiced) > 0 ? Math.round(Number(d.collected) / Number(d.invoiced) * 100) : 0; });
  readonly money = (v: number) => formatMoneyRound(v);
  readonly money2 = (v: number) => formatMoney(v);
  fmtBytes(b: number): string { return formatBytes(b); }

  ngOnInit(): void { this.workspaces.ready(() => this.load()); }
  setMonths(n: number): void { this.months.set(n); this.load(); }
  load(): void {
    this.loading.set(true); this.error.set('');
    const to = new Date(); const from = new Date(to.getFullYear(), to.getMonth() - (this.months() - 1), 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.api.analytics(iso(from), iso(to)).subscribe({
      next: r => { this.loading.set(false); if (r.status !== API_SUCCESS) { this.error.set(r.message); return; } this.data.set(r.data ?? null); },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read billing analytics.'); },
    });
  }
}
