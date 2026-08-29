import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { TableShell } from '../../shared/ui/data-table';
import { StatTile } from '../../shared/ui/stat-tile';
import { StatusPill } from '../../shared/ui/status-pill';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { createSort } from '../../shared/ui/sort';
import { Pagination } from '../../shared/ui/pagination';
import { createPager } from '../../shared/ui/pager';
import { RejectDialog } from './reject-dialog';

interface TenantRequest {
  tenantRequestId: number;
  organisationName: string;
  contactName: string;
  contactEmail: string;
  purpose?: string | null;
  status: string;
  dateCreated?: string;
  decidedAt?: string;
  decisionNote?: string | null;
  createdTenantId?: number | null;
}

/**
 * Requests for a workspace, waiting on a decision.
 *
 * Approving one creates a tenant and its first administrator, and emails that person a
 * password that works once. The password is generated on the server and never comes back in
 * the response, so it is not shown here -- an administrator granting a request has no reason
 * to hold somebody else's credential.
 */
@Component({
  selector: 'app-tenant-requests',
  imports: [TableShell, StatTile, StatusPill, Icon, DatePipe, Pagination],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Workspace Requests</h1>
          <p class="page-subtitle">
            Asks from outside for a workspace. Approving one creates the tenant, its first
            administrator, and emails them how to sign in.
          </p>
        </div>
        <button type="button" class="btn btn-default btn-sm" (click)="load()" [disabled]="loading()">
          <app-icon name="refresh" [class.spin]="loading()" />Refresh
        </button>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        @for (tile of [
          { label: 'Waiting',  value: summary().pending,  foot: 'need a decision', icon: 'inbox', tone: 'warn' },
          { label: 'Approved', value: summary().approved, foot: 'became tenants', icon: 'checkCircle', tone: 'ok' },
          { label: 'Rejected', value: summary().rejected, foot: 'declined', icon: 'xCircle', tone: 'info' },
          { label: 'Total',    value: summary().total,    foot: 'all time', icon: 'users', tone: 'info' }
        ]; track tile.label) {
          <app-stat-tile [label]="tile.label" [value]="tile.value" [icon]="tile.icon"
                         [tone]="$any(tile.tone)" [foot]="tile.foot" />
        }
      </div>

      <!-- shown against total, so "0 of 12" reads as a filter that matched nothing rather
           than an empty list. -->
      <app-table-shell heading="Requests" [loading]="loading()" [error]="error()"
                       [isEmpty]="!filtered().length" [shown]="filtered().length"
                       [total]="requests().length"
                       [emptyMessage]="hasFilters()
                         ? 'No request matches those filters.'
                         : 'No requests yet. The form at /request-workspace feeds this list.'"
                       emptyIcon="inbox" (retry)="load()">
        <div toolbar class="flex flex-wrap items-center gap-2">
          <div class="search-field max-w-64">
            <app-icon name="search" size="0.95em" />
            <input class="input" placeholder="Search organisation, contact or purpose"
                   [value]="search()"
                   (input)="search.set($any($event.target).value); pager.reset()" />
          </div>
          <select class="input max-w-36" [value]="statusFilter()"
                  (change)="statusFilter.set($any($event.target).value); pager.reset()">
            <option value="">All statuses</option>
            <option value="Pending">Waiting</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          @if (hasFilters()) {
            <button type="button" class="btn btn-ghost btn-sm" (click)="clearFilters()">
              <app-icon name="close" />Clear
            </button>
          }
        </div>
        <table class="table-modern">
          <thead>
            <tr>
              <th class="w-8"></th>
              <!-- Only the columns worth ordering by. "Asked for" is free prose, and
                   sorting it alphabetically would order requests by whichever word
                   they happen to open with. -->
              <th>
                <button type="button" class="th-sort"
                        [class.th-sort-active]="sort.key() === 'organisationName'"
                        (click)="sort.toggle('organisationName')">
                  Organisation
                  <app-icon [name]="sort.iconFor('organisationName')" size="0.875rem"
                            [class]="sort.key() === 'organisationName' ? 'icon-info' : 'icon-muted'" />
                </button>
              </th>
              <th>
                <button type="button" class="th-sort"
                        [class.th-sort-active]="sort.key() === 'contactName'"
                        (click)="sort.toggle('contactName')">
                  Contact
                  <app-icon [name]="sort.iconFor('contactName')" size="0.875rem"
                            [class]="sort.key() === 'contactName' ? 'icon-info' : 'icon-muted'" />
                </button>
              </th>
              <th>Asked for</th>
              <th>
                <button type="button" class="th-sort"
                        [class.th-sort-active]="sort.key() === 'dateCreated'"
                        (click)="sort.toggle('dateCreated')">
                  Received
                  <app-icon [name]="sort.iconFor('dateCreated')" size="0.875rem"
                            [class]="sort.key() === 'dateCreated' ? 'icon-info' : 'icon-muted'" />
                </button>
              </th>
              <th>
                <button type="button" class="th-sort"
                        [class.th-sort-active]="sort.key() === 'status'"
                        (click)="sort.toggle('status')">
                  Status
                  <app-icon [name]="sort.iconFor('status')" size="0.875rem"
                            [class]="sort.key() === 'status' ? 'icon-info' : 'icon-muted'" />
                </button>
              </th>
              <th class="w-12"></th>
            </tr>
          </thead>
          <tbody>
            @for (r of paged(); track r.tenantRequestId) {
              <tr [class.row-open]="isOpen(r.tenantRequestId)">
                <td>
                  <button type="button" class="btn btn-ghost btn-icon btn-sm"
                          [attr.aria-expanded]="isOpen(r.tenantRequestId)"
                          [attr.aria-label]="(isOpen(r.tenantRequestId) ? 'Hide' : 'Show')
                                             + ' the full request from ' + r.organisationName"
                          (click)="toggle(r.tenantRequestId)">
                    <app-icon [name]="isOpen(r.tenantRequestId) ? 'chevronDown' : 'chevronRight'" />
                  </button>
                </td>
                <td class="font-medium">{{ r.organisationName }}</td>
                <td>
                  <div class="text-sm">{{ r.contactName }}</div>
                  <div class="mono text-xs text-[color:var(--text-muted)]">{{ r.contactEmail }}</div>
                </td>
                <td class="text-sm max-w-72">
                  @if (r.purpose) {
                    <button type="button"
                            class="text-left w-full cursor-pointer bg-transparent border-0 p-0
                                   text-inherit hover:text-accent transition-colors"
                            [attr.aria-expanded]="isOpen(r.tenantRequestId)"
                            (click)="toggle(r.tenantRequestId)">
                      <!-- Stays clamped when open: the panel below carries the full text at a
                           readable measure, and these opening words are what tie the two
                           together. Unclamping here as well printed the paragraph twice. -->
                      <span class="line-clamp-2">{{ r.purpose }}</span>
                    </button>
                  } @else {
                    <span class="text-[color:var(--text-muted)]">Nothing was written here</span>
                  }
                </td>
                <td class="text-xs text-[color:var(--text-secondary)] whitespace-nowrap">
                  {{ r.dateCreated ? (r.dateCreated | date:'d MMM y') : '—' }}
                </td>
                <td>
                  <!-- A full chip, not the quiet dot: this column is the whole point of the
                       screen, and Pending in particular is the state somebody is scanning for. -->
                  <app-status [label]="r.status" />
                  @if (r.status === 'Rejected' && r.decisionNote && !isOpen(r.tenantRequestId)) {
                    <div class="text-xs text-[color:var(--text-muted)] mt-0.5 line-clamp-1">
                      {{ r.decisionNote }}
                    </div>
                  }
                </td>
                <td>
                  @if (r.status === 'Pending') {
                    <div class="flex items-center gap-1">
                      <button type="button" class="btn btn-primary btn-sm"
                              [disabled]="busy() === r.tenantRequestId" (click)="approve(r)">
                        Approve
                      </button>
                      <button type="button" class="btn btn-ghost btn-sm"
                              [disabled]="busy() === r.tenantRequestId" (click)="reject(r)">
                        Reject
                      </button>
                    </div>
                  } @else {
                    <span class="text-xs text-[color:var(--text-muted)] whitespace-nowrap">
                      {{ r.decidedAt ? (r.decidedAt | date:'d MMM') : '' }}
                    </span>
                  }
                </td>
              </tr>

              @if (isOpen(r.tenantRequestId)) {
                <tr class="row-detail">
                  <td colspan="7" class="bg-sunken">
                    <div class="px-3 py-4 flex flex-col gap-4 max-w-3xl">
                      <div class="flex flex-col gap-1.5">
                        <h3 class="text-[11px] font-semibold uppercase tracking-wider
                                   text-[color:var(--text-muted)]">What they asked for</h3>
                        <p class="text-sm leading-relaxed whitespace-pre-wrap">{{ r.purpose }}</p>
                      </div>
                      <div class="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                        <div class="flex flex-col gap-0.5">
                          <span class="text-[11px] uppercase tracking-wider
                                       text-[color:var(--text-muted)]">Contact</span>
                          <span>{{ r.contactName }}</span>
                        </div>
                        <div class="flex flex-col gap-0.5">
                          <span class="text-[11px] uppercase tracking-wider
                                       text-[color:var(--text-muted)]">Email</span>
                          <a class="link-inline mono text-xs"
                             [href]="'mailto:' + r.contactEmail">{{ r.contactEmail }}</a>
                        </div>
                        @if (r.decidedAt) {
                          <div class="flex flex-col gap-0.5">
                            <span class="text-[11px] uppercase tracking-wider
                                         text-[color:var(--text-muted)]">Decided</span>
                            <span class="text-xs">{{ r.decidedAt | date:'d MMM y, HH:mm' }}</span>
                          </div>
                        }
                      </div>
                      @if (r.decisionNote) {
                        <div class="flex flex-col gap-1.5">
                          <h3 class="text-[11px] font-semibold uppercase tracking-wider
                                     text-[color:var(--text-muted)]">Reason given</h3>
                          <p class="text-sm leading-relaxed whitespace-pre-wrap">{{ r.decisionNote }}</p>
                        </div>
                      }
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>

        <app-pagination pager [total]="filtered().length" [page]="pager.page()"
                        [size]="pager.size()" (goTo)="goToPage($event)"
                        (setSize)="setPageSize($event)" />
      </app-table-shell>
    </div>
  `,
  styles: [`
    /* An open row and its panel are one thing, so the border between them is dropped and the
       pair shares a ground. Without this the panel reads as an unrelated full-width row. */
    tr.row-open > td { border-bottom-color: transparent; background: var(--surface-sunken); }
    tr.row-detail > td { border-bottom: 1px solid var(--border-subtle); }
  `],
})
export class TenantRequests implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly requests = signal<TenantRequest[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal<number | null>(null);

  /** Free text across the four things a reviewer would recognise a request by. */
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly sort = createSort<TenantRequest>('dateCreated', 'desc');
  readonly pager = createPager<TenantRequest>();

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const rows = this.requests().filter(request => {
      if (status && request.status !== status) return false;
      if (!term) return true;
      // Purpose is included on purpose: it is often the only thing a reviewer remembers about a
      // request, and it is the field the decision actually rests on.
      return `${request.organisationName} ${request.contactName} ${request.contactEmail} ${request.purpose ?? ''}`
        .toLowerCase().includes(term);
    });
    return this.sort.apply(rows, (row, key) => (row as any)[key]);
  });

  readonly hasFilters = computed(() => !!this.search().trim() || !!this.statusFilter());

  /** The page on screen. createPager clamps, so filtering down cannot strand you on page 4. */
  readonly paged = computed(() => this.pager.slice(this.filtered()));

  goToPage(next: number): void { this.pager.goTo(next, this.filtered().length); }
  setPageSize(size: number): void { this.pager.setSize(size); }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.pager.reset();
  }

  /**
   * Which requests are showing their full text.
   *
   * The purpose is the only thing a reviewer has to go on, and it does not fit a table cell.
   * It used to be clamped to two lines behind a title tooltip -- which cannot be selected,
   * copied, or reached at all on a touch screen. Opening the row shows the whole thing.
   */
  private readonly open = signal<ReadonlySet<number>>(new Set());

  isOpen(id: number): boolean {
    return this.open().has(id);
  }

  toggle(id: number): void {
    const next = new Set(this.open());
    if (!next.delete(id)) {
      next.add(id);
    }
    this.open.set(next);
  }

  readonly summary = computed(() => {
    const list = this.requests();
    return {
      total: list.length,
      pending: list.filter(r => r.status === 'Pending').length,
      approved: list.filter(r => r.status === 'Approved').length,
      rejected: list.filter(r => r.status === 'Rejected').length,
    };
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<TenantRequest[]>>(
      `${API_BASE}/tenantRequest.json/listRequests`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.requests.set(response.data ?? []);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the requests.');
      },
    });
  }

  async approve(request: TenantRequest): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Create a workspace for ${request.organisationName}?`,
      body: `This creates the tenant and makes ${request.contactEmail} its first administrator. `
          + 'They are emailed a password that works once, and the console asks them to choose '
          + 'their own the first time they sign in.',
      confirmLabel: 'Approve and create',
    });
    if (!ok) return;
    this.decide('approve', request,
      new HttpParams().set('tenantRequestId', String(request.tenantRequestId)),
      'The workspace could not be created.');
  }

  async reject(request: TenantRequest): Promise<void> {
    // Its own dialog rather than a yes/no confirm, because the endpoint takes a reason and
    // nothing was ever collecting one -- decision_note was written on every rejection and null
    // on every row. Closing with the string (or null when cancelled) makes it impossible to
    // proceed while forgetting to read it.
    const note = await firstValueFrom(
      this.dialog.open<string | null>(RejectDialog, {
        data: { organisationName: request.organisationName }, hasBackdrop: true,
      }).closed);
    if (note === null || note === undefined) return;
    let params = new HttpParams().set('tenantRequestId', String(request.tenantRequestId));
    if (note) {
      params = params.set('note', note);
    }
    this.decide('reject', request, params, 'The request could not be rejected.');
  }

  /**
   * Posts a decision and reflects the outcome.
   *
   * Both decisions did the same five things -- mark the row busy, post, clear busy, toast, and
   * reload -- written out twice with only the endpoint and the fallback message differing. The
   * duplication was the kind that drifts: a fix applied to one and forgotten on the other.
   *
   * The server's own message is shown rather than a fixed line, because a decision can partly
   * succeed: approving creates the workspace even when the welcome email does not send, and only
   * the server knows which happened.
   */
  private decide(action: 'approve' | 'reject', request: TenantRequest,
                 params: HttpParams, failureMessage: string): void {
    this.busy.set(request.tenantRequestId);
    this.http.post<ApiResponse>(`${API_BASE}/tenantRequest.json/${action}`, null, { params })
      .subscribe({
        next: response => {
          this.busy.set(null);
          if (response.status === API_SUCCESS) {
            this.toast.success(response.message);
            this.load();
          } else {
            this.toast.error(response.message);
          }
        },
        error: err => {
          this.busy.set(null);
          this.toast.error(err?.error?.message || failureMessage);
        },
      });
  }
}
