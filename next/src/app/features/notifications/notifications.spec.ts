import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { Notifications } from './notifications';
import { ToastService } from '../../shared/ui/toast.service';
import { LIST_LIMIT } from '../../core/api/list-limit';
import { PAGE_SIZES } from '../../shared/ui/pager';

function build(http: Record<string, unknown>) {
  const toast = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const router = { navigateByUrl: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: http },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: router },
    ],
  });
  return { notifications: TestBed.runInInjectionContext(() => new Notifications()), toast, router };
}

function notificationsFor(post: ReturnType<typeof vi.fn>) {
  return build({ post }).notifications;
}

/** `count` rows, newest first, with `unread` deciding which ids are still unread. */
function rows(count: number, unread: (id: number) => boolean = () => false) {
  return Array.from({ length: count }, (_, index) => ({
    notificationId: index + 1,
    title: `Notification ${index + 1}`,
    read: !unread(index + 1),
    dateCreated: '2026-09-14T17:02:13',
  }));
}

function listOf(data: unknown[], totalRecord?: number) {
  return of({
    status: 'SUCCESS',
    message: 'Notifications fetched.',
    data,
    paging: totalRecord === undefined ? undefined : { totalRecord },
  });
}

/**
 * Regression tests: markRead/markAllRead had no busy/loading state at all, so their buttons had
 * no [disabled] binding tied to the in-flight request -- a double-click fired two identical
 * requests. Both methods now guard themselves against re-entry.
 *
 * The row guard was then a single id shared by every row, which overshot: one open request
 * disabled the mark-read button on every OTHER row too, and a click there did nothing at all --
 * no request, no toast, no spinner, the row just stayed unread. It is per row now.
 */
