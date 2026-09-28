import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../api/api.config';

/**
 * The unread notification count, once for the whole app.
 *
 * The bell and the dashboard's Unread tile each read the endpoint into a copy of their own, so
 * marking everything read in the bell zeroed the badge and left the tile lit until the page was
 * reloaded. Both now show this one signal, and whoever marks something read says so here.
 */
@Injectable({ providedIn: 'root' })
export class UnreadCountService {
  private readonly http = inject(HttpClient);

  readonly count = signal(0);

  /** The server's figure. A failed or refused read keeps the last one rather than showing zero. */
  refresh(): void {
    this.http.get<ApiResponse<number>>(`${API_BASE}/notification.json/unreadCount`).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.count.set(Number(response.data ?? 0));
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
}
