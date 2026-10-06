import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { DOCS, Guide, scrollToFragments } from './developer-docs';
import { GuideBody } from './guide-body';
import { GuideBlock, PORTAL, parseGuide, withoutTitle } from './guide-markdown';

/**
 * MIG-336: one guide of the developer portal (etl-platform docs/api/guides/<file>.md), drawn from its markdown, with the
 * guides before and after it at the foot.
 */
@Component({
  selector: 'app-developer-guide',
  imports: [RouterLink, Icon, GuideBody],
  template: `
    @if (guide(); as g) {
      <article class="page max-w-4xl" [attr.data-guide]="g.slug">
        <div class="page-head">
          <div>
            <h1 class="page-title">{{ g.title }}</h1>
            @if (g.summary) { <p class="page-subtitle">{{ g.summary }}</p> }
          </div>
        </div>
        <app-guide-body [blocks]="blocks()" />
        <nav class="flex flex-wrap justify-between gap-3 border-t border-subtle pt-4 mt-8" aria-label="More guides">
          @if (previous(); as p) {
            <a class="btn btn-default btn-sm" [routerLink]="portal + '/guides/' + p.slug" data-guide-previous>
              <app-icon name="arrowLeft" />{{ p.title }}
            </a>
          } @else { <span></span> }
          @if (next(); as n) {
            <a class="btn btn-default btn-sm" [routerLink]="portal + '/guides/' + n.slug" data-guide-next>
              {{ n.title }}<app-icon name="arrowRight" />
            </a>
          }
        </nav>
      </article>
    } @else {
      <div class="card p-8 text-center" data-guide-missing>
        <p class="font-medium">There is no guide called "{{ slug() }}".</p>
        <a class="md-link text-sm mt-2 inline-block" [routerLink]="portal">Back to the developer portal</a>
      </div>
    }
  `,
})
export class DeveloperGuide {
  /** The route's :slug (component input binding). */
  readonly slug = input<string>('');
  readonly portal = PORTAL;

  private readonly index = computed(() => DOCS.guides.findIndex(g => g.slug === this.slug()));
  readonly guide = computed<Guide | null>(() => DOCS.guides[this.index()] ?? null);
  readonly blocks = computed<GuideBlock[]>(() => withoutTitle(parseGuide(this.guide()?.markdown ?? '')));
  readonly previous = computed<Guide | null>(() => this.index() > 0 ? DOCS.guides[this.index() - 1] : null);
  readonly next = computed<Guide | null>(() => this.index() >= 0 ? DOCS.guides[this.index() + 1] ?? null : null);

  constructor() {
    scrollToFragments();
  }
}
