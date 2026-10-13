import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TaskCountService } from '../workflows/task-count.service';
import { WaitingForReview } from './waiting-for-review';

/** UX review 2026-10-12 (D1): Home says what waits for the reader's review -- reviewers and administrators. */
function card(opts: { admin: boolean; inbox: boolean; mine: number; groups: number; runs?: number; tenantId?: number | null }) {
  const get = vi.fn(() => of({ status: 'SUCCESS', data: { runs: Array.from({ length: opts.runs ?? 0 }, (_, i) => ({ jobQueueId: i })), more: false } }));
  const count = { mine: signal(opts.mine), groups: signal(opts.groups), overdue: signal(0), refresh: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: HttpClient, useValue: { get } },
      { provide: TaskCountService, useValue: count },
      { provide: AuthService, useValue: { isTenantAdmin: () => opts.admin, canOpen: (p: string) => p === 'task-inbox' ? opts.inbox : true,
        user: () => ({ appUserId: 4641, tenantId: opts.tenantId === undefined ? 2960 : opts.tenantId }) } },
    ],
  });
  const fixture = TestBed.createComponent(WaitingForReview);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, get, count };
}

describe('Home: waiting for your review', () => {
  it('tells a reviewer how many tasks wait for them and their groups, with the way there', () => {
    const { el, get, count } = card({ admin: false, inbox: true, mine: 0, groups: 5 });
    const link = el.querySelector('[data-test="waiting-tasks"]') as HTMLAnchorElement;
    expect(link.textContent).toContain('5 waiting for your review');
    expect(link.getAttribute('href')).toBe('/workflows/inbox');
    expect(count.refresh).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('adds the runs waiting for review for an administrator', () => {
    const { el, get } = card({ admin: true, inbox: true, mine: 1, groups: 0, runs: 4 });
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/sourceJob.json/review/waiting'));
    expect(el.querySelector('[data-test="waiting-runs"]')?.textContent).toContain('4 runs waiting for review');
  });

  it('says nothing waits when nothing does', () => {
    const { el } = card({ admin: false, inbox: true, mine: 0, groups: 0 });
    expect(el.querySelector('[data-test="waiting-none"]')?.textContent).toContain('Nothing is waiting for your review');
  });

  it('is not shown to a viewer, nor outside a workspace', () => {
    expect(card({ admin: false, inbox: false, mine: 0, groups: 0 }).el.querySelector('[data-test="waiting-for-review"]')).toBeNull();
    expect(card({ admin: true, inbox: true, mine: 0, groups: 0, tenantId: null }).el.querySelector('[data-test="waiting-for-review"]')).toBeNull();
  });
});
