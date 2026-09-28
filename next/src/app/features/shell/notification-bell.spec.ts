import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ElementRef, provideZonelessChangeDetection } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NotificationBell } from './notification-bell';
import { UnreadCountService } from '../../core/notifications/unread-count.service';
import { AuthService } from '../../core/auth/auth.service';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

// The real AuthService, which decides what a link may open, reads the stored session.
useMemoryStorage();

/**
 * The three ways the bell disagreed with itself.
 *
 * The badge was a tally of the unread rows among the twenty this component fetches, so it stopped
 * at twenty while the dashboard and profile tiles -- which read /notification.json/unreadCount --
 * showed the real figure two clicks away. The panel below it listed the eight newest rows whatever
 * their state, so a user who had read their newest eight saw a lit badge over a panel with nothing
 * unread in it. And `ago` parsed dateCreated with new Date(), which reads an offset-less Java
 * LocalDateTime as the READER's wall clock: hours stale in London, in the future in Tokyo, where
 * the negative minutes made every recent notification read "just now".
 *
 * @author Nabeel Ahmed
 */

/** One fetched row. The dropdown only ever reads these five fields. */
function note(notificationId: number, read: boolean, linkUrl?: string) {
  return {
    notificationId,
    title: 'Notification ' + notificationId,
    read,
    dateCreated: '2026-09-14T17:02:13',
    linkUrl,
  };
}

/** `count` rows, newest first, with `unread` deciding which ids are still unread. */
function rows(count: number, unread: (id: number) => boolean = () => false) {
  return Array.from({ length: count }, (_, index) => note(index + 1, !unread(index + 1)));
}

function build(options: { unreadCount?: number; fetched?: unknown[] } = {}) {
  const unreadCount = options.unreadCount ?? 0;
  const fetched = options.fetched ?? [];
  const get = vi.fn((url: string) =>
    of(url.endsWith('/unreadCount')
      ? { status: 'SUCCESS', message: 'Unread count fetched.', data: unreadCount }
      : { status: 'SUCCESS', message: 'Notifications fetched.', data: fetched }));
  const post = vi.fn(() => of({ status: 'SUCCESS', message: 'Marked as read.' }));
  const navigateByUrl = vi.fn();

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get, post } },
      { provide: Router, useValue: { navigateByUrl } },
      // The bell asks its own host element whether a document click landed outside it.
      { provide: ElementRef, useValue: { nativeElement: { contains: () => false } } },
    ],
  });
  return {
    bell: TestBed.runInInjectionContext(() => new NotificationBell()),
    get,
    post,
    navigateByUrl,
  };
}

/** Opening the panel is the one public path that loads; ngOnInit also starts a poll timer. */
function opened(options: { unreadCount?: number; fetched?: unknown[] }) {
  const built = build(options);
  built.bell.toggle();
  return built;
}

describe('Notification bell badge', () => {
  it('counts the whole mailbox, not the twenty rows the dropdown fetched', () => {
    // 158 unread against a fetch of 20. The badge used to read 20 here, and the dashboard tile --
    // same user, same session, same endpoint this now calls -- read 158.
    const { bell, get } = opened({ unreadCount: 158, fetched: rows(20, () => true) });

    expect(bell.unread()).toBe(158);
    expect(get.mock.calls.some(call => String(call[0]).endsWith('/unreadCount'))).toBe(true);
  });

  it('still fetches only a window of rows for the panel itself', () => {
    const { get } = opened({ unreadCount: 158, fetched: rows(20, () => true) });

    const list = get.mock.calls.find(call => String(call[0]).endsWith('/list'));
    expect((list as any)[1].params.limit).toBe('20');
  });

  it('drops the badge by one when a row is opened, rather than waiting for the next poll', () => {
    // The badge is the server's number now, so it no longer falls out of the fetched rows on its
    // own; opening a row has to move it or it sits at 158 for up to a minute after the click.
    const { bell } = opened({ unreadCount: 158, fetched: rows(20, () => true) });

    bell.open_(note(1, false) as any);

    expect(bell.unread()).toBe(157);
  });

  it('clears the badge when everything is marked read', () => {
    const { bell } = opened({ unreadCount: 158, fetched: rows(20, () => true) });

    bell.markAllRead();

    expect(bell.unread()).toBe(0);
  });
});

