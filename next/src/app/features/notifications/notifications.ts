import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { LIST_LIMIT } from '../../core/api/list-limit';
import { instantOf } from '../../core/instant';
import { ToastService } from '../../shared/ui/toast.service';
import { TableShell } from '../../shared/ui/data-table';
import { Icon } from '../../shared/ui/icon';
import { Pagination } from '../../shared/ui/pagination';
import { createPager } from '../../shared/ui/pager';
import { notificationTarget } from './notification-links';

interface Notification {
  notificationId: number;
  title: string;
  message?: string;
  severity?: string;
  type?: string;
  read: boolean;
  dateCreated: string;
  /** The API field is linkUrl; this was read as linkPath, so nothing was ever clickable. */
  linkUrl?: string;
}

/**
 * The standard envelope plus the paging block PagingUtil attaches to a paged list.
 *
 * `totalRecord` is the only thing on the wire that says how many notifications the user really
 * has. Without it a fetch of exactly LIST_LIMIT rows is indistinguishable from a mailbox that
 * happens to hold exactly that many, and the screen cannot tell the user anything is missing.
 */
interface NotificationListResponse
  extends ApiResponse<{ content?: Notification[] } | Notification[]> {
  paging?: { totalRecord?: number };
}

@Component({
  selector: 'app-notifications',
  imports: [DatePipe, TableShell, Icon, Pagination],
  templateUrl: './notifications.html',
})
export class Notifications implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly items = signal<Notification[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly unreadOnly = signal(false);
  readonly typeFilter = signal('');

  /**
   * How many notifications this user actually has, as reported by the server's paging block.
   *
   * Not the same as items().length: the fetch is capped at LIST_LIMIT, and the whole point of
   * keeping this separate is so the screen can say "1000 of 1420" rather than quietly claiming
   * the 1000 it holds are all there are.
   */
  readonly total = signal(0);

  /**
   * The ids whose mark-read request is in flight.
   *
   * A set rather than a single id: the guard only ever needed to stop the SAME row being sent
   * twice, but one shared id made every other row's button a no-op while any request was open --
   * the click did nothing, showed nothing, and the row stayed unread. Marking a second row while
   * the first is still going is a perfectly ordinary thing to do on this screen.
   */
  private readonly marking = signal<ReadonlySet<number>>(new Set<number>());

  /** True while "Mark all read" is in flight; guards that one button against double-fire. */
  readonly markingAll = signal(false);

  /**
   * Client-side paging over the fetched rows, as every other list screen here does it. The
   * server side of the fix is the LIST_LIMIT fetch below: this screen used to ask for 100 rows
   * and render all of them, so notification 101 could not be reached by any means.
   */
  readonly pager = createPager<Notification>();

  readonly types = computed(() =>
    [...new Set(this.items().map(n => n.type).filter(Boolean))].sort() as string[]);

  readonly filtered = computed(() => {
    const type = this.typeFilter();
    return this.items().filter(n => {
      if (this.unreadOnly() && n.read) return false;
      if (type && n.type !== type) return false;
      return true;
    });
  });

  readonly paged = computed(() => this.pager.slice(this.filtered()));

  readonly unreadCount = computed(() => this.items().filter(n => !n.read).length);
  readonly hasFilters = computed(() => this.unreadOnly() || !!this.typeFilter());

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    // LIST_LIMIT, not 100. This endpoint is paged and the screen asked for a single fixed page
    // of it, so a tenant past 100 notifications simply lost the older ones -- there was no pager
    // to walk back with and no count on screen to say that anything had been left behind.
    this.http.get<NotificationListResponse>(
      `${API_BASE}/notification.json/list`,
      { params: { page: '1', limit: String(LIST_LIMIT) } }).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        // The endpoint has returned both a bare array and a paged wrapper at different
        // times; accept either rather than break on the shape.
        const data = response.data as any;
        const rows: Notification[] = Array.isArray(data) ? data : (data?.content ?? []);
        this.items.set(rows);
        const reported = Number(response.paging?.totalRecord);
        // Fall back to what arrived when the paging block is missing or nonsensical, so the
        // heading can never claim fewer rows exist than the screen is already showing.
        this.total.set(Number.isFinite(reported) && reported > rows.length ? reported : rows.length);
        if (rows.length < this.total()) {
          this.toast.info(
            `Showing the newest ${rows.length} of ${this.total()} notifications.`);
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load notifications.');
      },
    });
  }

  /**
   * A timestamp from the API as a real instant, for the date pipe.
   *
   * The pipe was handed the raw string. A notification's dateCreated is a Java LocalDateTime and
   * carries no offset, so the pipe read the server's wall clock as the reader's own and the date
   * column was hours out for anyone outside the server's zone. See core/instant.ts.
   */
  when(text: string | null | undefined): Date | null {
    return instantOf(text);
  }

  /** Whether this row's mark-read request is still open, for its button's disabled state. */
  isMarking(item: Notification): boolean {
    return this.marking().has(item.notificationId);
  }

  /** A filter changes what "page 2" means, so the pager goes back to the top of the new list. */
  onFilterChange(): void {
    this.pager.reset();
  }

  goToPage(next: number): void { this.pager.goTo(next, this.filtered().length); }

  setPageSize(size: number): void { this.pager.setSize(size); }

  clearFilters(): void {
    this.unreadOnly.set(false);
    this.typeFilter.set('');
    this.onFilterChange();
  }

  /** Where a row goes when clicked, or null when the notification carries no link. */
  targetOf(item: Notification): string | null {
    return notificationTarget(item.linkUrl);
  }

  open(item: Notification): void {
    this.markRead(item);
    const target = this.targetOf(item);
    if (target) this.router.navigateByUrl(target);
  }

  markRead(item: Notification): void {
    if (item.read || this.isMarking(item)) return;
    this.beginMarking(item.notificationId);
    this.http.post<ApiResponse>(`${API_BASE}/notification.json/markRead/${item.notificationId}`, null)
      .subscribe({
        next: () => {
          this.endMarking(item.notificationId);
          this.items.update(list =>
            list.map(n => (n.notificationId === item.notificationId ? { ...n, read: true } : n)));
        },
        error: () => {
          this.endMarking(item.notificationId);
          this.toast.error('Could not mark that as read.');
        },
      });
  }

  private beginMarking(notificationId: number): void {
    this.marking.update(ids => new Set(ids).add(notificationId));
  }

  private endMarking(notificationId: number): void {
    this.marking.update(ids => {
      const next = new Set(ids);
      next.delete(notificationId);
      return next;
    });
  }

  markAllRead(): void {
    if (this.markingAll()) return;
    this.markingAll.set(true);
    this.http.post<ApiResponse>(`${API_BASE}/notification.json/markAllRead`, null).subscribe({
      next: () => {
        this.markingAll.set(false);
        this.items.update(list => list.map(n => ({ ...n, read: true })));
        this.toast.success('All notifications marked as read.');
      },
      error: () => {
        this.markingAll.set(false);
        this.toast.error('Could not mark them as read.');
      },
    });
  }

  private severity(item: Notification): string {
    return (item.severity || '').toUpperCase();
  }

  /** Shape as well as colour, so severity survives a greyscale print or colour blindness. */
  glyphOf(item: Notification): string {
    switch (this.severity(item)) {
      case 'SUCCESS': return 'checkCircle';
      case 'ERROR':   return 'xCircle';
      case 'WARNING': return 'alert';
      default:        return 'info';
    }
  }

  intentOf(item: Notification): string {
    switch (this.severity(item)) {
      case 'SUCCESS': return 'icon-ok';
      case 'ERROR':   return 'icon-crit';
      case 'WARNING': return 'icon-warn';
      default:        return 'icon-info';
    }
  }

  toneOf(item: Notification): string {
    switch (this.severity(item)) {
      case 'SUCCESS': return 'var(--color-ok-500)';
      case 'ERROR':   return 'var(--color-crit-500)';
      case 'WARNING': return 'var(--color-warn-500)';
      default:        return 'var(--color-brand-500)';
    }
  }

  /** JOB_COMPLETED reads as shouting; the label is for people. */
  typeLabel(type?: string): string {
    if (!type) return '';
    return type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
  }

  /**
   * The chip is only worth showing when it adds something. JOB_COMPLETED renders as
   * "Job completed", which is the title verbatim on most rows.
   */
  showType(item: Notification): boolean {
    const label = this.typeLabel(item.type);
    return !!label && label.toLowerCase() !== (item.title || '').trim().toLowerCase();
  }
}
