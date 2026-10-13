import { Component, ViewEncapsulation, input } from '@angular/core';

/**
 * UX review 2026-10-12 (A3, G11): a named part of a page or a form. An optional step number (when the order matters,
 * as New schedule's "1 What runs · 2 When it runs"), a title in .section-title -- never the uppercase overline field
 * labels use, so the hierarchy reads page › section › field -- a one-line sub, actions at the right, then the content.
 *
 * `card` draws it as a card of its own; without it the section sits inside whatever card holds it, separated from the
 * one before by a rule.
 */
@Component({
  selector: 'app-section',
  host: { class: 'ui-section', '[class.card]': 'card()', '[class.ui-section-card]': 'card()' },
  // Global on purpose: the rules order and space the content a page projects into it.
  encapsulation: ViewEncapsulation.None,
  styles: `
    .ui-section { display: block; }
    .ui-section-card { padding: 1.25rem; }
    .ui-section + .ui-section:not(.ui-section-card) { border-top: 1px solid var(--border-subtle); padding-top: 1.5rem; margin-top: 1.5rem; }
    .ui-section-head { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 1rem; }
    .ui-section-head .section-title { display: flex; align-items: center; gap: 0.5rem; }
    .ui-section-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; flex: none; }
    .ui-section-actions:empty { display: none; }
    .section-num {
      display: inline-grid; place-items: center; width: 1.375rem; height: 1.375rem; border-radius: 9999px; flex: none;
      font-size: 0.75rem; font-weight: 600; background: var(--surface-sunken); color: var(--text-secondary);
      border: 1px solid var(--border-subtle);
    }
  `,
  template: `
    <header class="ui-section-head">
      <div class="min-w-0 flex-1">
        @switch (level()) {
          @case (3) { <h3 class="section-title">@if (number()) { <span class="section-num">{{ number() }}</span> }{{ title() }}</h3> }
          @default { <h2 class="section-title">@if (number()) { <span class="section-num">{{ number() }}</span> }{{ title() }}</h2> }
        }
        @if (sub()) { <p class="section-sub">{{ sub() }}</p> }
        <ng-content select="[sub]" />
      </div>
      <div class="ui-section-actions"><ng-content select="[section-actions]" /></div>
    </header>
    <ng-content />
  `,
})
export class Section {
  readonly title = input.required<string>();
  readonly sub = input('');
  /** A step number, when the sections are done in order. */
  readonly number = input<number | string | null>(null);
  /** h2 for a page's section, h3 inside a card that already has a heading. */
  readonly level = input<2 | 3>(2);
  readonly card = input(false);
}
