import { Component } from '@angular/core';
import { DOCS, scrollToFragments } from './developer-docs';
import { GuideBody } from './guide-body';
import { parseGuide, withoutTitle } from './guide-markdown';

/** MIG-336: the customer API's changelog (etl-platform docs/api/CHANGELOG.md), newest first. */
@Component({
  selector: 'app-developer-changelog',
  imports: [GuideBody],
  template: `
    <article class="page max-w-4xl" data-changelog>
      <div class="page-head">
        <div>
          <h1 class="page-title">Changelog</h1>
          <p class="page-subtitle">What changed in the API (/v1), newest first. A breaking change goes to a new version.</p>
        </div>
      </div>
      <app-guide-body [blocks]="blocks" />
    </article>
  `,
})
export class DeveloperChangelog {
  readonly blocks = withoutTitle(parseGuide(DOCS.changelog));

  constructor() {
    scrollToFragments();
  }
}
