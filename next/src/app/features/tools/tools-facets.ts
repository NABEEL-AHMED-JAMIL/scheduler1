import { Component, input, output } from '@angular/core';

/** One choice of a facet: its value as the API takes it, its words, and the server's count. */
export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/** A facet of a tools list: Status, From, Made by, Speakers, Language. */
export interface FacetGroup {
  key: string;
  title: string;
  options: FacetOption[];
}

/** The facets picked: facet key to the values on. */
export type FacetPicks = Readonly<Record<string, readonly string[]>>;

/** The picks with one value turned on or off. */
export function togglePick(picks: FacetPicks, key: string, value: string): FacetPicks {
  const now = picks[key] ?? [];
  return { ...picks, [key]: now.includes(value) ? now.filter(v => v !== value) : [...now, value] };
}

/**
 * The options a facet shows: every value it always has (a status), then those the server counted, then any picked value it
 * no longer counts (shown with 0, so it can be taken back) -- as the Report library's facets do.
 */
export function facetOptions(counts: Readonly<Record<string, number>> | null | undefined, labels: Readonly<Record<string, string>>,
                             picked: readonly string[], always: readonly string[] = [], labelOf?: (value: string) => string): FacetOption[] {
  const c = counts ?? {};
  const word = (v: string) => labels[v] ?? labelOf?.(v) ?? v;
  const order = [...always, ...Object.keys(labels).filter(v => !always.includes(v)), ...Object.keys(c).filter(v => !(v in labels))];
  const shown = order.filter((v, i) => order.indexOf(v) === i && (always.includes(v) || (c[v] ?? 0) > 0 || picked.includes(v)));
  for (const v of picked) if (!shown.includes(v)) shown.push(v);
  return shown.map(value => ({ value, label: word(value), count: c[value] ?? 0 }));
}

/**
 * The facets rail of the tools lists (tools Option A, owner 2026-11-02; as the Report library's): each facet's choices with
 * the server's count, a check box each. Says what was picked; the page reads the list again.
 */
@Component({
  selector: 'app-tools-facets',
  host: { class: 'tx-facets', role: 'group', 'aria-label': 'Filters' },
  styles: `
    :host { display: block; padding: 0.625rem 0; }
    .tx-fg { padding: 0.5rem 0.875rem 0.625rem; }
    .tx-fh { margin: 0 0 0.375rem; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); }
    .tx-fo { display: flex; align-items: center; gap: 0.5rem; padding: 0.1875rem 0; font-size: 0.8125rem; cursor: pointer; min-width: 0; }
    .tx-fo > input { flex: none; }
    .tx-fl { flex: 1 1 auto; min-width: 0; }
    .tx-fo b { flex: none; font-weight: 400; font-size: 0.75rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .tx-fo-on { font-weight: 500; }
    .tx-fo-none .tx-fl { color: var(--text-muted); }
    .tx-fnone { margin: 0; font-size: 0.8125rem; color: var(--text-muted); }
  `,
  template: `
    @for (g of groups(); track g.key) {
      <section class="tx-fg" [attr.aria-labelledby]="'fh-' + g.key" [attr.data-facet]="g.key">
        <h2 class="tx-fh" [id]="'fh-' + g.key">{{ g.title }}</h2>
        @for (o of g.options; track o.value) {
          <label class="tx-fo" [class.tx-fo-on]="isOn(g.key, o.value)" [class.tx-fo-none]="!o.count" [attr.data-option]="o.value">
            <input type="checkbox" class="checkbox" [checked]="isOn(g.key, o.value)" [attr.aria-label]="o.label + ', ' + o.count"
                   (change)="toggle.emit({ key: g.key, value: o.value })" />
            <span class="tx-fl">{{ o.label }}</span><b>{{ o.count }}</b>
          </label>
        } @empty { <p class="tx-fnone">None</p> }
      </section>
    }
  `,
})
export class ToolsFacets {
  readonly groups = input.required<FacetGroup[]>();
  readonly picks = input.required<FacetPicks>();
  readonly toggle = output<{ key: string; value: string }>();

  isOn(key: string, value: string): boolean {
    return (this.picks()[key] ?? []).includes(value);
  }
}
