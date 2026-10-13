import { Component, Injector, inject, viewChild } from '@angular/core';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { EmptyState } from '../../shared/ui/empty-state';
import { ReviewWaiting } from '../jobs/history/review-waiting';
import { TaskCountService } from '../workflows/task-count.service';

/**
 * Review › Runs (UX review DR2, 2026-10-13): the runs whose results wait for review (Core's review/waiting, MIG-325), the
 * whole list, newest first, each opening the run page where it is decided. An administrator decides through Core's run
 * review, a reviewer through their own task about each run -- both in bulk from here (ReviewWaiting's bulk bar); a run
 * whose pipeline requires individual review is decided on its own page only.
 */
@Component({
  selector: 'app-runs-to-review',
  imports: [PageHeader, RefreshButton, EmptyState, ReviewWaiting],
  template: `
    <div class="page">
      <app-page-header title="Runs to review"
                       subtitle="Runs whose results wait for a review, newest first. Open one to see its results and decide, or pick several to decide together.">
        <app-refresh-button [loading]="!waiting()?.loaded()" (refresh)="reload()" />
      </app-page-header>
      <app-review-waiting [all]="true" (decided)="counted()" data-test="runs-to-review" />
      @if (waiting()?.loaded() && !waiting()?.runs()?.length) {
        <app-empty-state class="card p-10" icon="checkCircle" title="No run is waiting for review"
                         message="A pipeline with a review step holds its results here until someone approves or rejects them." />
      }
    </div>
  `,
})
export class RunsToReview {
  private readonly injector = inject(Injector);
  readonly waiting = viewChild(ReviewWaiting);

  reload(): void {
    this.waiting()?.load();
    this.counted();
  }

  /** The menu's badge and Home read again after a decision. */
  counted(): void {
    this.injector.get(TaskCountService).refresh();
  }
}
