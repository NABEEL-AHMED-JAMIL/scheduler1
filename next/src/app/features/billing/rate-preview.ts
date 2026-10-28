import { Component, computed, input, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { createTableSort } from '../../shared/ui/sort';
import { SortHeader } from '../../shared/ui/sort-header';
import { RatePreview } from './billing.service';
import { formatMoneyExact, formatQuantity, formatUnitPrice, monthShort, yearMonth } from './billing-format';

type PreviewWorkspace = RatePreview['workspaces'][number];
type PreviewChange = PreviewWorkspace['changes'][number];

/**
 * The months a preview may price: last month (the plan's "what last month would have cost") and, for a platform whose
 * last month is empty -- a fresh environment, a new customer -- this month so far.
 */
export function previewPeriods(now = new Date()): { value: string; label: string }[] {
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return [{ value: yearMonth(last), label: `Last month (${monthShort(yearMonth(last))})` },
    { value: yearMonth(now), label: `This month so far (${monthShort(yearMonth(now))})` }];
}

/**
 * Owner #23, step 4: what a month (last month, unless asked) would have cost with a draft -- per workspace, as priced now
 * and as the draft would price it, and the lines that change, each rule's part under its meter. The meter prices it with
 * the same engine that prices the bills, over the month's usage, and writes nothing; an invoice already issued keeps its
 * lines whatever the draft says. Used in the editor (the card being edited) and in a draft's detail (the saved draft).
 */
@Component({
  selector: 'app-rate-preview',
  imports: [Icon, SortHeader],
  template: `
    @if (preview(); as p) {
      <div class="grid grid-cols-3 gap-2 mb-3" data-test="preview-totals">
        <div class="card p-4"><div class="text-[11px] uppercase tracking-wide text-[color:var(--text-muted)]">{{ month() }} as priced now</div>
          <div class="text-lg font-semibold tabular" data-test="preview-current">{{ money(p.current) }}</div></div>
        <div class="card p-4"><div class="text-[11px] uppercase tracking-wide text-[color:var(--text-muted)]">With this card</div>
          <div class="text-lg font-semibold tabular" data-test="preview-draft">{{ money(p.draft) }}</div></div>
        <div class="card p-4"><div class="text-[11px] uppercase tracking-wide text-[color:var(--text-muted)]">Difference</div>
          <div class="text-lg font-semibold tabular" [class.text-crit-500]="p.difference > 0" [class.text-ok-500]="p.difference < 0" data-test="preview-difference">{{ signed(p.difference) }}</div></div>
      </div>
      <p class="text-xs text-[color:var(--text-muted)] mb-2">
        {{ p.workspaces.length }} {{ p.workspaces.length === 1 ? 'workspace' : 'workspaces' }} with usage in {{ month() }}{{ p.tenantId == null && p.onOwnCard ? ' on the default card; ' + p.onOwnCard + (p.onOwnCard === 1 ? ' on a card of its own is' : ' on a card of their own are') + ' not affected' : '' }}.
        Priced by the same engine as the bills; nothing is saved, and an issued invoice never changes.
      </p>
      @if (!p.workspaces.length) {
        <p class="text-sm text-[color:var(--text-secondary)]">No usage in {{ month() }} that this card would price.</p>
      } @else {
        <table class="table-modern" data-test="preview-workspaces">
          <thead><tr><th appSort="workspace" [sortBy]="sort">Workspace</th><th class="text-right" appSort="now" [sortBy]="sort">Now</th><th class="text-right" appSort="draft" [sortBy]="sort">With this card</th><th class="text-right" appSort="difference" [sortBy]="sort">Difference</th><th class="w-8"></th></tr></thead>
          <tbody>
            @for (w of workspaces(); track w.tenantId) {
              <tr class="cursor-pointer hover-brand" (click)="toggle(w.tenantId)" [class.is-open]="open() === w.tenantId">
                <td><div class="font-medium">{{ w.tenantName || 'Workspace ' + w.tenantId }}</div>
                  <div class="text-[11px] text-[color:var(--text-muted)]">now v{{ w.currentVersion }}{{ w.currentName ? ' ' + w.currentName : '' }}@if (w.invoice) { · {{ w.invoice.number }} {{ w.invoice.status }} (kept) }</div></td>
                <td class="text-right tabular">{{ money(w.current) }}</td>
                <td class="text-right tabular">{{ money(w.draft) }}</td>
                <td class="text-right tabular font-medium" [class.text-crit-500]="w.difference > 0" [class.text-ok-500]="w.difference < 0">{{ signed(w.difference) }}</td>
                <td><button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-expanded]="open() === w.tenantId"
                            [attr.aria-label]="'Lines that change for ' + (w.tenantName || 'workspace ' + w.tenantId)" (click)="$event.stopPropagation(); toggle(w.tenantId)">
                  <app-icon [name]="open() === w.tenantId ? 'chevronDown' : 'chevronRight'" size="0.9em" class="icon-muted" /></button></td>
              </tr>
              @if (open() === w.tenantId) {
                <tr class="bg-sunken"><td colspan="5" class="!py-2">
                  @if (!w.changes.length) { <span class="text-xs text-[color:var(--text-muted)]">No line changes.</span> }
                  @else {
                    <table class="table-modern" data-test="preview-changes">
                      <thead><tr><th appSort="line" [sortBy]="changeSort">Line</th><th class="text-right" appSort="quantity" [sortBy]="changeSort">Quantity</th><th class="text-right" appSort="now" [sortBy]="changeSort">Now</th><th class="text-right" appSort="draft" [sortBy]="changeSort">With this card</th></tr></thead>
                      <tbody>
                        @for (c of changeSort.apply(w.changes); track c.meter) {
                          <tr><td>{{ c.label }}<div class="text-[11px] mono text-[color:var(--text-muted)]">{{ c.meter }}</div></td>
                            <td class="text-right tabular">{{ qty(c.quantity, c.meter) }}</td>
                            <td class="text-right tabular">{{ money(c.current) }}</td>
                            <td class="text-right tabular font-medium">{{ money(c.draft) }}</td></tr>
                          @for (r of c.rules; track r.ruleNo) {
                            <tr class="rule-part" data-test="preview-rule"><td class="pl-6 text-xs">↳ {{ r.label }} <span class="text-[color:var(--text-muted)]">· rule {{ r.ruleNo }}</span></td>
                              <td class="text-right tabular text-xs">{{ qty(r.quantity, c.meter) }}</td>
                              <td class="text-right text-xs text-[color:var(--text-muted)]">at {{ r.unitPrice }}</td>
                              <td class="text-right tabular text-xs">{{ money(r.amount) }}</td></tr>
                          }
                        }
                      </tbody>
                    </table>
                  }
                </td></tr>
              }
            }
          </tbody>
        </table>
      }
    }
  `,
})
export class RatePreviewView {
  readonly preview = input<RatePreview | null>(null);
  readonly currency = input('USD');
  readonly open = signal<number | null>(null);
  readonly month = computed(() => { const p = this.preview(); return p ? monthShort(p.period) : ''; });
  /** Owner 2026-10-27: the workspaces and the lines that change sort; the meter's order stays until a heading is picked. */
  readonly sort = createTableSort<PreviewWorkspace>({
    id: 'billing-rate-preview',
    columns: {
      workspace: w => w.tenantName || `Workspace ${w.tenantId}`,
      now: { value: w => Number(w.current), kind: 'number' },
      draft: { value: w => Number(w.draft), kind: 'number' },
      difference: { value: w => Number(w.difference), kind: 'number' },
    },
  });
  readonly workspaces = computed(() => this.sort.apply(this.preview()?.workspaces ?? []));
  readonly changeSort = createTableSort<PreviewChange>({
    id: 'billing-rate-preview-changes',
    columns: {
      line: c => c.label || c.meter,
      quantity: { value: c => Number(c.quantity), kind: 'number' },
      now: { value: c => Number(c.current), kind: 'number' },
      draft: { value: c => Number(c.draft), kind: 'number' },
    },
  });

  toggle(tenantId: number): void { this.open.set(this.open() === tenantId ? null : tenantId); }
  money(v: number): string { return formatMoneyExact(Number(v) || 0, this.currency()); }
  signed(v: number): string { const n = Number(v) || 0; return (n > 0 ? '+' : n < 0 ? '−' : '') + formatMoneyExact(Math.abs(n), this.currency()); }
  qty(q: number, meter: string): string { return formatQuantity(Number(q) || 0, meter.startsWith('storage.bytes') ? 'byte' : undefined); }
  price(p: number, per: number, unit: string): string { return formatUnitPrice(p, per, unit, this.currency()); }
}
