import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { UnreadCountService } from './unread-count.service';

/**
 * The bell and the dashboard's Unread tile each kept their own copy of the count, so marking
 * everything read in the bell left the tile showing the old figure until the page was reloaded.
 */
describe('the one unread count', () => {
  function service(answer: () => unknown) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { get: answer } }] });
    return TestBed.inject(UnreadCountService);
  }

  it('takes the server count on refresh', () => {
    const unread = service(() => of({ status: 'SUCCESS', data: 12 }));
    unread.refresh();
    expect(unread.count()).toBe(12);
  });

  it('keeps the last count when a refresh fails or is refused', () => {
    let fail = false;
    const unread = service(() => fail ? throwError(() => ({})) : of({ status: 'SUCCESS', data: 5 }));
    unread.refresh();
    fail = true;
    unread.refresh();
    expect(unread.count()).toBe(5);
  });

  it('counts down one read and never below zero, and clears', () => {
    const unread = service(() => of({ status: 'SUCCESS', data: 1 }));
    unread.refresh();
    unread.markedRead();
    unread.markedRead();
    expect(unread.count()).toBe(0);
    unread.refresh();
    unread.clear();
    expect(unread.count()).toBe(0);
  });
});

/**
 * The Notifications page posted mark-read on its own and the bell kept its own count, so marking
 * rows on the page left the header badge stale until the next poll. Both mark through here now.
 */
function build(post = vi.fn(() => of({ status: 'SUCCESS' })), unreadCount: unknown = 5) {
  const get = vi.fn(() => of({ status: 'SUCCESS', data: unreadCount }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { get, post } }] });
  return { store: TestBed.inject(UnreadCountService), get, post };
}

describe('marking through the one count', () => {
  it('reads the unread count from the server', () => {
    const { store, get } = build();
    store.refresh();
    expect(String((get.mock.calls[0] as unknown[])[0])).toContain('/notification.json/unreadCount');
    expect(store.count()).toBe(5);
  });

  it('keeps the last count when the server sends something that is not a number', () => {
    const { store } = build(undefined, 5);
    store.refresh();
    TestBed.inject(HttpClient).get = vi.fn(() => of({ status: 'SUCCESS', data: [{ id: 1 }] })) as never;
    store.refresh();
    expect(store.count()).toBe(5);
  });

  it('ignores a failed count rather than zeroing the badge', () => {
    const { store } = build();
    store.refresh();
    TestBed.inject(HttpClient).get = vi.fn(() => throwError(() => new Error('down'))) as never;
    store.refresh();
    expect(store.count()).toBe(5);
  });

  it('drops the count by one when a row is marked read, and says which row', () => {
    const { store } = build();
    store.refresh();
    const seen: unknown[] = [];
    store.marked.subscribe(id => seen.push(id));

    store.markRead(7).subscribe();

    expect(store.count()).toBe(4);
    expect(seen).toEqual([7]);
  });

  it('leaves the count alone when marking is refused', () => {
    const { store } = build(vi.fn(() => of({ status: 'ERROR', message: 'No.' })));
    store.refresh();
    const seen: unknown[] = [];
    store.marked.subscribe(id => seen.push(id));

    store.markRead(7).subscribe();
    store.markAllRead().subscribe();

    expect(store.count()).toBe(5);
    expect(seen).toEqual([]);
  });

  it('zeroes the count on mark-all, and tells every view', () => {
    const { store } = build();
    store.refresh();
    const seen: unknown[] = [];
    store.marked.subscribe(id => seen.push(id));

    store.markAllRead().subscribe();

    expect(store.count()).toBe(0);
    expect(seen).toEqual(['all']);
  });
});
