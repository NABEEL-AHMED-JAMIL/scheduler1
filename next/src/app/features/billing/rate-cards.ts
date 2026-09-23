import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_SUCCESS } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { BillingApi, RateCard, RateItem } from './billing.service';
import { formatQuantity, formatUnitPrice } from './billing-format';
import { RateCardEditor, RateCardEditorData } from './rate-card-editor';
import { WorkspacePicker } from './workspace-picker';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';

/**
 * Rate cards: the calculation behind every bill, kept as versions. The default card prices
 * every workspace that has none of its own; a workspace's card wins for it from the day it
 * takes effect. A bill is priced with the version in effect when its period started and
 * names it, so changing the calculation never changes a bill already drafted.
 */
@Component({
  selector: 'app-rate-cards',
  imports: [Icon, StatTile, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './rate-cards.html',
})
export class RateCards implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  readonly workspaces = inject(WorkspacePicker);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly cards = signal<RateCard[]>([]);
  readonly selectedVersion = signal<number | null>(null);
  readonly scope = signal<'all' | 'default' | 'workspace'>('all');
  readonly search = signal('');
  readonly todayIso = new Date().toISOString().slice(0, 10);

  readonly selected = computed(() => this.cards().find(c => c.version === this.selectedVersion()) ?? null);
  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase(), s = this.scope();
    return this.cards().filter(c => (s === 'all' || (s === 'default') === (c.tenant_id == null))
      && (!q || `${c.name} v${c.version} ${c.tenantName ?? ''} ${c.note ?? ''}`.toLowerCase().includes(q)));
  });
  /** The default card that prices today, and the workspaces on a card of their own today. */
  readonly today = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    const inEffect = (cs: RateCard[]) => cs.filter(c => c.effective_from <= today).sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.version - a.version)[0] ?? null;
    const byTenant = new Map<number, RateCard[]>();
    for (const c of this.cards()) if (c.tenant_id != null) byTenant.set(c.tenant_id, [...(byTenant.get(c.tenant_id) ?? []), c]);
    const own: RateCard[] = [];
    for (const cs of byTenant.values()) { const c = inEffect(cs); if (c) own.push(c); }
    return { defaultCard: inEffect(this.cards().filter(c => c.tenant_id == null)), own };
  });
  readonly upcoming = computed(() => { const today = new Date().toISOString().slice(0, 10); return this.cards().filter(c => c.effective_from > today).length; });

  ngOnInit(): void {
    this.workspaces.ready(() => this.load());
  }

  load(keep = this.selectedVersion()): void {
    this.loading.set(true); this.error.set('');
    this.api.rateCards().subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        const cards = (r.data?.cards ?? []).map(RateCards.numeric);
        this.cards.set(cards);
        this.selectedVersion.set(keep != null && cards.some(c => c.version === keep) ? keep : (this.today().defaultCard?.version ?? cards[0]?.version ?? null));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the rate cards.'); },
    });
  }

  static numeric(c: RateCard): RateCard {
    return { ...c, items: (c.items ?? []).map(i => ({ ...i, per: Number(i.per) || 1, unit_price: Number(i.unit_price), included_quantity: Number(i.included_quantity) || 0,
      tiers: (i.tiers ?? []).map(t => ({ from: Number(t.from), unit_price: Number(t.unit_price) })) })) };
  }

  select(c: RateCard): void { this.selectedVersion.set(c.version); }
  selectVersion(v: number): void { this.selectedVersion.set(v); }
  setScope(s: 'all' | 'default' | 'workspace'): void { this.scope.set(this.scope() === s ? 'all' : s); }
  forLabel(c: RateCard): string { return c.tenant_id == null ? 'Every workspace' : (c.tenantName ?? `Workspace ${c.tenant_id}`); }
  isInEffect(c: RateCard): boolean { return c.tenant_id == null ? this.today().defaultCard?.version === c.version : this.today().own.some(o => o.version === c.version); }

  /** Items grouped by service, the way the usage page and the invoice list them. */
  groups(c: RateCard): { service: string; items: RateItem[] }[] {
    const by = new Map<string, RateItem[]>();
    for (const i of c.items) by.set(i.service ?? 'Other', [...(by.get(i.service ?? 'Other') ?? []), i]);
    return [...by.entries()].map(([service, items]) => ({ service, items }));
  }
  /** What changed against the card this one was drafted from -- the meters, for the list. */
  changedAgainstBase(c: RateCard): string[] {
    const base = c.based_on_version == null ? null : this.cards().find(b => b.version === c.based_on_version);
    if (!base) return [];
    const key = (i: RateItem) => JSON.stringify([i.unit_price, i.per, i.included_quantity ?? 0, i.tiers ?? []]);
    const before = new Map(base.items.map(i => [i.meter, key(i)]));
    return c.items.filter(i => before.get(i.meter) !== key(i)).map(i => i.label ?? i.meter);
  }

  price(i: RateItem, currency: string): string { return formatUnitPrice(i.unit_price, i.per, i.unit, currency); }
  units(i: RateItem, q: number): string { return formatQuantity(q, i.unit); }
  tierText(i: RateItem, currency: string): string[] {
    const tiers = [...(i.tiers ?? [])].sort((a, b) => a.from - b.from);
    return tiers.map((t, k) => `${this.units(i, t.from)}${tiers[k + 1] ? ' – ' + this.units(i, tiers[k + 1].from) : ' and up'}: ${this.price({ ...i, unit_price: t.unit_price }, currency)}`);
  }

  /** A new version, drafted from the selected card (or the default in effect) for the picked scope. */
  newVersion(base: RateCard | null = this.selected() ?? this.today().defaultCard, tenantId: number | null = base?.tenant_id ?? null): void {
    if (!base) { this.toast.error('No rate card to start from.'); return; }
    const data: RateCardEditorData = { base, workspaces: this.workspaces.options(), tenantId };
    this.dialog.open<RateCard | null>(RateCardEditor, sidePanelConfig(data, 'wide')).closed.subscribe(saved => { if (saved) this.load(saved.version); });
  }
}
