import { Avatar } from '../../shared/ui/avatar';
import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Observable } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { TableShell } from '../../shared/ui/data-table';
import { Icon } from '../../shared/ui/icon';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import {
  AccountSecurityApi, METHOD_LABEL, OUTCOME_LABEL, SignInEvent, SignInFilter, SignInPage, deviceOf,
} from './account-security.api';

/** How many rows a page asks for (the service answers at most 500). */
export const HISTORY_PAGE = 50;

/** The pill an outcome wears. */
export function outcomeTone(outcome: string): string {
  switch (outcome) {
    case 'SUCCESS': return 'pill pill-ok';
    case 'FAILURE': return 'pill pill-crit';
    case 'LOCKED': return 'pill pill-crit';
    case 'UNLOCKED': case 'MFA_ENROLLED': return 'pill pill-brand';
    default: return 'pill pill-neutral';
  }
}

/**
 * MIG-353 part 2: the sign-in history, newest first -- every attempt (succeeded or not, why, how, from where and with
 * what) and every change to a person's sign-in standing. One component for two screens: My account › Security (the
 * person's own, `scope` mine) and Administration › Security (the workspace's; a platform administrator's every
 * workspace or the one picked). Exported as CSV with the same filters.
 */
@Component({
  selector: 'app-sign-in-history',
  imports: [TableShell, Icon, ServerTimePipe, Avatar],
  template: `
    <app-table-shell heading="Sign-in history" [loading]="loading()" [error]="error()" [isEmpty]="!rows().length"
                     [shown]="rows().length" [total]="total()" emptyIcon="history" [columnsKey]="'sign-in-history-' + scope()"
                     [emptyMessage]="hasFilters() ? 'No sign-ins match these filters.' : 'No sign-ins recorded yet.'" (retry)="load()">
      <ng-container toolbar>
        @if (scope() === 'workspace') {
          <div class="search-field max-w-64">
            <app-icon name="search" size="0.95em" />
            <input class="input" placeholder="Search name or address" aria-label="Search sign-ins by name or address"
                   [value]="search()" (change)="setSearch($any($event.target).value)"
                   (keydown.enter)="setSearch($any($event.target).value)" />
          </div>
        }
        <select class="input max-w-44 min-w-0" aria-label="Filter by outcome" [value]="outcome()"
                (change)="setOutcome($any($event.target).value)">
          <option value="">Every outcome</option>
          @for (o of outcomes; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
        </select>
        <select class="input max-w-44 min-w-0" aria-label="Filter by method" [value]="method()"
                (change)="setMethod($any($event.target).value)">
          <option value="">Every method</option>
          @for (m of methods; track m.value) { <option [value]="m.value">{{ m.label }}</option> }
        </select>
        @if (hasFilters()) {
          <button type="button" class="btn btn-ghost btn-sm" (click)="clearFilters()"><app-icon name="close" />Clear</button>
        }
        <button type="button" class="btn btn-default btn-sm" (click)="exportCsv()" [disabled]="exporting()" data-test="history-csv">
          <app-icon name="download" [busy]="exporting()" />Export CSV
        </button>
        <button type="button" class="btn btn-default btn-sm" (click)="load()" [disabled]="loading()">
          <app-icon name="refresh" [class.spin]="loading()" />Refresh
        </button>
      </ng-container>

      <table class="table-modern" data-test="sign-in-history">
        <thead>
          <tr>
            <th>When</th>
            @if (scope() === 'workspace') { <th>Person</th> }
            <th>Outcome</th>
            <th>Method</th>
            <th>Reason</th>
            <th>Address</th>
            <th>Device</th>
          </tr>
        </thead>
        <tbody>
          @for (e of rows(); track e.id) {
            <tr>
              <td class="whitespace-nowrap text-[color:var(--text-secondary)]">{{ e.at | serverTime: 'dateTimeSec' }}</td>
              @if (scope() === 'workspace') {
                <td class="max-w-64">
                  <div class="flex items-center gap-2 min-w-0">
                    <app-avatar [appUserId]="e.appUserId" [name]="e.username" [size]="1.5" [decorative]="true" />
                    <div class="truncate" [title]="e.username">{{ e.username }}</div>
                  </div>
                </td>
              }
              <td class="whitespace-nowrap"><span [class]="tone(e.outcome)">{{ outcomeText(e.outcome) }}</span></td>
              <td class="whitespace-nowrap">{{ methodText(e.method) }}</td>
              <td class="text-[color:var(--text-secondary)]">{{ e.reasonText || '—' }}</td>
              <td class="whitespace-nowrap mono text-xs">{{ e.ip || '—' }}</td>
              <td class="max-w-56"><div class="truncate text-[color:var(--text-secondary)]" [title]="e.userAgent ?? ''">{{ device(e.userAgent) }}</div></td>
            </tr>
          }
        </tbody>
      </table>
      <div pager>
        @if (hasMore()) {
          <div class="flex justify-center p-4 border-t border-subtle">
            <button type="button" class="btn btn-default btn-sm" (click)="loadOlder()" [disabled]="loadingMore()">
              <app-icon name="history" [busy]="loadingMore()" />Load older
            </button>
          </div>
        }
      </div>
    </app-table-shell>
  `,
})
export class SignInHistory implements OnInit {
  private readonly api = inject(AccountSecurityApi);
  private readonly toast = inject(ToastService);

