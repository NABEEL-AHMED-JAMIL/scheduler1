import { Component, DestroyRef, ElementRef, ViewEncapsulation, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { Crumb, crumbsFor, tabAt } from '../../core/nav/nav-tree';
import { TabHub } from './tab-hub';

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
  imports: [TabHub],
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
    .page-header > .page-head { align-items: flex-start; }
    .page-head-title { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; }
    .page-head-title > .page-title { min-width: 0; overflow-wrap: anywhere; }
    .page-head-actions,
    .page-header > .page-head > div:last-child:not(:first-child) {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; min-height: 2rem;
    }
    .page-head-actions:empty { display: none; }
    /* The fixed order (A2, G3): Refresh first, the secondary buttons, the overflow, and the one primary rightmost --
       whatever order a template writes them in. A wrapper the template keeps (a div of buttons) is laid out the same. */
    .page-head-actions > div:not([data-overflow]) { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; }
    .page-head-actions > .refresh-host, .page-header > .page-head > div:last-child:not(:first-child) > .refresh-host { order: -1; }
    .page-header :is(.page-head-actions, .page-head > div:last-child:not(:first-child)) > [data-overflow] { order: 9; }
    .page-header :is(.page-head-actions, .page-head > div:last-child:not(:first-child)) > .btn-primary { order: 10; }
    .page-head-actions > div > .btn-primary { order: 10; }
    /* A plain field in the actions sizes to its content; a combobox (the workspace selector) keeps its box's width, or its
       clear button sits outside the shrunken field (owner 2026-10-19, Appearance). */
    .page-head-actions .input:not([role="combobox"]) { width: auto; }
  `,
  template: `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        @for (c of crumbs(); track $index; let last = $last) {
          <li>
            @if (c.link && !last) {
              <a [attr.href]="hrefOf(c)" (click)="go($event, c)">{{ c.label }}</a>
            } @else {
              <span [attr.aria-current]="last ? 'page' : null">{{ c.label }}</span>
            }
          </li>
        }
      </ol>
    </nav>
    <!-- A page that keeps its own heading block wraps it: it is shown as written, under the breadcrumb. -->
    <ng-content select=".page-head" />
    @if (title()) {
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
    }
    <!-- A hub's tabs under the title, on a page that is one of them (the menu's tree says which: tab-hub.ts). -->
    @if (inHub()) { <app-tab-hub [url]="url()" /> }
  `,
})
export class PageHeader {
  /** The page's name: the object's name on a detail or editor page ("Brain tumour MRI grading", not "Edit pipeline"). */
  readonly title = input('');
  /** One line, at most two, saying what the page is for. Longer explanations go in a section's sub-line. */
  readonly subtitle = input('');
  /**
   * The breadcrumb's last step when it should read differently from the title. Also marks the page as a detail on its
   * list's own address (a dashboard's board): the step is added after the list's entry.
   */
  readonly crumb = input('');
  /** The steps before the last, when the menu's tree is not where this page sits. */
  readonly trail = input<Crumb[] | null>(null);

  // Optional: a screen's own unit test often has no router; the header then shows the trail without following the URL.
  private readonly router = inject(Router, { optional: true });
  readonly url = signal(this.router?.url ?? '');
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private readonly destroyRef = inject(DestroyRef);
  /** A wrapped heading block's own h1, read as it renders (it can follow the data: an object's name). */
  private readonly projectedTitle = signal('');

  constructor() {
    this.router?.events?.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) this.url.set(event.urlAfterRedirects);
    });
    // A wrapped heading block's h1 can change after the first render (an object's name arriving): followed with a
    // MutationObserver on the host, which is all it watches.
    afterNextRender(() => {
      const read = () => {
        const h1 = this.host.querySelector(':scope > .page-head h1');
        // The name only: a pill or a status written inside the heading is not part of it.
        const name = h1?.cloneNode(true) as HTMLElement | undefined;
        name?.querySelectorAll('.pill, app-status, app-sensitivity, [pills]').forEach(el => el.remove());
        const text = (name?.textContent ?? '').replace(/\s+/g, ' ').replace(/\s*[—–-]\s*$/, '').trim();
        if (text !== this.projectedTitle()) this.projectedTitle.set(text);
      };
      read();
      if (typeof MutationObserver === 'undefined') return;
      const observer = new MutationObserver(read);
      observer.observe(this.host, { subtree: true, childList: true, characterData: true });
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Whether the address is one of a hub's tabs: only then is the strip (and what it injects) created. */
  readonly inHub = computed(() => !!tabAt(this.url()));

  readonly crumbs = computed<Crumb[]>(() => {
    const last = this.crumb() || this.title() || this.projectedTitle();
    const trail = this.trail();
    if (trail) return [...trail, { label: last }];
    return crumbsFor(this.url(), last, !!this.crumb());
  });

  /** A crumb's address: a plain link, so it opens in a new tab like any other. */
  hrefOf(c: Crumb): string {
    const query = c.query ? '?' + new URLSearchParams(c.query).toString() : '';
    return (c.link ?? '') + query;
  }

  /** Followed inside the app (no reload) unless the reader asked for a new tab or window. */
  go(event: MouseEvent, c: Crumb): void {
    if (!this.router || !c.link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void this.router.navigate([c.link], { queryParams: c.query ?? {} });
  }
}
