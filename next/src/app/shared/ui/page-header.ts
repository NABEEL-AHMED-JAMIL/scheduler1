import { Component, ViewEncapsulation, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Crumb, crumbsFor } from '../../core/nav/nav-tree';

/**
 * UX review 2026-10-12 (A2, G1, G3): every page's header, one component.
 *
 *   Run & review › Runs › Run #8214                                    <- breadcrumb row, always (from the menu's tree)
 *   Run #8214 · Patient 360  [Completed] [v2]        [↻] [secondary] [⋮] [Primary]
 *   One line saying what this is.                                      <- subtitle, at most two lines
 *   owner · updated 17:27 · version 2                                   <- [meta]
 *
 * The title is the object's name on a detail or editor page. Pills go in `[pills]` right after it. Everything else
 * projected (buttons, links, a select) is the actions group on the title's line, right-aligned, in a fixed order that
 * the stylesheet enforces whatever the template's order: Refresh (`app-refresh-button`) first, then the secondary
 * buttons, then a ⋮ overflow (`[data-overflow]`), and the one `.btn-primary` always rightmost.
 *
 * The breadcrumb takes the place of "← Back to …" links, so the title is at the same height on every page. It reads
 * the menu's groups and entries (core/nav/nav-tree.ts) for the current address; `trail` replaces the group and entry
 * part when a page sits somewhere the menu cannot tell (a run reached from its schedule), and `crumb` names the last
 * step when it should differ from the title.
 *
 * The inner markup keeps the classes the pages had (.page-head, h1.page-title, p.page-subtitle), so screens and their
 * tests read the same.
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  host: { class: 'page-header' },
  // Global on purpose: the rules order and space the content a page projects into it.
  encapsulation: ViewEncapsulation.None,
  styles: `
    .page-header { display: block; }
    /* The breadcrumb row is always there, one line high, so every title sits at the same height. */
    .breadcrumbs { margin-bottom: 0.375rem; min-height: 1.25rem; font-size: 0.75rem; line-height: 1.25rem; color: var(--text-muted); }
    .breadcrumbs ol { display: flex; flex-wrap: wrap; align-items: center; margin: 0; padding: 0; list-style: none; min-width: 0; }
    .breadcrumbs li { display: inline-flex; align-items: center; min-width: 0; }
    .breadcrumbs li + li::before { content: "›"; padding-inline: 0.375rem; color: var(--text-muted); }
    .breadcrumbs li:last-child span { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40rem; }
    .breadcrumbs a { color: var(--text-muted); }
    .breadcrumbs a:hover { color: var(--text-primary); text-decoration: underline; text-underline-offset: 2px; }
    /* The actions sit on the title's line, not on the subtitle's last line. */
    .page-head.is-header { align-items: flex-start; }
    .page-head-title { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; }
    .page-head-title > .page-title { min-width: 0; overflow-wrap: anywhere; }
    .page-head-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; min-height: 2rem; }
    .page-head-actions:empty { display: none; }
    /* The fixed order (A2, G3): Refresh first, the secondary buttons, the overflow, and the one primary rightmost --
       whatever order a template writes them in. A wrapper the template keeps (a div of buttons) is laid out the same. */
    .page-head-actions > div:not([data-overflow]) { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; }
    .page-head-actions .refresh-btn { order: -1; }
    .page-head-actions > [data-overflow], .page-head-actions > div > [data-overflow] { order: 9; }
    .page-head-actions > .btn-primary, .page-head-actions > div > .btn-primary { order: 10; }
    .page-head-actions .input { width: auto; }
  `,
  template: `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        @for (c of crumbs(); track $index; let last = $last) {
          <li>
            @if (c.link && !last) {
              <a [routerLink]="c.link" [queryParams]="c.query ?? null">{{ c.label }}</a>
            } @else {
              <span [attr.aria-current]="last ? 'page' : null">{{ c.label }}</span>
            }
          </li>
        }
      </ol>
    </nav>
    <div class="page-head is-header">
      <div class="page-head-main">
        <div class="page-head-title">
          <h1 class="page-title">{{ title() }}</h1>
          <ng-content select="[pills]" />
        </div>
        @if (subtitle()) { <p class="page-subtitle">{{ subtitle() }}</p> }
        <ng-content select="[subtitle]" />
        <ng-content select="[meta]" />
      </div>
      <div class="page-head-actions"><ng-content /></div>
    </div>
  `,
})
export class PageHeader {
  /** The page's name: the object's name on a detail or editor page ("Brain tumour MRI grading", not "Edit pipeline"). */
  readonly title = input.required<string>();
  /** One line, at most two, saying what the page is for. Longer explanations go in a section's sub-line. */
  readonly subtitle = input('');
  /**
   * The breadcrumb's last step when it should read differently from the title. Also marks the page as a detail on its
   * list's own address (a dashboard's board): the step is added after the list's entry.
   */
  readonly crumb = input('');
  /** The steps before the last, when the menu's tree is not where this page sits. */
  readonly trail = input<Crumb[] | null>(null);

  private readonly router = inject(Router);
  private readonly url = signal(this.router.url);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) this.url.set(event.urlAfterRedirects);
    });
  }

  readonly crumbs = computed<Crumb[]>(() => {
    const last = this.crumb() || this.title();
    const trail = this.trail();
    if (trail) return [...trail, { label: last }];
    return crumbsFor(this.url(), last, !!this.crumb());
  });
}
