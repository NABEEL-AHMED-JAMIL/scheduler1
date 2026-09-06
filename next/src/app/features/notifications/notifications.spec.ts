import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { Notifications } from './notifications';
import { ToastService } from '../../shared/ui/toast.service';

function notificationsFor(post: ReturnType<typeof vi.fn>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { post } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Router, useValue: { navigateByUrl: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Notifications());
}

/**
 * Regression tests: markRead/markAllRead had no busy/loading state at all, so their buttons had
 * no [disabled] binding tied to the in-flight request -- a double-click fired two identical
 * requests. Both methods now guard themselves against re-entry via markingId/markingAll.
 */
describe('Notifications mark-read guards', () => {
  it('markRead ignores a second call while the first is still in flight', () => {
    const responses = new Subject<any>();
    const post = vi.fn(() => responses.asObservable());
    const notifications = notificationsFor(post);
    const item = { notificationId: 1, title: 'A', read: false, dateCreated: '' } as any;

    notifications.markRead(item);
    notifications.markRead(item);
    expect(post).toHaveBeenCalledTimes(1);
    expect(notifications.markingId()).toBe(1);

    responses.next({ status: 'SUCCESS' });
    expect(notifications.markingId()).toBe(null);
  });

  it('markRead is available again for a different row once the first call settles', () => {
    const responses = new Subject<any>();
    const post = vi.fn(() => responses.asObservable());
    const notifications = notificationsFor(post);
    const first = { notificationId: 1, title: 'A', read: false, dateCreated: '' } as any;
    const second = { notificationId: 2, title: 'B', read: false, dateCreated: '' } as any;

    notifications.markRead(first);
    responses.next({ status: 'SUCCESS' });
    notifications.markRead(second);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('markAllRead ignores a second call while the first is still in flight', () => {
    const responses = new Subject<any>();
    const post = vi.fn(() => responses.asObservable());
    const notifications = notificationsFor(post);

    notifications.markAllRead();
    notifications.markAllRead();
    expect(post).toHaveBeenCalledTimes(1);
    expect(notifications.markingAll()).toBe(true);

    responses.next({ status: 'SUCCESS' });
    expect(notifications.markingAll()).toBe(false);
  });

  it('markRead does nothing for an already-read item', () => {
    const post = vi.fn();
    const notifications = notificationsFor(post);
    notifications.markRead({ notificationId: 1, title: 'A', read: true, dateCreated: '' } as any);
    expect(post).not.toHaveBeenCalled();
  });
});
