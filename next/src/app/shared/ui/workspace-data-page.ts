import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { PageHeader } from './page-header';
import { NeedsWorkspace } from './needs-workspace';
import type { WorkspaceDataCard } from '../../core/auth/workspace-data';

/**
 * A workspace's page as the platform administrator's own sign-in meets it (ZT-A12 follow-up, owner 2026-10-21 "Managed
 * session only"): the page's title and its hub's tabs, and the needs-workspace card in place of its content. Nothing is
 * read. Shown by the card route withWorkspaceCards (core/auth/workspace-data.ts) puts in front of every route marked
 * `data.workspaceData`.
 */
@Component({
  selector: 'app-workspace-data-page',
  imports: [PageHeader, NeedsWorkspace],
  template: `
    <div class="page" data-test="workspace-data-page">
      <app-page-header [title]="title()" />
      @if (card(); as c) {
        <app-needs-workspace [what]="c.what" [todo]="c.todo" [icon]="c.icon || 'layers'" />
      }
    </div>
  `,
})
export class WorkspaceDataPage {
  private readonly route = inject(ActivatedRoute);
  readonly card = toSignal(this.route.data.pipe(map(d => (d['workspaceData'] as WorkspaceDataCard | undefined) ?? null)),
    { initialValue: (this.route.snapshot.data['workspaceData'] as WorkspaceDataCard | undefined) ?? null });
  readonly title = toSignal(this.route.title.pipe(map(t => t ?? '')), { initialValue: this.route.snapshot.title ?? '' });
}
