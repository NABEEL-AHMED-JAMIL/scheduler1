import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { AnalyticsService, Dashboard, PinnedChart } from '../analytics.service';
import { kindInfo } from '../widget-kinds';
import { ChartAnswer, pinRequest } from './chart-answer';
import type { ChartSettings } from './chart-settings';
import { AppLoading, InlineStatus, loadErrorText } from '../../../shared/ui/loading';

export interface PinChartData {
  answer: ChartAnswer;
  kind: string;
  settings: ChartSettings;
  title: string;
}

/**
 * MIG-357, "Pin to dashboard": a chart answer kept as a real tile -- its query saved and a widget on one of the person's
 * boards, or a new one -- through analyticsWorkspace.json/pinChart, both or neither. The tile runs its query as whoever
 * opens the board, so every reader's own masks and row-level security apply to it.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-pin-chart-panel',
  imports: [SidePanel, Icon, RouterLink, AppLoading, InlineStatus],
  template: `
    <app-side-panel heading="Pin to dashboard" [subtitle]="data.title + ' · ' + kindLabel">
      <div class="flex flex-col gap-4 min-w-0" data-test="pin-panel">
        @if (pinned(); as p) {
          <div class="rounded-lg px-3 py-3 text-sm bg-accent-soft flex items-start gap-2" data-test="pinned">
            <app-icon name="check" class="mt-0.5 shrink-0" />
            <div class="min-w-0">
              <p>Pinned to <strong>{{ p.dashboard.dashboardName }}</strong>{{ p.dashboard.created ? ' (a new dashboard)' : '' }}.</p>
              <p class="text-xs text-[color:var(--text-muted)] mt-1">The tile runs its query each time the dashboard is opened, as whoever opens it.</p>
              <a class="btn btn-default btn-sm mt-2" routerLink="/data/analytics/dashboards" [queryParams]="{ board: p.dashboard.analyticsDashboardId }"
                 (click)="ref.close(p)" data-test="open-board"><app-icon name="chart" />Open the dashboard</a>
            </div>
          </div>
        } @else {
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Title</span>
            <input class="input" data-test="pin-title" maxlength="255" [value]="title()" (input)="title.set($any($event.target).value)" />
          </label>
          <div class="flex flex-col gap-2 text-sm min-w-0" role="radiogroup" aria-labelledby="pin-where-label">
            <p class="font-medium" id="pin-where-label">Dashboard</p>
            @if (loading()) {
              <app-loading shape="inline" label="Loading your dashboards…" />
            } @else {
              <!-- Owner 2026-10-27: a failed read said nothing and offered only a new dashboard, as if there were none. -->
              @if (boardsError()) {
                <app-inline-status [error]="boardsError()" (retry)="loadBoards()" />
              }
              @if (boards().length) {
                <label class="flex items-center gap-2"><input type="radio" name="pin-where" [checked]="mode() === 'existing'" (change)="mode.set('existing')" />An existing dashboard</label>
                <select class="input" data-test="pin-board" [disabled]="mode() !== 'existing'" (change)="boardId.set(+$any($event.target).value)">
                  @for (b of boards(); track b.analyticsDashboardId) {
                    <option [value]="b.analyticsDashboardId" [selected]="b.analyticsDashboardId === boardId()">{{ b.dashboardName }}</option>
                  }
                </select>
              }
              <label class="flex items-center gap-2"><input type="radio" name="pin-where" data-test="pin-new" [checked]="mode() === 'new'" (change)="mode.set('new')" />A new dashboard</label>
              <input class="input" data-test="pin-new-name" maxlength="255" placeholder="Name of the new dashboard" [disabled]="mode() !== 'new'"
                     [value]="newName()" (input)="newName.set($any($event.target).value)" />
            }
          </div>
          <p class="text-xs text-[color:var(--text-muted)]">
            The query is saved with the tile, and runs when the dashboard is opened, as whoever opens it: their masked fields stay masked.
          </p>
          @if (error()) {
            <p class="text-sm text-crit-500 flex items-start gap-1.5" data-test="pin-error"><app-icon name="alert" class="icon-crit mt-0.5 shrink-0" size="0.9em" />{{ error() }}</p>
          }
        }
      </div>
      <div foot class="flex w-full gap-2 justify-end">
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close(pinned() ?? undefined)">{{ pinned() ? 'Close' : 'Cancel' }}</button>
        @if (!pinned()) {
          <button type="button" class="btn btn-primary btn-sm" data-test="pin-save" [disabled]="!canPin()" (click)="pin()">
            <app-icon name="plus" />{{ busy() ? 'Pinning…' : 'Pin' }}
          </button>
        }
      </div>
    </app-side-panel>
  `,
})
export class PinChartPanel implements OnInit {
  readonly ref = inject<DialogRef<PinnedChart | undefined>>(DialogRef);
  readonly data = inject<PinChartData>(DIALOG_DATA);
  private readonly analytics = inject(AnalyticsService);

  readonly kindLabel = kindInfo(this.data.kind)?.label ?? this.data.kind;
  readonly title = signal(this.data.title);
  readonly boards = signal<Dashboard[]>([]);
  readonly loading = signal(true);
  readonly boardsError = signal('');
  readonly mode = signal<'existing' | 'new'>('new');
  readonly boardId = signal<number | null>(null);
  readonly newName = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly pinned = signal<PinnedChart | null>(null);

  readonly canPin = computed(() => !this.busy() && !!this.title().trim()
    && (this.mode() === 'existing' ? this.boardId() !== null : !!this.newName().trim()));

  ngOnInit(): void { this.loadBoards(); }

  loadBoards(): void {
    this.loading.set(true);
    this.boardsError.set('');
    this.analytics.fetchAllDashboards().subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status !== API_SUCCESS) this.boardsError.set(loadErrorText(res, 'Your dashboards could not be read; you can still pin to a new one.'));
        const boards = res.status === API_SUCCESS && res.data ? res.data.filter(b => b.analyticsDashboardId != null) : [];
        this.boards.set(boards);
        if (boards.length) {
          this.mode.set('existing');
          this.boardId.set(boards[0].analyticsDashboardId!);
        }
      },
      error: err => { this.loading.set(false); this.boardsError.set(loadErrorText(err, 'Your dashboards could not be read; you can still pin to a new one.')); },
    });
  }

  pin(): void {
    if (!this.canPin()) return;
    this.busy.set(true);
    this.error.set('');
    const board = this.mode() === 'existing' ? { id: this.boardId()! } : { name: this.newName() };
    this.analytics.pinChart(pinRequest(this.data.answer, this.data.kind, this.data.settings, this.title(), board)).subscribe({
      next: res => {
        this.busy.set(false);
        if (res.status === API_SUCCESS && res.data) this.pinned.set(res.data);
        else this.error.set(res.message || 'The chart could not be pinned.');
      },
      error: (err: { status?: number; error?: { message?: string } }) => {
        this.busy.set(false);
        this.error.set(err?.error?.message || (err?.status === 403
          ? 'Pinning puts a tile on a dashboard, and your access does not let you change dashboards.'
          : 'The chart could not be pinned. Try again.'));
      },
    });
  }
}
