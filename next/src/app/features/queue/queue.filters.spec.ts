import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Queue } from './queue';
import { ToastService } from '../../shared/ui/toast.service';

function queue() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { post: () => of({ status: 'SUCCESS', data: {} }) } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Queue());
}

/** The reader's own calendar day, however far their clock is from UTC. */
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A moment on 24 Sep whose UTC date is another day wherever this runs (except on UTC itself). */
function aMomentWhereUtcIsAnotherDay(): Date {
  const west = new Date(2026, 8, 24, 12).getTimezoneOffset() > 0;
  return west ? new Date(2026, 8, 24, 23, 30) : new Date(2026, 8, 24, 0, 30);
}

describe('Queue filters', () => {
  afterEach(() => vi.useRealTimers());

  /**
   * The default range came from toISOString(), a UTC date: in a Chicago evening "today" was
   * already tomorrow, east of UTC after midnight it was still yesterday (UI audit, Low).
   */
  it('opens on the last seven days of the reader\'s own calendar', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = aMomentWhereUtcIsAnotherDay();
    vi.setSystemTime(now);
    const q = queue();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6);
    expect(q.toDate()).toBe(localDay(now));
    expect(q.fromDate()).toBe(localDay(weekAgo));
  });

  /**
   * Clear was always shown: the dates are never empty, so "fromDate() || toDate()" was always
   * true, and Clear reset them to the values they already had. It shows once something has
   * been narrowed, as on Jobs and Tasks.
   */
  it('has nothing to clear on the default view', () => {
    expect(queue().hasFilters()).toBe(false);
  });

  it('has something to clear once a search, a status or a date moves', () => {
    const a = queue(); a.search.set('boom');
    expect(a.hasFilters()).toBe(true);
    const b = queue(); b.toggleStatus('Failed');
    expect(b.hasFilters()).toBe(true);
    const c = queue(); c.fromDate.set('2026-01-01');
    expect(c.hasFilters()).toBe(true);
    const d = queue(); d.toDate.set('2026-01-02');
    expect(d.hasFilters()).toBe(true);
  });

  it('has nothing left to clear after Clear', () => {
    const q = queue();
    q.search.set('boom'); q.toggleStatus('Failed'); q.fromDate.set('2026-01-01');
    q.clearFilters();
    expect(q.hasFilters()).toBe(false);
  });
});
