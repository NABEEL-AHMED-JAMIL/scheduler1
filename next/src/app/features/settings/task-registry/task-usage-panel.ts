import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { SidePanel } from '../../../shared/ui/side-panel';
import { StatusPill } from '../../../shared/ui/status-pill';
import { StepsApi } from '../../tasks/steps/steps.service';
import { UsageOf, UsagePipeline, UsageRun } from '../../tasks/steps/task-usage.model';

export interface TaskUsagePanelData {
  /** Which list: the pipelines that use the task, or their runs this month. */
  list: 'pipelines' | 'runs';
  of: UsageOf;
  /** The row's name, for the heading. */
  name: string;
  /** The count the table showed, so the heading says it before the list arrives. */
  count: number;
  /** A platform administrator's chosen workspace (null: every workspace). */
  tenantId: number | null;
  /**
   * ZT-A12 follow-up (owner 2026-10-21, "Managed session only"): the platform administrator's own sign-in sees the count
   * and not the list -- the pipelines and runs behind it are a workspace's data, which Core answers 403 outside "Work in
   * this workspace". Nothing is read.
   */
  countsOnly?: boolean;
}

/**
 * Owner #17 (2026-10-19): the list behind one of the Task Registry's counts, in a drawer beside the table -- as Kafka &
 * Topics' "n pipelines" opens its pipelines. The pipelines that use a task (or a Legacy row's registry pipeline), each
 * opening its editor, with the steps that run the task and its runs this month; or those pipelines' runs this month,
 * newest first, each opening the run. Core counts and lists in the caller's workspace (a platform administrator's
 * chosen one, or all, each row naming its workspace).
 */
@Component({
  selector: 'app-task-usage-panel',
  imports: [SidePanel, Icon, RouterLink, StatusPill, ServerTimePipe],
  template: `
    <app-side-panel [heading]="heading()" [subtitle]="subtitle()">
      @if (data.countsOnly) {
        <p class="text-sm text-[color:var(--text-secondary)] py-6 text-center" data-test="usage-counts-only">
          The {{ data.list === 'runs' ? 'runs' : 'pipelines' }} themselves are a workspace's: open it with "Work in this workspace"
          on Platform › Workspaces to see them.
        </p>
      } @else if (loading()) {
        <div class="py-10 text-center text-sm text-[color:var(--text-muted)]"><div class="spinner mx-auto mb-2" role="status" aria-label="Loading"></div>Loading…</div>
      } @else if (error()) {
        <p class="text-sm text-crit-500 py-6 text-center" role="alert">{{ error() }}</p>
      } @else {
        @if (shownCount() > 6) {
          <div class="search-field mb-3">
            <app-icon name="search" size="0.95em" />
            <input class="input" [placeholder]="data.list === 'runs' ? 'Find a run or pipeline' : 'Find a pipeline'" aria-label="Find in the list"
                   [value]="search()" (input)="search.set($any($event.target).value)" />
          </div>
        }
        @if (data.list === 'pipelines') {
          @if (!pipelines().length) {
            <p class="text-sm text-[color:var(--text-muted)] py-6 text-center" data-test="usage-empty">No pipeline uses it{{ data.tenantId || !isAll ? ' in this workspace' : '' }}.</p>
          }
          <ul class="side-panel-list" data-test="usage-pipelines">
            @for (p of shownPipelines(); track p.taskDetailId) {
              <li>
                <div class="min-w-0">
                  <a class="link-inline font-medium truncate block" [routerLink]="['/pipelines', p.taskDetailId, 'edit']" [title]="p.taskName"
                     (click)="ref.close()">{{ p.taskName }}</a>
                  <div class="text-xs text-[color:var(--text-muted)] [overflow-wrap:anywhere]">
                    <span class="mono">{{ p.pipelineId }}</span>
                    @if (p.steps.length) { · step{{ p.steps.length === 1 ? '' : 's' }} <span class="mono">{{ p.steps.join(', ') }}</span> }
                    · {{ p.runsThisMonth }} run{{ p.runsThisMonth === 1 ? '' : 's' }} this month
                    @if (showWorkspace()) { · {{ workspaceName(p.tenantId) }} }
                  </div>
                </div>
                <app-status [label]="p.status || 'Active'" [quiet]="true" />
              </li>
            }
          </ul>
        } @else {
          @if (!runs().length) {
            <p class="text-sm text-[color:var(--text-muted)] py-6 text-center" data-test="usage-empty">No run this month.</p>
          }
          @if (total() > runs().length) {
            <p class="text-xs text-[color:var(--text-muted)] mb-2">The newest {{ runs().length }} of {{ total() }} runs this month.</p>
          }
          <ul class="side-panel-list" data-test="usage-runs">
            @for (r of shownRuns(); track r.jobQueueId) {
              <li>
                <div class="min-w-0">
                  <a class="link-inline font-medium truncate block" [routerLink]="['/pipelines/schedules', r.jobId, 'runs', r.jobQueueId]"
                     (click)="ref.close()">Run {{ r.jobQueueId }}</a>
                  <div class="text-xs text-[color:var(--text-muted)] [overflow-wrap:anywhere]">
                    {{ r.taskName || 'Pipeline ' + r.taskDetailId }} · {{ r.jobName }}
                    @if (r.at) { · {{ r.at | serverTime: 'recent' }} }
                    @if (showWorkspace()) { · {{ workspaceName(r.tenantId) }} }
                  </div>
                </div>
                <app-status [label]="r.jobStatus" [quiet]="true" />
              </li>
            }
          </ul>
        }
      }
      <div foot>
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="ref.close()">Close</button>
      </div>
    </app-side-panel>
  `,
})
export class TaskUsagePanel implements OnInit {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<TaskUsagePanelData>(DIALOG_DATA);
  private readonly api = inject(StepsApi);
  private readonly directory = inject(WorkspaceDirectory);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly pipelines = signal<UsagePipeline[]>([]);
  readonly runs = signal<UsageRun[]>([]);
  readonly total = signal(0);
  readonly search = signal('');
  readonly isAll = this.data.tenantId == null;

