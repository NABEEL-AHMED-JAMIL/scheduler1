import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from './icon';

/**
 * Said instead of a workspace's page to a sign-in that has no workspace -- a platform administrator's own (console review
 * 2026-10-07, L6): the page reads nothing (every call would answer "Pick a workspace") and points to Work in a workspace,
 * as the workflow pages do.
 */
@Component({
  selector: 'app-needs-workspace',
  imports: [RouterLink, Icon],
  template: `
    <div class="card p-10 flex flex-col items-center text-center gap-2" data-test="needs-workspace">
      <app-icon [name]="icon()" size="1.5rem" class="icon-muted" />
      <p class="text-sm text-[color:var(--text-primary)]">{{ what() }} a workspace's, and this sign-in has none.</p>
      <p class="text-sm text-[color:var(--text-secondary)]">Open the workspace from Work in a workspace to {{ todo() }}.</p>
      <a routerLink="/administration/work-in-workspace" class="btn btn-default btn-sm mt-2"><app-icon name="external" />Work in a workspace</a>
    </div>
  `,
})
export class NeedsWorkspace {
  /** What the page is, with its verb: "The inbox is" (read: "The inbox is a workspace's, and this sign-in has none."). */
  readonly what = input.required<string>();
  /** What the person can do there: "upload files to its inbox". */
  readonly todo = input.required<string>();
  readonly icon = input('layers');
}
