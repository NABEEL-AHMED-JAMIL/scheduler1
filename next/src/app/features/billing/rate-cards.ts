import { ReceiptStampSettings } from './receipt-stamp-settings';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_SUCCESS } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { StatTile } from '../../shared/ui/stat-tile';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { forkJoin } from 'rxjs';
import { BillingApi, RateCard, RateCardDraftRow, RateItem, RatePreview, RateRule } from './billing.service';
import { formatQuantity, formatUnitPrice, localIsoDate } from './billing-format';
import { RateCardEditor, RateCardEditorData, RateCardEditorResult } from './rate-card-editor';
import { byPrecedence, kindText, matchText } from './rate-rules';
import { RatePreviewView, previewPeriods } from './rate-preview';
import { confirmWith } from '../../shared/ui/confirm';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';

/**
 * Billing › Settings (owner #23, 2026-10-19; before, Platform › Rate cards), platform administrators only.
 *
 * Rate cards: the calculation behind every bill, kept as versions. The default card prices
 * every workspace that has none of its own; a workspace's card wins for it from the day it
 * takes effect. A bill is priced with the version in effect when its period started and
 * names it, so changing the calculation never changes a bill already drafted.
 *
 * Owner #23: a version may carry pricing rules -- a meter's own price for one pipeline, the pipelines with a tag, or a
 * data class. A new version is prepared as a draft (it prices nothing), previewed against last month, then published;
 * a published version is never edited.
 */
