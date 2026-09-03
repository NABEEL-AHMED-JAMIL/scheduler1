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
import { ViewToggle } from '../../shared/ui/view-toggle';
import { ToastService } from '../../shared/ui/toast.service';
import { copyText } from '../../shared/ui/clipboard.util';
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
  imports: [TableShell, StatTile, StatusPill, Icon, ViewToggle, DatePipe, Pagination],
  templateUrl: './tenant-requests.html',
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

  /**
   * Cards by default, unlike the other admin screens.
   *
   * A request is read before it is compared: the paragraph somebody wrote is the whole basis
   * for approving or refusing, and a table cell can only ever show its first two lines. The
   * table stays for when the list is long enough to want sorting.
   */
  readonly view = signal<'table' | 'cards'>('cards');

  /** Which contact address was last copied, as `<requestId>:<field>`. */
  readonly copiedKey = signal<string | null>(null);

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
    return this.sort.apply(rows, (row, key) =>
      key === 'status' ? (STATUS_ORDER[row.status] ?? 9) : (row as any)[key]);
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

  /**
   * Whether a card needs its "Read all" control.
   *
   * The clamp is four lines and CSS will not say whether it bit, so this estimates from the
   * text. Erring long would print a control that expands nothing, so the threshold sits above
   * what four lines hold at this measure rather than at it.
   */
  isLong(purpose: string): boolean {
    return purpose.length > 220 || purpose.split('\n').length > 4;
  }

  /** The colour of a card's top rule. Amber is the only one that asks for anything. */
  statusAccent(status: string): string {
    switch (status) {
      case 'Pending':  return 'var(--color-warn-600)';
      case 'Approved': return 'var(--color-ok-500)';
      // Not red: a refused request is an ordinary outcome, and spending the alarm colour here
      // would blunt what it means on the screens where something has actually gone wrong.
      default:         return 'var(--border-subtle)';
    }
  }

  copyContact(requestId: number, field: 'email', value: string): void {
    copyText(value).then(ok => {
      if (!ok) {
        this.toast.error('Could not copy that.');
        return;
      }
      const key = `${requestId}:${field}`;
      this.copiedKey.set(key);
      // Only clear if nothing else was copied in the meantime, or a slow first copy would wipe
      // the tick off a second, faster one.
      setTimeout(() => { if (this.copiedKey() === key) this.copiedKey.set(null); }, 1500);
    });
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

  /**
   * What the console calls a request's state.
   *
   * The stat tile and the filter both say "Waiting"; the stored value is Pending. Translating
   * here rather than renaming the domain value keeps one word in front of the reader without
   * touching what the server and the database agree on.
   */
  statusLabel(status: string): string {
    return status === 'Pending' ? 'Waiting' : status;
  }
}

/**
 * Sort order for the Status column.
 *
 * Alphabetical put Approved first and buried Pending in the middle, which is backwards on a
 * screen whose only job is finding the requests nobody has answered yet. Sorting by urgency
 * means one click brings the outstanding work to the top.
 */
const STATUS_ORDER: Record<string, number> = { Pending: 0, Approved: 1, Rejected: 2 };
