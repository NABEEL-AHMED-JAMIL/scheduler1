import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, tap } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../api/api.config';

/**
 * The unread count, and the one way to mark notifications read.
 *
 * The header bell and the Notifications page used to post on their own, and only the bell kept a
 * count. Marking rows on the page left the badge where it was until the bell's next poll, a
 * minute later. Both views now mark through here, so the badge moves the moment the server
 * agrees, and each view hears about rows the other one marked.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly http = inject(HttpClient);

  /** The server's count of unread notifications for this user. */
  readonly unread = signal(0);

  /** A notification id that was marked read, or 'all'. Sent only once the server has agreed. */
  readonly marked = new Subject<number | 'all'>();

  /** Asks the server for the count. A failure keeps the last number: the badge is not worth an error. */
  refreshUnread(): void {
    this.http.get<ApiResponse<number>>(`${API_BASE}/notification.json/unreadCount`).subscribe({
      next: response => {
        const count = Number(response.data ?? 0);
        if (response.status === API_SUCCESS && Number.isFinite(count)) this.unread.set(count);
      },
      error: () => {},
    });
  }

  /** The caller still sees the response, for its own toast; a 200 can carry a refusal. */
  markRead(notificationId: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${API_BASE}/notification.json/markRead/${notificationId}`, null)
      .pipe(tap(response => {
        if (response.status !== API_SUCCESS) return;
        this.unread.update(count => Math.max(0, count - 1));
        this.marked.next(notificationId);
      }));
  }

  markAllRead(): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${API_BASE}/notification.json/markAllRead`, null)
      .pipe(tap(response => {
        if (response.status !== API_SUCCESS) return;
        this.unread.set(0);
        this.marked.next('all');
      }));
  }
}
