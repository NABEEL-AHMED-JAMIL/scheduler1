import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, tap } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../api/api.config';

/**
 * The unread notification count, once for the whole app, and the one way to mark notifications read.
 *
 * The bell, the dashboard's Unread tile, the profile and the Notifications page each read the
 * endpoint into a copy of their own, so marking everything read in the bell zeroed the badge and
 * left the tile lit, and marking rows on the Notifications page left the badge stale until the
 * bell's next poll. All of them now show this one signal. The bell and the Notifications page
 * mark through markRead/markAllRead, so the count moves the moment the server agrees and each
 * view hears (through `marked`) about rows the other one marked.
 */
@Injectable({ providedIn: 'root' })
export class UnreadCountService {
  private readonly http = inject(HttpClient);

  readonly count = signal(0);

  /** A notification id that was marked read, or 'all'. Sent only once the server has agreed. */
  readonly marked = new Subject<number | 'all'>();

  /** The server's figure. A failed, refused or non-numeric read keeps the last one rather than showing zero. */
  refresh(): void {
    this.http.get<ApiResponse<number>>(`${API_BASE}/notification.json/unreadCount`).subscribe({
      next: response => {
        const count = Number(response.data ?? 0);
        if (response.status === API_SUCCESS && Number.isFinite(count)) this.count.set(count);
      },
      error: () => {},
    });
  }

  /** One notification was read (or `n`); the next refresh corrects any drift. */
  markedRead(n = 1): void {
    this.count.update(count => Math.max(0, count - n));
  }

  clear(): void {
    this.count.set(0);
  }

  /** Marks one read on the server. The caller still sees the response, for its own toast; a 200 can carry a refusal. */
  markRead(notificationId: number): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${API_BASE}/notification.json/markRead/${notificationId}`, null)
      .pipe(tap(response => {
        if (response.status !== API_SUCCESS) return;
        this.markedRead();
        this.marked.next(notificationId);
      }));
  }

  markAllRead(): Observable<ApiResponse> {
    return this.http.post<ApiResponse>(`${API_BASE}/notification.json/markAllRead`, null)
      .pipe(tap(response => {
        if (response.status !== API_SUCCESS) return;
        this.clear();
        this.marked.next('all');
      }));
  }
}
