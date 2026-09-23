import {
  Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { instantMs } from '../../core/instant';
import { Icon } from '../../shared/ui/icon';
import { notificationTarget } from '../notifications/notification-links';

interface Note {
  notificationId: number;
  title: string;
  message?: string;
  severity?: string;
  read: boolean;
  dateCreated: string;
  linkUrl?: string;
}

/** How many rows the dropdown lists before handing over to the full notifications page. */
const PANEL_ROWS = 8;

/** How many rows the dropdown fetches to pick those from. */
const FETCH_ROWS = 20;

/**
 * The bell the old app had in its header.
 *
 * Without it the notifications page had no entry point anywhere in the UI -- it was not in the
 * navigation either, so the only way to reach it was to type the URL.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [Icon, RouterLink],
  template: `
    <div class="relative" data-nav-menu>
      <button type="button" class="btn btn-ghost btn-icon relative" (click)="toggle()"
              aria-haspopup="true" [attr.aria-expanded]="open()"
              [attr.aria-label]="unread() ? unread() + ' unread notifications' : 'Notifications'">
        <app-icon name="bell" size="1.05em" />
        @if (unread()) {
          <span class="bell-badge">{{ unread() > 99 ? '99+' : unread() }}</span>
        }
      </button>

      @if (open()) {
        <div class="absolute right-0 top-full mt-1 w-80 rounded-lg border shadow-lg z-50 overflow-hidden bg-raised border-subtle"
            >
          <div class="flex items-center gap-2 px-3 py-2 border-b border-subtle"
              >
            <span class="text-sm font-semibold mr-auto">Notifications</span>
            @if (unread()) {
              <button type="button" class="btn btn-ghost btn-sm" (click)="markAllRead()">
                <app-icon name="check" size="0.85em" />Mark all read
              </button>
            }
          </div>

          @if (!recent().length) {
            <div class="px-3 py-8 text-center">
              <app-icon name="bell" size="1.5rem" class="icon-muted block mx-auto mb-2" />
              <p class="text-sm text-[color:var(--text-muted)]">You are all caught up.</p>
            </div>
          } @else {
            <ul class="max-h-80 overflow-y-auto divide-y divide-[color:var(--border-subtle)]">
              @for (note of recent(); track note.notificationId) {
                <li>
                  <button type="button" class="w-full text-left flex items-start gap-2.5 px-3 py-2.5
                                               transition-colors hover:bg-[color:var(--surface-sunken)]"
                          [class.is-unread]="!note.read"
                          (click)="open_(note)">
                    <app-icon [name]="glyphOf(note)" [class]="intentOf(note)" size="1em"
                              class="mt-0.5 shrink-0" />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-1.5">
                        <span class="text-sm font-medium truncate">{{ note.title }}</span>
                        @if (!note.read) {
                          <span class="size-1.5 rounded-full bg-[color:var(--accent-text)] shrink-0"></span>
                        }
                      </span>
                      @if (note.message) {
                        <span class="block text-xs text-[color:var(--text-secondary)] mt-0.5
                                     leading-snug line-clamp-2">{{ note.message }}</span>
                      }
                      <span class="block text-[11px] text-[color:var(--text-muted)] mt-1">
                        {{ ago(note.dateCreated) }}
                      </span>
                    </span>
                  </button>
                </li>
              }
            </ul>
          }

          <!-- The badge counts the whole mailbox; this panel holds eight rows. Without this line
               a badge reading 30 over a panel showing nothing unread looks like a bug. -->
          @if (hiddenUnread()) {
            <p class="px-3 pt-2 text-[11px] text-center text-[color:var(--text-muted)]">
              {{ hiddenUnread() }} more unread not shown here.
            </p>
          }

          <a routerLink="/notifications" (click)="open.set(false)"
             class="block px-3 py-2 text-sm text-center border-t text-accent hover:underline border-subtle"
            >
            View all notifications
          </a>
        </div>
      }
    </div>
  `,
})
export class NotificationBell implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly open = signal(false);
  readonly items = signal<Note[]>([]);

  /**
   * The badge, as the server counts it.
   *
   * This used to be a tally of the unread rows among the twenty this component fetches, so a
   * user with more than twenty unread saw a badge that stopped at twenty and disagreed with the
   * dashboard tile -- which reads the endpoint below. Same number, same source, one truth.
   */
  readonly unread = signal(0);

  /**
   * What the panel lists: unread first, then the newest read rows to fill the space.
   *
   * Taking the newest eight whatever their state meant the badge and the panel could describe
   * different sets -- unread items that were not among the eight newest left the badge lit over
   * a panel with nothing unread in it, which reads as a broken badge. Both groups keep the
   * dateCreated-desc order the endpoint returns them in.
   */
  readonly recent = computed(() => {
    const rows = this.items();
    return rows.filter(note => !note.read)
      .concat(rows.filter(note => note.read))
      .slice(0, PANEL_ROWS);
  });

  /**
   * Unread notifications the badge counts that the panel has no room to show -- older than the
   * fetched window, or past PANEL_ROWS. Said out loud rather than left as a silent gap, so the
   * badge's number is always accounted for by something on screen.
   */
  readonly hiddenUnread = computed(() =>
    Math.max(0, this.unread() - this.recent().filter(note => !note.read).length));

  private timer: any = null;

  ngOnInit(): void {
    this.load();
    // Cheap enough at this size, and a notification nobody sees is not a notification.
    this.timer = setInterval(() => this.load(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  toggle(): void {
    this.open.update(v => !v);
    if (this.open()) this.load();
  }

  // Shell's own document:click/Escape handlers close its nav dropdowns but never touch this
  // component's `open` -- they don't know about it, and shouldn't have to. Without these two,
  // clicking anywhere else on the page or pressing Escape closed every other header dropdown
  // and left this one open; it could only be dismissed by clicking the bell again, a
  // notification, or "View all notifications".
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }

  private load(): void {
    // The count comes from the server rather than from the rows below, because the rows below are
    // one small window onto the mailbox and the badge is a statement about all of it.
    this.http.get<ApiResponse<number>>(`${API_BASE}/notification.json/unreadCount`).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.unread.set(Number(response.data ?? 0));
      },
      error: () => {},
    });
    this.http.get<ApiResponse<any>>(`${API_BASE}/notification.json/list`,
      { params: { page: '1', limit: String(FETCH_ROWS) } }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const data = response.data as any;
        this.items.set(Array.isArray(data) ? data : (data?.content ?? []));
      },
      // A failing bell must not put an error in front of whatever the user is doing.
      error: () => {},
    });
  }

  open_(note: Note): void {
    this.open.set(false);
    if (!note.read) {
      this.http.post<ApiResponse>(`${API_BASE}/notification.json/markRead/${note.notificationId}`, null)
        .subscribe({
          next: response => {
            // Quietly, as every bell failure is -- but a refusal must not flip the row.
            if (response.status !== API_SUCCESS) return;
            this.items.update(list =>
              list.map(n => (n.notificationId === note.notificationId ? { ...n, read: true } : n)));
            // The badge is the server's number now, so it no longer falls on its own when a row
            // flips to read; it has to be moved here or it stays put until the next poll.
            this.unread.update(count => Math.max(0, count - 1));
          },
          error: () => {},
        });
    }
    const target = notificationTarget(note.linkUrl);
    if (target) this.router.navigateByUrl(target);
  }

  markAllRead(): void {
    this.http.post<ApiResponse>(`${API_BASE}/notification.json/markAllRead`, null).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        this.items.update(list => list.map(n => ({ ...n, read: true })));
        this.unread.set(0);
      },
      error: () => {},
    });
  }

  private severity(note: Note): string { return (note.severity || '').toUpperCase(); }

  glyphOf(note: Note): string {
    switch (this.severity(note)) {
      case 'SUCCESS': return 'checkCircle';
      case 'ERROR':   return 'xCircle';
      case 'WARNING': return 'alert';
      default:        return 'info';
    }
  }

  intentOf(note: Note): string {
    switch (this.severity(note)) {
      case 'SUCCESS': return 'icon-ok';
      case 'ERROR':   return 'icon-crit';
      case 'WARNING': return 'icon-warn';
      default:        return 'icon-info';
    }
  }

  /**
   * How long ago a notification arrived.
   *
   * Through instantMs, not new Date(). dateCreated is a Java LocalDateTime and carries no offset,
   * so new Date() read the server's wall clock as the reader's own: a notification a minute old
   * showed as "5h ago" -- or as a time in the future -- for anyone outside the server's zone,
   * and the bell is exactly where a stale-looking timestamp is most alarming. See core/instant.ts.
   */
  ago(text: string): string {
    const then = instantMs(text);
    if (then === null) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return days < 30 ? `${days}d ago` : new Date(then).toLocaleDateString();
  }
}
