import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';

/** A run whose results wait for a review (sourceJob.json/review/waiting). */
export interface WaitingRun {
  jobQueueId: number;
  jobId: number;
  jobName: string | null;
  finishedAt: string | null;
  required: string[];
  decisions: { party: string }[];
}

interface WaitingAnswer {
  runs: WaitingRun[];
  more: boolean;
}

/**
 * MIG-325: the reviewer's list. The runs whose results wait for a review, newest first, across every job the person
 * may see, each a link to the run where the review is decided. Draws nothing while none waits, so Executions keeps
 * its usual top when there is nothing to review.
 */
@Component({
  selector: 'app-review-waiting',
  imports: [RouterLink, Icon, ServerTimePipe],
  template: `
    @if (runs().length) {
      <section class="card p-4 space-y-3" data-review-waiting aria-labelledby="review-waiting-heading">
        <div class="flex items-center gap-2">
          <app-icon name="clock" />
          <h2 id="review-waiting-heading" class="text-sm font-semibold mr-auto">
            Waiting for review
            <span class="pill pill-warn ml-1">{{ runs().length }}{{ more() ? '+' : '' }}</span>
          </h2>
        </div>
        <ul class="divide-y divide-[color:var(--border-subtle)]">
          @for (run of shown(); track run.jobQueueId) {
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span class="font-medium min-w-0 truncate">{{ run.jobName || 'Job ' + run.jobId }}</span>
              <span class="mono text-[color:var(--text-muted)]">run #{{ run.jobQueueId }}</span>
              @if (run.finishedAt) {
                <span class="text-xs text-[color:var(--text-muted)]">finished {{ run.finishedAt | serverTime:'recent' }}</span>
              }
              <span class="text-xs text-[color:var(--text-secondary)]">{{ partiesOf(run) }}</span>
              <a class="btn btn-default btn-sm ml-auto"
                 [routerLink]="['/pipelines/schedules', run.jobId, 'runs', run.jobQueueId, 'logs']">
                <app-icon name="check" />Review
              </a>
            </li>
          }
        </ul>
        @if (runs().length > FIRST) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()">
            {{ expanded() ? 'Show the newest ' + FIRST : 'Show all ' + runs().length }}
          </button>
        }
        @if (more() && expanded()) {
          <p class="text-xs text-[color:var(--text-muted)]">Showing the newest {{ runs().length }}. Review these to see older ones.</p>
        }
      </section>
    }
  `,
})
export class ReviewWaiting implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly runs = signal<WaitingRun[]>([]);
  readonly more = signal(false);
  /** The newest few, so a long backlog never pushes Executions' own table off the screen; the rest on request. */
  readonly FIRST = 5;
  readonly expanded = signal(false);
  readonly shown = computed(() => this.expanded() ? this.runs() : this.runs().slice(0, this.FIRST));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.http.get<ApiResponse<WaitingAnswer>>(`${API_BASE}/sourceJob.json/review/waiting`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: answer => {
          const ok = answer?.status === API_SUCCESS && answer.data;
          this.runs.set(ok ? answer.data!.runs ?? [] : []);
          this.more.set(ok ? !!answer.data!.more : false);
        },
        // A list that cannot load is left out rather than shown as an error: Executions is still the page.
        error: () => { this.runs.set([]); this.more.set(false); },
      });
  }

  /** "Needs the internal review", or with two parties, which have decided so far. */
  partiesOf(run: WaitingRun): string {
    const required = run.required ?? [];
    const decided = new Set((run.decisions ?? []).map(d => (d.party ?? '').toLowerCase()));
    const waiting = required.filter(p => !decided.has(p.toLowerCase()));
    if (!waiting.length) {
      return 'Needs a review';
    }
    return `Needs the ${waiting.join(' and ')} review`;
  }
}
