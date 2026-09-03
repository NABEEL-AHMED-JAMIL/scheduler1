import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
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
            <ul class="max-h-80 overflow-y-auto divide-y border-subtle">
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
                          <span class="size-1.5 rounded-full bg-brand-500 shrink-0"></span>
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

  readonly open = signal(false);
  readonly items = signal<Note[]>([]);
  readonly unread = computed(() => this.items().filter(n => !n.read).length);
  readonly recent = computed(() => this.items().slice(0, 8));

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

  private load(): void {
    this.http.get<ApiResponse<any>>(`${API_BASE}/notification.json/list`,
      { params: { page: '1', limit: '20' } }).subscribe({
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
          next: () => this.items.update(list =>
            list.map(n => (n.notificationId === note.notificationId ? { ...n, read: true } : n))),
          error: () => {},
        });
    }
    const target = notificationTarget(note.linkUrl);
    if (target) this.router.navigateByUrl(target);
  }

  markAllRead(): void {
    this.http.post<ApiResponse>(`${API_BASE}/notification.json/markAllRead`, null).subscribe({
      next: () => this.items.update(list => list.map(n => ({ ...n, read: true }))),
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

  ago(iso: string): string {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return days < 30 ? `${days}d ago` : new Date(then).toLocaleDateString();
  }
}