  readonly heading = computed(() => this.data.list === 'runs'
    ? `${this.data.count} run${this.data.count === 1 ? '' : 's'} this month`
    : `${this.data.count} pipeline${this.data.count === 1 ? '' : 's'}`);
  readonly subtitle = computed(() => this.data.list === 'runs' ? `Of the pipelines that use ${this.data.name}` : `Using ${this.data.name}`);
  readonly shownCount = computed(() => (this.data.list === 'runs' ? this.runs().length : this.pipelines().length));
  /** Several workspaces' rows (a platform administrator's "all"): each says whose it is. */
  readonly showWorkspace = computed(() => new Set([...this.pipelines(), ...this.runs()].map(r => r.tenantId)).size > 1);

  readonly shownPipelines = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q ? this.pipelines().filter(p => `${p.taskName} ${p.pipelineId}`.toLowerCase().includes(q)) : this.pipelines();
  });
  readonly shownRuns = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q ? this.runs().filter(r => `${r.jobQueueId} ${r.taskName ?? ''} ${r.jobName ?? ''}`.toLowerCase().includes(q)) : this.runs();
  });

  workspaceName(id: number): string {
    return this.directory.names().get(id) ?? `Workspace ${id}`;
  }

  ngOnInit(): void {
    if (this.data.countsOnly) { this.loading.set(false); return; }
    const failed = (message?: string) => { this.loading.set(false); this.error.set(message || 'The list could not be read.'); };
    if (this.data.list === 'runs') {
      this.api.taskRuns(this.data.of, this.data.tenantId).subscribe({
        next: r => {
          if (r.status !== API_SUCCESS) { failed(r.message); return; }
          this.loading.set(false);
          this.runs.set(r.data?.runs ?? []);
          this.total.set(r.data?.total ?? 0);
        },
        error: err => failed(err?.error?.message),
      });
    } else {
      this.api.taskPipelines(this.data.of, this.data.tenantId).subscribe({
        next: r => {
          if (r.status !== API_SUCCESS) { failed(r.message); return; }
          this.loading.set(false);
          this.pipelines.set(r.data ?? []);
        },
        error: err => failed(err?.error?.message),
      });
    }
  }
}