describe('Notification bell panel', () => {
  it('lists the unread rows first, so the panel accounts for the badge above it', () => {
    // Eight read rows newer than three unread ones. Taking the newest eight showed a panel with
    // nothing unread in it under a badge reading 3, which reads as a broken badge.
    const { bell } = opened({ unreadCount: 3, fetched: rows(11, id => id > 8) });

    expect(bell.recent().slice(0, 3).map(row => row.notificationId)).toEqual([9, 10, 11]);
    expect(bell.recent()).toHaveLength(8);
  });

  it('keeps each group newest first, rather than reshuffling the rows', () => {
    const { bell } = opened({ unreadCount: 3, fetched: rows(11, id => id > 8) });

    expect(bell.recent().slice(3).map(row => row.notificationId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('says how many unread it had no room for, instead of leaving the badge unexplained', () => {
    const { bell } = opened({ unreadCount: 158, fetched: rows(20, id => id <= 12) });

    expect(bell.recent().filter(row => !row.read)).toHaveLength(8);
    expect(bell.hiddenUnread()).toBe(150);
  });

  it('says nothing extra when the panel already shows every unread row', () => {
    const { bell } = opened({ unreadCount: 3, fetched: rows(11, id => id > 8) });

    expect(bell.hiddenUnread()).toBe(0);
  });
});

describe('Notification bell timestamps', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads dateCreated in the zone the server writes, not the reader own', () => {
    // 17:02:13 on the server's clock (America/Chicago, CDT) is 22:02:13Z, so one minute later the
    // bell must say "1m ago". Read as the reader's own wall clock this was "5h ago" in UTC and a
    // time in the future -- reported as "just now" -- anywhere east of Chicago.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T22:03:13Z'));
    const { bell } = build();

    expect(bell.ago('2026-09-14T17:02:13')).toBe('1m ago');
  });

  it('reads the REST form and the socket form of one moment as one moment', () => {
    // JobEventPublisher sends real instants over the socket; a disagreement here would make a row
    // jump five hours the moment a push arrived.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T01:02:13Z'));
    const { bell } = build();

    expect(bell.ago('2026-09-14T17:02:13')).toBe('3h ago');
    expect(bell.ago('2026-09-14T17:02:13')).toBe(bell.ago('2026-09-14T22:02:13Z'));
  });

  it('renders nothing rather than "Invalid Date" for a missing timestamp', () => {
    const { bell } = build();

    expect(bell.ago('')).toBe('');
  });
});

describe('Notification bell when marking is refused', () => {
  const REFUSED = { status: 'ERROR', message: 'Refused.' };

  it('keeps the row unread and the badge where it was', () => {
    const built = opened({ unreadCount: 158, fetched: rows(20, () => true) });
    built.post.mockReturnValue(of(REFUSED) as any);

    built.bell.open_(note(1, false) as any);

    expect(built.bell.unread()).toBe(158);
    expect(built.bell.items().find(n => n.notificationId === 1)?.read).toBe(false);
  });

  it('keeps the badge when mark-all is refused', () => {
    const built = opened({ unreadCount: 158, fetched: rows(20, () => true) });
    built.post.mockReturnValue(of(REFUSED) as any);

    built.bell.markAllRead();

    expect(built.bell.unread()).toBe(158);
  });
});

describe('Notification bell and the keyboard', () => {
  /** Rendered for real, because focus only exists in a document. */
  async function renderedOpen() {
    const get = vi.fn((url: string) =>
      of(url.endsWith('/unreadCount')
        ? { status: 'SUCCESS', data: 2 }
        : { status: 'SUCCESS', data: [note(1, false, '/operations/jobs'), note(2, false)] }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: HttpClient, useValue: { get, post: vi.fn(() => of({ status: 'SUCCESS' })) } },
      ],
    });
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.autoDetectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('button')!.click();
    await fixture.whenStable();
    return { fixture, bell: fixture.componentInstance, el };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('hands focus back to the bell when Escape closes the panel', async () => {
    const { fixture, bell, el } = await renderedOpen();
    const row = el.querySelector<HTMLElement>('#notif-panel li button')!;
    row.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(bell.open()).toBe(false);
    expect(document.activeElement).toBe(el.querySelector('button'));
  });

  it('closes when focus tabs out of it, and stays open while focus moves inside', async () => {
    const { bell, el } = await renderedOpen();
    const [first, second] = Array.from(el.querySelectorAll<HTMLElement>('#notif-panel li button'));

    first.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: second }));
    expect(bell.open()).toBe(true);

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    second.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    expect(bell.open()).toBe(false);
    outside.remove();
  });

  it('is a disclosure: the bell names the panel it controls and claims no menu popup', async () => {
    const { el } = await renderedOpen();
    const trigger = el.querySelector<HTMLElement>('button')!;
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
    expect(trigger.getAttribute('aria-controls')).toBe('notif-panel');
    expect(el.querySelector('#notif-panel')).not.toBeNull();
  });
});

