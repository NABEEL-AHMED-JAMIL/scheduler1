import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { EmptyState } from '../../../shared/ui/empty-state';
import { AppLoading } from '../../../shared/ui/loading';
import { AuthService } from '../../../core/auth/auth.service';
import { studioError } from '../report-studio.api';
import { RsTimePipe, zoneCity } from '../rs-time.pipe';
import { RUN_WORDS, STATE_WORDS, ScheduleSummary, SchedulesApi, runTone, scheduleTone } from './schedules.api';

/**
 * See results › Reports › Schedules (reports redesign, features 3 and 4; design library.html's Schedules tab): the
 * workspace's report schedules -- what each makes and where it goes, its next run in the workspace's time zone, its last
 * run, and whether it is On, Paused or Will fail (its last check or run says it would not make its reports).
 */
@Component({
  selector: 'app-report-schedules',
  imports: [PageHeader, RefreshButton, Icon, LoadError, EmptyState, AppLoading, RouterLink, RsTimePipe],
  template: `
    <div class="page">
      <app-page-header>
        <div class="page-head">
          <div>
            <h1 class="page-title">Report schedules</h1>
            <p class="page-subtitle">Make many reports at once, on a schedule, and send each one where it needs to go once it is approved.</p>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="btn btn-default btn-sm" (click)="archived.set(!archived()); load()" data-test="sched-archived">
              <app-icon [name]="archived() ? 'arrowLeft' : 'history'" />{{ archived() ? 'Back to current schedules' : 'Show archived' }}</button>
            <app-refresh-button [loading]="loading()" (refresh)="load()" />
            @if (canMake()) { <a class="btn btn-primary btn-sm" routerLink="/reports/schedules/new" data-test="sched-new"><app-icon name="plus" />New schedule</a> }
          </div>
        </div>
      </app-page-header>

      @if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (loading() && !rows().length) {
        <app-loading shape="rows" label="Loading the schedules…" [count]="4" />
      } @else if (!rows().length) {
        <app-empty-state class="card p-10" icon="clock" [title]="archived() ? 'No archived schedules' : 'No schedules yet'"
                         [message]="archived() ? 'An archived schedule never runs again; its runs and reports are kept.' : 'A schedule makes one report of a pipeline’s rows, or one per patient, on the days you choose, and sends each where it goes once it is approved.'" />
      } @else {
        <section class="card" aria-label="Schedules">
          <div class="overflow-x-auto">
            <table class="table-modern sch-table" aria-label="Report schedules">
              <thead><tr><th>Schedule</th><th>State</th><th>Next run</th><th>Last run</th><th>Then</th></tr></thead>
              <tbody>
                @for (s of rows(); track s.scheduleId) {
                  <tr class="sch-row" (click)="open(s)" [attr.data-schedule]="s.scheduleId">
                    <td class="min-w-0"><a class="link-inline font-medium" [routerLink]="['/reports/schedules', s.scheduleId]" (click)="$event.stopPropagation()">{{ s.name }}</a>
                      <div class="text-xs text-[color:var(--text-muted)] truncate">{{ s.templateName }} · {{ s.makes }}</div></td>
                    <td><span class="pill" [class]="'pill pill-' + tone(s.state)">{{ words[s.state] }}</span>
                      @if (s.problem) { <div class="sch-problem" [title]="s.problem">{{ s.problem }}</div> }</td>
                    <td><span class="whitespace-nowrap">{{ s.nextRunAt ? (s.nextRunAt | rsTime: 'recent': zone()) : '—' }}</span>
                      <div class="text-xs text-[color:var(--text-muted)]">{{ s.when }}</div></td>
                    <td class="whitespace-nowrap">@if (s.lastRun; as r) {
                      <span class="pill" [class]="'pill pill-' + runTone(r.status)">{{ runWords[r.status] }}</span>
                      <span class="text-xs text-[color:var(--text-muted)]"> {{ r.dueAt | rsTime: 'recent': zone() }}@if (r.reportsMade) { · {{ r.reportsMade }} made }</span>
                    } @else { <span class="text-[color:var(--text-muted)]">Not run yet</span> }</td>
                    <td class="text-sm">{{ s.then }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="text-xs text-[color:var(--text-muted)] p-4 pt-2">Times are in the workspace's time zone ({{ city() }}), 24-hour.</p>
        </section>
      }
    </div>
  `,
  styles: `
    .sch-table td { vertical-align: top; }
    .sch-table td:first-child { min-width: 14rem; }
    .sch-table td:last-child { min-width: 13rem; }
    .sch-row { cursor: pointer; }
    .sch-row:hover td { background: var(--surface-sunken); }
    .sch-problem { font-size: 0.75rem; color: var(--crit-text); max-width: 18rem; margin-top: 0.25rem; }
  `,
})
export class ReportSchedules implements OnInit {
  private readonly api = inject(SchedulesApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly rows = signal<ScheduleSummary[]>([]);
  readonly zone = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly archived = signal(false);
  readonly words = STATE_WORDS;
  readonly runWords = RUN_WORDS;
  readonly tone = scheduleTone;
  readonly runTone = runTone;
  readonly canMake = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin() && !this.archived());
  readonly city = computed(() => zoneCity(this.zone()));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.archived()).subscribe({
      next: r => { this.rows.set(r.schedules); this.zone.set(r.zone); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The schedules could not be read.').message); this.loading.set(false); },
    });
  }

  open(s: ScheduleSummary): void {
    void this.router.navigate(['/reports/schedules', s.scheduleId]);
  }
}