describe('Notifications mark-read guards', () => {
  it('markRead ignores a second call for the same row while the first is still in flight', () => {
    const responses = new Subject<any>();
    const post = vi.fn(() => responses.asObservable());
    const notifications = notificationsFor(post);
    const item = { notificationId: 1, title: 'A', read: false, dateCreated: '' } as any;

    notifications.markRead(item);
    notifications.markRead(item);
    expect(post).toHaveBeenCalledTimes(1);
    expect(notifications.isMarking(item)).toBe(true);

    responses.next({ status: 'SUCCESS' });
    expect(notifications.isMarking(item)).toBe(false);
  });

  it('markRead lets another row through while the first is still in flight', () => {
    // The whole point of the per-row guard. With one shared id this second click was swallowed
    // in silence: no request went out and the row stayed unread with nothing to explain why.
    const responses = new Subject<any>();
    const post = vi.fn(() => responses.asObservable());
    const notifications = notificationsFor(post);
    const first = { notificationId: 1, title: 'A', read: false, dateCreated: '' } as any;
    const second = { notificationId: 2, title: 'B', read: false, dateCreated: '' } as any;

    notifications.markRead(first);
    notifications.markRead(second);

    expect(post).toHaveBeenCalledTimes(2);
    expect(notifications.isMarking(first)).toBe(true);
    expect(notifications.isMarking(second)).toBe(true);
  });

  it('markRead releases only the row that settled, not every row in flight', () => {
    const first = new Subject<any>();
    const second = new Subject<any>();
    const post = vi.fn()
      .mockReturnValueOnce(first.asObservable())
      .mockReturnValueOnce(second.asObservable());
    const notifications = notificationsFor(post);
    const one = { notificationId: 1, title: 'A', read: false, dateCreated: '' } as any;
    const two = { notificationId: 2, title: 'B', read: false, dateCreated: '' } as any;

    notifications.markRead(one);
    notifications.markRead(two);
    first.next({ status: 'SUCCESS' });

    expect(notifications.isMarking(one)).toBe(false);
    expect(notifications.isMarking(two)).toBe(true);
  });

  it('marks the row Open was pressed on, even with another row still in flight', () => {
    // The worst version of the shared guard: open() navigates whatever markRead did, so a click
    // on Open during another row's request left the page with that row still unread and nothing
    // on screen to say the mark had been dropped.
    const responses = new Subject<any>();
    const post = vi.fn(() => responses.asObservable());
    const { notifications, router } = build({ post });
    const first = { notificationId: 1, title: 'A', read: false, dateCreated: '' } as any;
    const second = {
      notificationId: 2, title: 'B', read: false, dateCreated: '', linkUrl: '/jobList',
    } as any;

    notifications.markRead(first);
    notifications.open(second);

    expect(post).toHaveBeenCalledTimes(2);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/operations/jobs');
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

/**
 * Regression tests: the screen asked for one fixed page of 100 rows and rendered all of them with
 * no pager, so notification 101 was unreachable by any route through the UI and nothing on screen
 * hinted that it existed.
 */
describe('Notifications paging', () => {
  it('asks for the whole list rather than a fixed hundred rows', () => {
    const get = vi.fn(() => listOf([], 0));
    const { notifications } = build({ get, post: vi.fn() });

    notifications.load();

    expect((get.mock.calls[0] as any)[1].params.limit).toBe(String(LIST_LIMIT));
  });

  it('pages the rows instead of rendering every one it fetched', () => {
    const get = vi.fn(() => listOf(rows(120), 120));
    const { notifications } = build({ get, post: vi.fn() });

    notifications.load();

    expect(notifications.filtered()).toHaveLength(120);
    expect(notifications.paged()).toHaveLength(PAGE_SIZES[0]);
    expect(notifications.paged()[0].notificationId).toBe(1);
  });

  it('reaches the rows past the first page', () => {
    const get = vi.fn(() => listOf(rows(120), 120));
    const { notifications } = build({ get, post: vi.fn() });

    notifications.load();
    notifications.goToPage(3);

    expect(notifications.paged()[0].notificationId).toBe(2 * PAGE_SIZES[0] + 1);
    expect(notifications.paged()).toHaveLength(120 - 2 * PAGE_SIZES[0]);
  });

  it('reports how many notifications exist, not how many arrived', () => {
    const get = vi.fn(() => listOf(rows(LIST_LIMIT), 1420));
    const { notifications } = build({ get, post: vi.fn() });

    notifications.load();

    // The heading renders this: "1000 of 1420" is the only thing that tells the user the fetch
    // stopped short of their mailbox.
    expect(notifications.total()).toBe(1420);
  });

  it('says so out loud when the fetch was cut short', () => {
    const get = vi.fn(() => listOf(rows(LIST_LIMIT), 1420));
    const { notifications, toast } = build({ get, post: vi.fn() });

    notifications.load();

    expect(toast.info).toHaveBeenCalledWith(
      `Showing the newest ${LIST_LIMIT} of 1420 notifications.`);
  });

  it('falls back to the rows in hand when the server sends no paging block', () => {
    const get = vi.fn(() => listOf(rows(7)));
    const { notifications, toast } = build({ get, post: vi.fn() });

    notifications.load();

    expect(notifications.total()).toBe(7);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('returns to the first page when a filter changes what page two means', () => {
    const get = vi.fn(() => listOf(rows(120), 120));
    const { notifications } = build({ get, post: vi.fn() });

    notifications.load();
    notifications.goToPage(3);
    notifications.onFilterChange();

    expect(notifications.pager.page()).toBe(1);
  });
});

/**
 * Regression test: the date column was given dateCreated verbatim, and a Java LocalDateTime
 * carries no offset -- the pipe read the server's wall clock as the reader's own.
 */
describe('Notifications timestamps', () => {
  it('reads a timestamp in the zone the server writes, not the reader own', () => {
    const notifications = notificationsFor(vi.fn());

    // 17:02:13 on the server's clock (America/Chicago, CDT) is 22:02:13Z.
    expect(notifications.when('2026-09-14T17:02:13')!.toISOString())
      .toBe('2026-09-14T22:02:13.000Z');
  });

  it('gives the pipe null rather than an Invalid Date for a missing timestamp', () => {
    const notifications = notificationsFor(vi.fn());

    expect(notifications.when('')).toBeNull();
    expect(notifications.when(null)).toBeNull();
  });
});