describe('Notification bell and the Notifications page', () => {
  it('shows the count the page moved, because both read one store', () => {
    const { bell } = opened({ unreadCount: 5, fetched: rows(5, () => true) });

    TestBed.inject(UnreadCountService).markRead(3).subscribe();

    expect(bell.unread()).toBe(4);
    expect(bell.items().find(n => n.notificationId === 3)?.read).toBe(true);
  });

  it('flips its rows when the page marks everything read', () => {
    const { bell } = opened({ unreadCount: 5, fetched: rows(5, () => true) });

    TestBed.inject(UnreadCountService).markAllRead().subscribe();

    expect(bell.unread()).toBe(0);
    expect(bell.items().every(n => n.read)).toBe(true);
  });
});

describe('Notification bell when the list cannot be loaded', () => {
  async function renderedWith(list: () => unknown) {
    const get = vi.fn((url: string) =>
      url.endsWith('/unreadCount') ? of({ status: 'SUCCESS', data: 0 }) : list());
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: HttpClient, useValue: { get, post: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.autoDetectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLElement>('button')!.click();
    await fixture.whenStable();
    return { fixture, el, get };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('says it could not load, rather than that you are all caught up', async () => {
    const { el } = await renderedWith(() => throwError(() => ({ status: 503 })));
    expect(el.textContent).toContain('could not be loaded');
    expect(el.textContent).not.toContain('all caught up');
  });

  it('treats a refused list the same way', async () => {
    const { el } = await renderedWith(() => of({ status: 'ERROR', message: 'No.' }));
    expect(el.textContent).toContain('could not be loaded');
  });

  it('clears the failure once a later load succeeds', async () => {
    let fail = true;
    const { fixture, el } = await renderedWith(() =>
      fail ? throwError(() => ({ status: 503 })) : of({ status: 'SUCCESS', data: [] }));
    fail = false;
    const bell = el.querySelector<HTMLElement>('button')!;
    bell.click(); // close
    bell.click(); // open again, which reloads
    await fixture.whenStable();
    expect(el.textContent).toContain('all caught up');
  });

  it('sets the note about unread rows it has no room for apart from the last row', async () => {
    const { fixture, el } = await renderedWith(() => of({ status: 'SUCCESS', data: [note(1, false)] }));
    fixture.componentInstance.unread.set(30);
    await fixture.whenStable();
    const band = Array.from(el.querySelectorAll('p')).find(p => p.textContent?.includes('more unread'))!;
    expect(band.className).toContain('border-t');
    expect(band.className).toContain('py-2');
  });
});

describe('Notification bell for a tenant user without the page a link names', () => {
  it('marks the row read without navigating to a page the profile withholds', () => {
    const { bell, post, navigateByUrl } = opened({ unreadCount: 1, fetched: [note(1, false, '/jobList')] });
    vi.spyOn(TestBed.inject(AuthService), 'canOpen').mockImplementation(key => key !== 'jobs');

    bell.open_(note(1, false, '/jobList') as any);

    expect(post).toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
