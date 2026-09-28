import { describe, it, expect } from 'vitest';
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