@Component({
  selector: 'app-rate-cards',
  imports: [RefreshButton, PageHeader, Icon, StatTile, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, ReceiptStampSettings, RatePreviewView, NgTemplateOutlet],
  templateUrl: './rate-cards.html',
})
export class RateCards implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  readonly directory = inject(WorkspaceDirectory);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly cards = signal<RateCard[]>([]);
  readonly selectedVersion = signal<number | null>(null);
  /** Owner #23: the versions being prepared, and the one picked (a draft and a version are never both picked). */
  readonly drafts = signal<RateCardDraftRow[]>([]);
  readonly selectedDraftId = signal<number | null>(null);
  readonly selectedDraft = computed(() => this.drafts().find(d => d.draft_id === this.selectedDraftId()) ?? null);
  readonly preview = signal<RatePreview | null>(null);
  readonly periods = previewPeriods();
  readonly previewPeriod = signal(this.periods[0].value);
  readonly previewing = signal(false);
  readonly previewError = signal('');
  readonly busy = signal(false);
  readonly scope = signal<'all' | 'default' | 'workspace'>('all');
  readonly search = signal('');
  /** The viewer's own day: an ISO string is UTC, and by evening in the Americas it already says tomorrow. */
  readonly todayIso = localIsoDate();

  readonly selected = computed(() => this.cards().find(c => c.version === this.selectedVersion()) ?? null);
  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase(), s = this.scope();
    return this.cards().filter(c => (s === 'all' || (s === 'default') === (c.tenant_id == null))
      && (!q || `${c.name} v${c.version} ${c.tenantName ?? ''} ${c.note ?? ''}`.toLowerCase().includes(q)));
  });
  readonly visibleDrafts = computed(() => {
    const q = this.search().trim().toLowerCase(), s = this.scope();
    return this.drafts().filter(d => (s === 'all' || (s === 'default') === (d.tenant_id == null))
      && (!q || `${d.name} draft ${d.tenantName ?? ''} ${d.card?.note ?? ''}`.toLowerCase().includes(q)));
  });
  /** The default card that prices today, and the workspaces on a card of their own today. */
  readonly today = computed(() => {
    const today = this.todayIso;
    const inEffect = (cs: RateCard[]) => cs.filter(c => c.effective_from <= today).sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.version - a.version)[0] ?? null;
    const byTenant = new Map<number, RateCard[]>();
    for (const c of this.cards()) if (c.tenant_id != null) byTenant.set(c.tenant_id, [...(byTenant.get(c.tenant_id) ?? []), c]);
    const own: RateCard[] = [];
    for (const cs of byTenant.values()) { const c = inEffect(cs); if (c) own.push(c); }
    return { defaultCard: inEffect(this.cards().filter(c => c.tenant_id == null)), own };
  });
  readonly upcoming = computed(() => this.cards().filter(c => c.effective_from > this.todayIso).length);

  ngOnInit(): void {
    this.directory.load().subscribe(() => this.load());
  }

  load(keep = this.selectedVersion(), keepDraft = this.selectedDraftId()): void {
    this.loading.set(true); this.error.set('');
    forkJoin({ cards: this.api.rateCards(), drafts: this.api.rateCardDrafts() }).subscribe({
      next: ({ cards: r, drafts: d }) => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        const cards = (r.data?.cards ?? []).map(RateCards.numeric);
        this.cards.set(cards);
        // Drafts that cannot be read leave the versions standing: the list says so instead of failing.
        this.drafts.set(d.status === API_SUCCESS ? d.data?.drafts ?? [] : []);
        if (keepDraft != null && this.drafts().some(x => x.draft_id === keepDraft)) {
          this.selectDraft(this.drafts().find(x => x.draft_id === keepDraft)!);
          return;
        }
        this.selectedDraftId.set(null);
        this.selectedVersion.set(keep != null && cards.some(c => c.version === keep) ? keep : (this.today().defaultCard?.version ?? cards[0]?.version ?? null));
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the rate cards.'); },
    });
  }

  static numeric(c: RateCard): RateCard {
    return { ...c, items: (c.items ?? []).map(i => ({ ...i, per: Number(i.per) || 1, unit_price: Number(i.unit_price), included_quantity: Number(i.included_quantity) || 0,
      tiers: (i.tiers ?? []).map(t => ({ from: Number(t.from), unit_price: Number(t.unit_price) })) })),
      rules: (c.rules ?? []).map(r => ({ ...r, rule_no: Number(r.rule_no), unit_price: Number(r.unit_price) })) };
  }

  select(c: RateCard): void { this.selectedVersion.set(c.version); this.selectedDraftId.set(null); this.clearPreview(); }
  selectVersion(v: number): void { this.selectedVersion.set(v); this.selectedDraftId.set(null); this.clearPreview(); }
  selectDraft(d: RateCardDraftRow): void { this.selectedDraftId.set(d.draft_id); this.selectedVersion.set(null); this.clearPreview(); }
  private clearPreview(): void { this.preview.set(null); this.previewError.set(''); this.previewing.set(false); }

  // ---- pricing rules (owner #23) ----

  /** A version's rules, in the order usage is matched against them. */
  rulesOf(rules: RateRule[] | undefined): RateRule[] { return byPrecedence(rules ?? []); }
  kindLabel(r: RateRule): string { return kindText(r.match_kind); }
  /** What a rule matches: a pipeline by its note (the name the editor took from Core) and id, a tag, a data class. */
  matchLabel(r: RateRule): string { return matchText(r, r.match_kind === 'PIPELINE' ? r.note : null); }
  /** What a rule matches without its kind (the pill beside it says that): "X-ray triage (#1933)", "research". */
  matchValue(r: RateRule): string { return r.match_kind === 'PIPELINE' && r.note ? `${r.note} (#${r.match_value})` : r.match_kind === 'PIPELINE' ? `#${r.match_value}` : r.match_value; }
  /** The rule's price beside the card's own for its meter. */
  rulePrice(r: RateRule, items: RateItem[], currency: string): string {
    const it = items.find(i => i.meter === r.meter);
    return it ? formatUnitPrice(Number(r.unit_price), it.per, it.unit, currency) : String(r.unit_price);
  }
  itemPrice(meter: string, items: RateItem[], currency: string): string {
    const it = items.find(i => i.meter === meter);
    return !it ? '—' : it.tiers?.length ? 'Tiered' : this.price(it, currency);
  }
  meterLabel(meter: string, items: RateItem[]): string { return items.find(i => i.meter === meter)?.label ?? meter; }

  /** A draft's items as the page shows a version's: labels and services from the version it was drafted from. */
  draftItems(d: RateCardDraftRow): RateItem[] {
    const base = this.cards().find(c => c.version === d.based_on_version);
    const named = new Map((base?.items ?? []).map(i => [i.meter, i]));
    return (d.card?.items ?? []).map(i => ({ ...named.get(i.meter), ...i, label: named.get(i.meter)?.label ?? i.meter,
      service: named.get(i.meter)?.service ?? 'Other', per: Number(i.per) || 1, unit_price: Number(i.unit_price), included_quantity: Number(i.included_quantity) || 0,
      tiers: (i.tiers ?? []).map(t => ({ from: Number(t.from), unit_price: Number(t.unit_price) })) }));
  }
  draftForLabel(d: RateCardDraftRow): string { return d.tenant_id == null ? 'Every workspace' : (d.tenantName ?? `Workspace ${d.tenant_id}`); }
  draftGroups(d: RateCardDraftRow): { service: string; items: RateItem[] }[] { return this.groups({ items: this.draftItems(d) } as RateCard); }

  /** The draft opened in the editor: changes save to the same draft; "Save version" publishes it. */
  editDraft(d: RateCardDraftRow): void {
    const base = this.cards().find(c => c.version === d.based_on_version) ?? this.today().defaultCard;
    if (!base) { this.toast.error('The version this draft was made from is not listed.'); return; }
    const data: RateCardEditorData = { base, draft: d, workspaces: this.directory.workspaces().map(w => ({ value: String(w.tenantId), label: this.directory.nameOf(w.tenantId) })) };
    this.dialog.open<RateCardEditorResult>(RateCardEditor, sidePanelConfig(data, 'wide')).closed.subscribe(saved => this.afterEditor(saved));
  }

  /** What last month would have cost with the picked draft. */
  previewDraft(d: RateCardDraftRow): void {
    this.previewing.set(true); this.previewError.set(''); this.preview.set(null);
    this.api.previewRateCard({ draftId: d.draft_id }, this.previewPeriod()).subscribe({
      next: r => { this.previewing.set(false); if (r.status !== API_SUCCESS || !r.data) { this.previewError.set(r.message); return; } this.preview.set(r.data); },
      error: err => { this.previewing.set(false); this.previewError.set(err?.error?.message || 'The preview could not be priced.'); },
    });
  }

  /** Publishes a draft as a new version, after saying what that does. */
  async publishDraft(d: RateCardDraftRow): Promise<void> {
    const ok = await confirmWith(this.dialog, { title: `Publish ${d.name}?`, confirmLabel: 'Publish version',
      body: `It becomes a new version for ${d.tenant_id == null ? 'every workspace without a card of its own' : this.draftForLabel(d)}, pricing usage from ${d.effective_from}. A published version is never edited, and bills already issued keep the version they name.` });
    if (!ok) return;
    this.busy.set(true);
    this.api.publishRateCardDraft(d.draft_id).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message); return; }
        this.toast.success(`${r.data.name} published as v${r.data.version}.`);
        this.load(r.data.version, null);
      },
      error: err => { this.busy.set(false); this.toast.error(err?.error?.message || 'The draft could not be published.'); },
    });
  }

  async discardDraft(d: RateCardDraftRow): Promise<void> {
    const ok = await confirmWith(this.dialog, { title: `Discard ${d.name}?`, danger: true, confirmLabel: 'Discard draft',
      body: 'The draft goes. It never priced anything, so no bill changes.' });
    if (!ok) return;
    this.api.deleteRateCardDraft(d.draft_id).subscribe({
      next: r => { if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; } this.toast.success('Draft discarded.'); this.load(this.selectedVersion(), null); },
      error: err => this.toast.error(err?.error?.message || 'The draft could not be discarded.'),
    });
  }

  private afterEditor(saved: RateCardEditorResult | undefined): void {
    if (!saved) return;
    if ('draft_id' in saved) this.load(null, saved.draft_id);
    else this.load(saved.version, null);
  }
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
    const data: RateCardEditorData = { base, workspaces: this.directory.workspaces().map(w => ({ value: String(w.tenantId), label: this.directory.nameOf(w.tenantId) })), tenantId };
    this.dialog.open<RateCardEditorResult>(RateCardEditor, sidePanelConfig(data, 'wide')).closed.subscribe(saved => this.afterEditor(saved));
  }

  /**
   * A workspace's own card from a default one. The editor's For box does the choosing: this
   * screen has no workspace picker, so preselecting the one last picked on Invoices or
   * Documents started the card for a workspace nobody chose here.
   */
  forOneWorkspace(base: RateCard): void { this.newVersion(base, null); }
}
