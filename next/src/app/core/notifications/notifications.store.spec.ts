import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { NotificationsStore } from './notifications.store';

/**
 * The header badge and the Notifications page each kept their own unread count, so marking rows
 * read on the page left the badge where it was until the next minute's poll. One store now holds
 * the count, and both views mark through it.
 */
function build(post = vi.fn(() => of({ status: 'SUCCESS' })), unreadCount: unknown = 5) {
  const get = vi.fn(() => of({ status: 'SUCCESS', data: unreadCount }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { get, post } }] });
  return { store: TestBed.inject(NotificationsStore), get, post };
}

describe('NotificationsStore', () => {
  it('reads the unread count from the server', () => {
    const { store, get } = build();
    store.refreshUnread();
    expect(String((get.mock.calls[0] as unknown[])[0])).toContain('/notification.json/unreadCount');
    expect(store.unread()).toBe(5);
  });

  it('keeps the last count when the server sends something that is not a number', () => {
    const { store } = build(undefined, 5);
    store.refreshUnread();
    TestBed.inject(HttpClient).get = vi.fn(() => of({ status: 'SUCCESS', data: [{ id: 1 }] })) as never;
    store.refreshUnread();
    expect(store.unread()).toBe(5);
  });

  it('ignores a failed count rather than zeroing the badge', () => {
    const { store } = build();
    store.refreshUnread();
    TestBed.inject(HttpClient).get = vi.fn(() => throwError(() => new Error('down'))) as never;
    store.refreshUnread();
    expect(store.unread()).toBe(5);
  });

  it('drops the count by one when a row is marked read, and says which row', () => {
    const { store } = build();
    store.refreshUnread();
    const seen: unknown[] = [];
    store.marked.subscribe(id => seen.push(id));

    store.markRead(7).subscribe();

    expect(store.unread()).toBe(4);
    expect(seen).toEqual([7]);
  });

  it('leaves the count alone when marking is refused', () => {
    const { store } = build(vi.fn(() => of({ status: 'ERROR', message: 'No.' })));
    store.refreshUnread();
    const seen: unknown[] = [];
    store.marked.subscribe(id => seen.push(id));

    store.markRead(7).subscribe();
    store.markAllRead().subscribe();

    expect(store.unread()).toBe(5);
    expect(seen).toEqual([]);
  });

  it('zeroes the count on mark-all, and tells every view', () => {
    const { store } = build();
    store.refreshUnread();
    const seen: unknown[] = [];
    store.marked.subscribe(id => seen.push(id));

    store.markAllRead().subscribe();

    expect(store.unread()).toBe(0);
    expect(seen).toEqual(['all']);
  });
});
