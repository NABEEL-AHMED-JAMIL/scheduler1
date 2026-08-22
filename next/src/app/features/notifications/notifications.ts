import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ToastService } from '../../shared/ui/toast.service';
import { TableShell } from '../../shared/ui/data-table';

interface Notification {
  notificationId: number;
  title: string;
  message?: string;
  severity?: string;
  type?: string;
  read: boolean;
  dateCreated: string;
  linkPath?: string;
}

@Component({
  selector: 'app-notifications',
  imports: [DatePipe, TableShell],
  templateUrl: './notifications.html',
})
export class Notifications implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly items = signal<Notification[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly unreadOnly = signal(false);

  readonly filtered = computed(() =>
    this.unreadOnly() ? this.items().filter(n => !n.read) : this.items());

  readonly unreadCount = computed(() => this.items().filter(n => !n.read).length);

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

  toneOf(item: Notification): string {
    switch ((item.severity || '').toUpperCase()) {
      case 'SUCCESS': return 'var(--color-ok-500)';
      case 'ERROR':   return 'var(--color-crit-500)';
      case 'WARNING': return 'var(--color-warn-500)';
      default:        return 'var(--color-brand-500)';
    }
  }
}
