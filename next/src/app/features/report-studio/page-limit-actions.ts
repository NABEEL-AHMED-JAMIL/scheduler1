import { Component, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';
import { PageLimitStep, pageLimitOf } from './report-studio.model';

/** A failed job as these actions read it: its code and diagnostics. */
export interface FailedJobLike { errorCode?: string | null; diagnostics?: unknown[] | null; }

/** The words of a step's button, from what the service names (the label is the service's, kept as a fallback). */
export const STEP_WORDS: Record<PageLimitStep['action'], string> = {
  PER_ROW: 'Make one report per row',
  LOWER_ROWS: "Lower the table's rows",
  EXPORT_CSV: 'Export the data as CSV',
};

/**
 * Owner 2026-10-21: what to do when a report is over its workspace's page limit, where it applies -- on the failed job
 * (Reports › Generation jobs), the report page and the overview. Generic: each button is one of media's next steps
 * (NextSteps): one report per row (a pipeline's Generate report step: the step's settings at perRow), the table's rows (the
 * template in the designer, on its first table, repeat or image grid), the data as CSV (a run's kept dataset, or the run's
 * Outputs); and, for a workspace administrator when the limit is theirs to raise, Report Studio › Settings. Each shows only
 * where the reader can open what it leads to.
 */
@Component({
  selector: 'app-page-limit-actions',
  imports: [Icon, RouterLink],
  host: { class: 'contents' },
  template: `
    @if (limit(); as l) {
      <div class="flex flex-wrap items-center gap-2" [class.mt-2]="spaced()" role="group" aria-label="What to do about the page limit" data-test="page-limit-actions">
        @for (s of steps(); track s.action) {
          @switch (s.action) {
            @case ('PER_ROW') {
              <button type="button" class="btn btn-default" [class.btn-sm]="!compact()" [class.btn-xs]="compact()" [disabled]="opening()" (click)="perRow(s)" data-test="next-per-row"
                      title="Open the pipeline's Generate report step at One report per row"><app-icon name="layers" [busy]="opening()" />{{ words.PER_ROW }}</button>
            }
            @case ('LOWER_ROWS') {
              <a class="btn btn-default" [class.btn-sm]="!compact()" [class.btn-xs]="compact()" [routerLink]="['/reports/templates', s.templateId, 'design']" [queryParams]="{ select: s.componentIds[0] }"
                 data-test="next-lower-rows" title="Open the template in the designer, on its first table, repeat or image grid"><app-icon name="edit" />{{ words.LOWER_ROWS }}</a>
            }
            @case ('EXPORT_CSV') {
              @if (s.source.runDatasetId) {
                <button type="button" class="btn btn-default" [class.btn-sm]="!compact()" [class.btn-xs]="compact()" [disabled]="exporting()" (click)="csv(s.source.runDatasetId)" data-test="next-export-csv">
                  <app-icon name="download" [busy]="exporting()" />{{ words.EXPORT_CSV }}</button>
              } @else if (s.source.jobId && s.source.jobQueueId) {
                <a class="btn btn-default" [class.btn-sm]="!compact()" [class.btn-xs]="compact()" [routerLink]="['/pipelines/schedules', s.source.jobId, 'runs', s.source.jobQueueId]" [queryParams]="{ tab: 'outputs' }"
                   data-test="next-export-csv" title="The run's Outputs: each kept table downloads as CSV"><app-icon name="download" />{{ words.EXPORT_CSV }}</a>
              }
            }
          }
        }
        @if (canRaise()) {
          <a class="btn btn-ghost" [class.btn-sm]="!compact()" [class.btn-xs]="compact()" routerLink="/reports/settings" data-test="next-raise-limit"><app-icon name="settings" />Raise the limit</a>
        }
      </div>
    }
  `,
})
export class PageLimitActions {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly job = input<FailedJobLike | null | undefined>(null);
  /** Space above the buttons (under a sentence). */
  readonly spaced = input(true);
  /** Smaller buttons, for a table's cell (Generation jobs). */
  readonly compact = input(false);
  readonly words = STEP_WORDS;
  readonly opening = signal(false);
  readonly exporting = signal(false);

  readonly limit = computed(() => pageLimitOf(this.job()));
  /** The steps this reader can take: a pipeline's settings need its builder, a template the designer, a run its page. */
  readonly steps = computed(() => (this.limit()?.steps ?? []).filter(s => {
    if (s.action === 'PER_ROW') return this.auth.isTenantAdmin() && this.auth.canOpen('tasks');
    if (s.action === 'LOWER_ROWS') return this.auth.canOpen('report-templates');
    return s.source.runDatasetId ? true : this.auth.canOpen('jobs');
  }));
  readonly canRaise = computed(() => this.limit()?.hit.raisedBy === 'WORKSPACE_ADMIN' && this.auth.isTenantAdmin() && !this.auth.isPlatformAdmin());

  /** The run's schedule names its pipeline; the step's settings open there, at One report per row. */
  perRow(s: Extract<PageLimitStep, { action: 'PER_ROW' }>): void {
    this.opening.set(true);
    this.http.get<ApiResponse<{ taskDetail?: { taskDetailId?: number } }>>(`${API_BASE}/sourceJob.json/fetchSourceJobDetailWithSourceJobId`,
      { params: { jobId: String(s.pipeline.jobId) } }).subscribe({
      next: r => {
        this.opening.set(false);
        const pipeline = r?.data?.taskDetail?.taskDetailId;
        if (!pipeline) { this.toast.error('The pipeline of this run could not be found.'); return; }
        this.router.navigate(['/pipelines', pipeline, 'edit'], { queryParams: { tab: 'steps', step: s.pipeline.stepKey } });
      },
      error: () => { this.opening.set(false); this.toast.error('The pipeline of this run could not be read; open it from the run page.'); },
    });
  }

  /** The run's kept dataset as CSV, saved by the browser. */
  csv(runDatasetId: number): void {
    this.exporting.set(true);
    this.http.get(`${API_BASE}/sourceJob.json/runDataset`, { params: { runDatasetId, format: 'csv' }, responseType: 'blob' }).subscribe({
      next: blob => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `run-dataset-${runDatasetId}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => { this.exporting.set(false); this.toast.error('The data could not be exported; try again.'); },
    });
  }
}