  /** mine: the person's own; workspace: an administrator's workspace (a platform administrator's: tenantId, or all). */
  readonly scope = input<'mine' | 'workspace'>('mine');
  readonly tenantId = input<number | null>(null);

  readonly rows = signal<SignInEvent[]>([]);
  readonly total = signal<number | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly outcome = signal('');
  readonly method = signal('');
  readonly search = signal('');

  readonly outcomes = Object.entries(OUTCOME_LABEL).map(([value, label]) => ({ value, label }));
  readonly methods = Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }));
  readonly hasFilters = computed(() => !!(this.outcome() || this.method() || this.search()));
  readonly hasMore = computed(() => this.total() !== null && this.rows().length < (this.total() ?? 0));

  private started = false;

  constructor() {
    // A platform administrator picking another workspace reads again.
    effect(() => {
      this.tenantId();
      if (untracked(() => this.started)) untracked(() => this.load());
    });
  }

  ngOnInit(): void {
    this.started = true;
    this.load();
  }

  tone(outcome: string): string {
    return outcomeTone(outcome);
  }

  outcomeText(outcome: string): string {
    return OUTCOME_LABEL[outcome] ?? outcome;
  }

  methodText(method: string): string {
    return METHOD_LABEL[method] ?? method;
  }

  device(userAgent: string | null): string {
    return deviceOf(userAgent);
  }

  setOutcome(value: string): void { this.outcome.set(value); this.load(); }
  setMethod(value: string): void { this.method.set(value); this.load(); }
  setSearch(value: string): void { this.search.set(value); this.load(); }

  clearFilters(): void {
    this.outcome.set('');
    this.method.set('');
    this.search.set('');
    this.load();
  }

  private filter(offset: number): SignInFilter {
    return {
      tenantId: this.scope() === 'workspace' ? this.tenantId() : null,
      outcome: this.outcome() || null, method: this.method() || null,
      q: this.scope() === 'workspace' ? this.search() || null : null, limit: HISTORY_PAGE, offset,
    };
  }

  private read(offset: number): Observable<ApiResponse<SignInPage>> {
    return this.scope() === 'workspace' ? this.api.workspaceHistory(this.filter(offset)) : this.api.myHistory(this.filter(offset));
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.read(0).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The sign-in history could not be read.'); return; }
        this.rows.set(r.data.items);
        this.total.set(r.data.total);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The sign-in history could not be read.');
      },
    });
  }

  loadOlder(): void {
    this.loadingMore.set(true);
    this.read(this.rows().length).subscribe({
      next: r => {
        this.loadingMore.set(false);
        if (r.status === API_SUCCESS && r.data) {
          this.rows.update(rows => [...rows, ...r.data!.items]);
          this.total.set(r.data.total);
        }
      },
      error: () => this.loadingMore.set(false),
    });
  }

  exportCsv(): void {
    this.exporting.set(true);
    const filter = { ...this.filter(0), limit: undefined, offset: undefined };
    const call = this.scope() === 'workspace' ? this.api.workspaceHistoryCsv(filter) : this.api.myHistoryCsv(filter);
    call.subscribe({
      next: blob => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = this.scope() === 'workspace' ? 'sign-in-history.csv' : 'my-sign-in-history.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => { this.exporting.set(false); this.toast.error('The export did not download. Try again.'); },
    });
  }
}
