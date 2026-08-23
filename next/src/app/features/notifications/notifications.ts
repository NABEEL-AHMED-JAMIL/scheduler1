import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { TableShell } from '../../shared/ui/data-table';
import { Icon } from '../../shared/ui/icon';

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
 * The backend stores routes from the Angular 8 app, so a stored link points at a page that
 * does not exist here. Rewriting them on the way out keeps old rows useful without touching
 * the data or breaking the old app, which is still running against the same database.
 */
const ROUTE_MAP: Record<string, string> = {
  '/jobList': '/jobs',
  '/taskList': '/tasks',
  '/objectBrowser': '/objects',
  '/users': '/admin/users',
  '/tenants': '/admin/tenants',
};

@Component({
  selector: 'app-notifications',
  imports: [DatePipe, TableShell, Icon],
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

  readonly unreadCount = computed(() => this.items().filter(n => !n.read).length);
  readonly hasFilters = computed(() => this.unreadOnly() || !!this.typeFilter());

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<{ content?: Notification[] } | Notification[]>>(
      `${API_BASE}/notification.json/list`, { params: { page: '1', limit: '100' } }).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        // The endpoint has returned both a bare array and a paged wrapper at different
        // times; accept either rather than break on the shape.
        const data = response.data as any;
        this.items.set(Array.isArray(data) ? data : (data?.content ?? []));
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load notifications.');
      },
    });
  }

  clearFilters(): void {
    this.unreadOnly.set(false);
    this.typeFilter.set('');
  }

  /** Where a row goes when clicked, or null when the notification carries no link. */
  targetOf(item: Notification): string | null {
    const raw = (item.linkUrl ?? '').trim();
    if (!raw) return null;
    const [path] = raw.split('?');
    return ROUTE_MAP[path] ?? (path.startsWith('/') ? path : null);
  }

  open(item: Notification): void {
    this.markRead(item);
    const target = this.targetOf(item);
    if (target) this.router.navigateByUrl(target);
  }

  markRead(item: Notification): void {
    if (item.read) return;
    this.http.post<ApiResponse>(`${API_BASE}/notification.json/markRead/${item.notificationId}`, null)
      .subscribe({
        next: () => this.items.update(list =>
          list.map(n => (n.notificationId === item.notificationId ? { ...n, read: true } : n))),
        error: () => this.toast.error('Could not mark that as read.'),
      });
  }

  markAllRead(): void {
    this.http.post<ApiResponse>(`${API_BASE}/notification.json/markAllRead`, null).subscribe({
      next: () => {
        this.items.update(list => list.map(n => ({ ...n, read: true })));
        this.toast.success('All notifications marked as read.');
      },
      error: () => this.toast.error('Could not mark them as read.'),
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
