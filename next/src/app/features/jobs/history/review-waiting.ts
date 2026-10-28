import { Component, DestroyRef, Injector, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { BulkBar } from '../../../shared/ui/bulk/bulk-bar';
import { BulkReviewApi } from '../../../shared/ui/bulk/bulk-review.api';
import { BulkSelection } from '../../../shared/ui/bulk/bulk.model';
import { AppLoading, InlineStatus, loadErrorText } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';

/** A run whose results wait for a review (sourceJob.json/review/waiting). */
export interface WaitingRun {
  jobQueueId: number;
  jobId: number;
  jobName: string | null;
  finishedAt: string | null;
  required: string[];
  decisions: { party: string }[];
  /** Its pipeline requires individual review: never approved or rejected in bulk (bulk review, 2026-10-12). */
  individual?: boolean;
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
  imports: [RouterLink, Icon, ServerTimePipe, BulkBar, AppLoading, InlineStatus, LoadError],
  template: `
    <!-- Owner 2026-10-27: a failed read is said, with Try again, rather than looking exactly like "nothing waits". Where
         the list is the page (Review > Runs) its first load shows a skeleton; on Runs the explorer's own card waits. -->
    @if (error()) {
      @if (all() && !runs().length) {
        <div class="card" data-review-waiting-error><app-load-error [message]="error()" (retry)="load()" /></div>
      } @else {
        <div class="card px-4 py-2.5" data-review-waiting-error><app-inline-status [error]="error()" (retry)="load()" /></div>
      }
    } @else if (all() && !loaded()) {
      <div class="card"><app-loading shape="list" label="Loading runs to review…" /></div>
    }
    @if (runs().length) {
      <section class="card p-4 space-y-3" data-review-waiting aria-labelledby="review-waiting-heading">
        <div class="flex items-center gap-2">
          @if (canBulk()) {
            <input type="checkbox" class="checkbox" aria-label="Select all runs shown" data-bulk-page
                   [checked]="pageState() === 'all'" [indeterminate]="pageState() === 'some'" [disabled]="!pageRows().length"
                   (change)="bulk.setPage(pageRows(), $any($event.target).checked)" />
          }
          <app-icon name="clock" />
          <h2 id="review-waiting-heading" class="text-sm font-semibold mr-auto">
            Waiting for review
            <span class="pill pill-warn ml-1">{{ runs().length }}{{ more() ? '+' : '' }}</span>
          </h2>
        </div>
        <ul class="divide-y divide-[color:var(--border-subtle)]">
          @for (run of shown(); track run.jobQueueId) {
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" [attr.data-run]="run.jobQueueId">
              @if (canBulk()) {
                <input type="checkbox" class="checkbox" [attr.data-bulk-pick]="run.jobQueueId"
                       [checked]="bulk.has(run)" [disabled]="!!run.individual"
                       [attr.aria-label]="'Select run #' + run.jobQueueId + ' of ' + (run.jobName || 'schedule ' + run.jobId)"
                       [title]="run.individual ? 'Its pipeline requires individual review: open the run to decide it.' : ''"
                       (change)="pick(run, $any($event.target).checked)" />
              }
              <span class="font-medium min-w-0 truncate">{{ run.jobName || 'Schedule ' + run.jobId }}</span>
              <span class="mono text-[color:var(--text-muted)]">run #{{ run.jobQueueId }}</span>
              @if (run.finishedAt) {
                <span class="text-xs text-[color:var(--text-muted)]">finished {{ run.finishedAt | serverTime:'recent' }}</span>
              }
              <span class="text-xs text-[color:var(--text-secondary)]">{{ partiesOf(run) }}</span>
              @if (run.individual) {
                <span class="pill pill-neutral" title="Its pipeline requires individual review: never approved or rejected in bulk." data-individual>
                  <app-icon name="user" size="0.85em" />Individual review</span>
              }
              <a class="btn btn-default btn-sm ml-auto"
                 [routerLink]="['/pipelines/schedules', run.jobId, 'runs', run.jobQueueId]">
                <app-icon name="check" />Review
              </a>
            </li>
          }
        </ul>
        @if (runs().length > FIRST && !all()) {
          <button type="button" class="btn btn-default btn-sm" (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()">
            {{ expanded() ? 'Show the newest ' + FIRST : 'Show all ' + runs().length }}
          </button>
        }
        @if (more() && (expanded() || all())) {
          <p class="text-xs text-[color:var(--text-muted)]">Showing the newest {{ runs().length }}. Review these to see older ones.</p>
        }
        @if (canBulk()) {
          <app-bulk-bar [selection]="bulk" [pageRows]="pageRows()" [moreMatch]="selectable().length > pageRows().length"
                        [matchTotal]="selectable().length" (decided)="load(); decided.emit()" />
        }
      </section>
    }
  `,
})
export class ReviewWaiting implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  readonly runs = signal<WaitingRun[]>([]);
  readonly more = signal(false);
  /** The list has answered once (Review › Runs says "nothing waits" only then). A failed read does not count. */
  readonly loaded = signal(false);
  /** Why the list could not be read, or '' (owner 2026-10-27: a failure is not "nothing waits"). */
  readonly error = signal('');
  /** Every run listed, not the newest five: Review › Runs, where the list is the page (UX review DR2). */
  readonly all = input(false);
  /** A bulk decision was made here (the page around it reads its counts again). */
  readonly decided = output<void>();
  /** Each answer, or a failure to get one: Runs holds its explorer until the list's place is known (no layout shift). */
  readonly settled = output<void>();
  /** The newest few, so a long backlog never pushes Executions' own table off the screen; the rest on request. */
  readonly FIRST = 5;
  readonly expanded = signal(false);
  readonly shown = computed(() => this.expanded() || this.all() ? this.runs() : this.runs().slice(0, this.FIRST));

  /**
   * Bulk review (2026-10-12): a workspace administrator decides runs through Core's run review; anyone else who decides
   * runs does it in the Task inbox, so their bulk decision goes through it too (their open task about each run). A
   * viewer -- signed in without the Task inbox -- sees no checkboxes.
   */
  readonly viaCore = computed(() => has(this.auth, 'isTenantAdmin'));
  readonly canBulk = computed(() => this.viaCore() || (!!signalOf(this.auth, 'user') && canOpen(this.auth, 'task-inbox')));
  /** A run under individual review is decided on its own page only. */
  readonly selectable = computed(() => this.runs().filter(r => !r.individual));
  readonly pageRows = computed(() => this.shown().filter(r => !r.individual));
  readonly bulk = new BulkSelection<WaitingRun>({
    idOf: run => run.jobQueueId,
    noun: ['run', 'runs'],
    groupNoun: 'pipeline',
    // Every waiting run loaded (up to 50): the list has no filter of its own.
    matching: () => of({ rows: this.selectable(), total: this.selectable().length }),
    send: (rows, request) => {
      const ids = rows.map(r => r.jobQueueId);
      const api = this.injector.get(BulkReviewApi);
      return this.viaCore() ? api.runs(ids, request) : api.tasks({ subjectIds: ids.map(id => `pipeline-run:${id}`) }, request);
    },
  });
  readonly pageState = computed(() => this.bulk.pageState(this.pageRows()));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.http.get<ApiResponse<WaitingAnswer>>(`${API_BASE}/sourceJob.json/review/waiting`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: answer => {
          if (answer?.status !== API_SUCCESS || !answer.data) {
            this.error.set(loadErrorText(answer, 'The runs waiting for review could not be read.'));
            this.settled.emit();
            return;
          }
          this.bulk.clear();
          this.error.set('');
          this.runs.set(answer.data.runs ?? []);
          this.more.set(!!answer.data.more);
          this.loaded.set(true);
          this.settled.emit();
        },
        // Executions is still the page, so the runs on screen stay; the failure is said in one line with Try again.
        error: err => { this.error.set(loadErrorText(err, 'The runs waiting for review could not be read.')); this.settled.emit(); },
      });
  }

  pick(run: WaitingRun, on: boolean): void {
    this.bulk.toggle(run, on);
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

// The session's answers, read defensively: a screen test may stand in a partial AuthService.
type AuthLike = Partial<Record<'isTenantAdmin' | 'user' | 'canOpen', unknown>>;
function has(auth: unknown, key: 'isTenantAdmin'): boolean {
  const fn = (auth as AuthLike)[key];
  return typeof fn === 'function' && !!(fn as () => unknown)();
}
function signalOf(auth: unknown, key: 'user'): unknown {
  const fn = (auth as AuthLike)[key];
  return typeof fn === 'function' ? (fn as () => unknown)() : null;
}
function canOpen(auth: unknown, page: string): boolean {
  const fn = (auth as AuthLike).canOpen;
  return typeof fn === 'function' && !!(fn as (p: string) => unknown).call(auth, page);
}
