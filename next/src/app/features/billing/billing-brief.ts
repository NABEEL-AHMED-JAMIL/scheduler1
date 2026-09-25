import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { BillingApi, BillingSummary, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from './billing.service';
import { daysOverdue, formatMoney } from './billing-format';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';

/**
 * The bill in one glance, wherever a person lands before Billing: this month so far, what is
 * owed and by when, a slip waiting. Shown to admins only (the API refuses everyone else), and
 * quietly absent when the console has no meter or the person's workspace has nothing yet.
 */
@Component({
  selector: 'app-billing-brief',
  imports: [Icon, RouterLink, ServerTimePipe],
  template: `
    @if (auth.isTenantAdmin() && hasSomething() && summary(); as s) {
      <div class="card p-4" [class.chart-card]="!compact()">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h3 class="text-sm font-semibold">{{ auth.isPlatformAdmin() ? 'Billing, every workspace' : 'Your bill' }}</h3>
          <a routerLink="/billing/usage" class="btn btn-ghost btn-sm"><app-icon name="chart" size="0.9em" />Cost &amp; usage</a>
        </div>
        <dl class="billing-brief">
          <div><dt>This month so far</dt><dd class="tabular">{{ money(s.monthToDate, s.currency) }}</dd>
            <dd class="billing-brief-sub">{{ s.meterDown ? 'the meter did not answer' : s.rateCardName ? s.rateCardName + ' v' + s.rateCardVersion : 'from the meter' }}</dd></div>
          <div><dt>Owed</dt><dd class="tabular" [class.text-crit-500]="s.overdueCount > 0">{{ money(s.openBalance, s.currency) }}</dd>
            <dd class="billing-brief-sub">{{ s.openCount ? s.openCount + ' open invoice' + (s.openCount === 1 ? '' : 's') : 'nothing outstanding' }}@if (s.overdueCount) { · <span class="text-crit-500">{{ s.overdueCount }} overdue</span> }</dd></div>
          @if (s.nextDueNumber) {
            <div><dt>Next due</dt><dd class="tabular">{{ s.nextDueAt | serverTime: 'd MMM' }}</dd>
              <dd class="billing-brief-sub"><a class="link-inline mono" [routerLink]="['/billing/invoices', s.nextDueNumber]">{{ s.nextDueNumber }}</a> · {{ money(s.nextDueBalance ?? 0, s.currency) }}{{ overdueDays(s.nextDueAt) ? ' · ' + overdueDays(s.nextDueAt) + ' d late' : '' }}</dd></div>
          } @else if (s.latestNumber) {
            <div><dt>Last invoice</dt><dd><span class="pill" [class]="'pill ' + statusTone[s.latestStatus ?? '']">{{ statusLabel[s.latestStatus ?? ''] }}</span></dd>
              <dd class="billing-brief-sub"><a class="link-inline mono" [routerLink]="['/billing/invoices', s.latestNumber]">{{ s.latestNumber }}</a> · {{ money(s.latestTotal ?? 0, s.currency) }}</dd></div>
          }
          @if (s.pendingSlips) {
            <div><dt>{{ auth.isPlatformAdmin() ? 'Slips to verify' : 'Awaiting verification' }}</dt><dd class="tabular">{{ s.pendingSlips }}</dd>
              <dd class="billing-brief-sub"><a class="link-inline" routerLink="/billing/invoices">{{ auth.isPlatformAdmin() ? 'verify in Invoices' : 'a receipt follows' }}</a></dd></div>
          }
        </dl>
      </div>
    }
  `,
  styles: `
    .billing-brief { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.75rem 1rem; margin: 0; }
    .billing-brief dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
    .billing-brief dd { margin: 0; font-size: 1.05rem; font-weight: 600; }
    .billing-brief dd.billing-brief-sub { font-size: 11px; font-weight: 400; color: var(--text-muted); }
  `,
})
export class BillingBrief implements OnInit {
  private readonly api = inject(BillingApi);
  readonly auth = inject(AuthService);
  /** Tighter spacing when it sits in a row of dashboard cards rather than a side column. */
  readonly compact = input(false);
  readonly summary = signal<BillingSummary | null>(null);
  readonly statusLabel = INVOICE_STATUS_LABEL;
  readonly statusTone = INVOICE_STATUS_TONE;
  readonly hasSomething = computed(() => { const s = this.summary(); return !!s && (s.monthToDate > 0 || s.openCount > 0 || s.pendingSlips > 0 || !!s.latestNumber); });

  ngOnInit(): void {
    if (!this.auth.isTenantAdmin()) return;
    this.api.summary().subscribe({
      next: r => { if (r.status !== API_SUCCESS || !r.data) return; const d = r.data; this.summary.set({ ...d, monthToDate: Number(d.monthToDate), openBalance: Number(d.openBalance), overdueBalance: Number(d.overdueBalance), nextDueBalance: d.nextDueBalance == null ? undefined : Number(d.nextDueBalance), latestTotal: d.latestTotal == null ? undefined : Number(d.latestTotal) }); },
      error: () => {},
    });
  }
  money(v: number, currency: string): string { return formatMoney(v, currency); }
  overdueDays(dueAt?: string): number { return daysOverdue(dueAt); }
}
