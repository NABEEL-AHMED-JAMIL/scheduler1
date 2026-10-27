import { describe, it, expect, afterEach, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ConversationList, SEARCH_DEBOUNCE_MS } from './conversation-list';
import { useMemoryStorage } from '../../../shared/testing/memory-storage';
import {
  ConversationRow, badgeOf, dayGroupOf, groupRows, matchesChip, mergeRecent, readRail, relativeTime, rowTime, writeRail,
} from './conversation.model';

/**
 * The AI Assistant's conversation list (owner 2026-10-12): day groups by the calendar (naive times are Chicago
 * wall-clock, read through instantOf -- never cut at the T), pinned first, the chips, the outcome badges, the folded rail
 * remembered per viewer, and the component asking the server for search, chips and the next page.
 */
const CHICAGO = 'America/Chicago';
/** 2026-10-12 00:30 in Chicago (CDT, UTC-5). */
const NOW = new Date('2026-10-12T05:30:00Z');

const row = (id: number, dateUpdated: string, extra: Partial<ConversationRow> = {}): ConversationRow =>
  ({ conversationId: id, title: `t${id}`, shortTitle: `Title ${id}`, dateUpdated, ...extra });

describe('conversation list: days', () => {
  it('splits today and yesterday at the Chicago midnight, for naive and offset times alike', () => {
    expect(dayGroupOf('2026-10-12T00:10:00', NOW, CHICAGO)).toBe('today');
    expect(dayGroupOf('2026-10-11T23:59:00', NOW, CHICAGO)).toBe('yesterday');
    // 04:59Z is 23:59 the evening before in Chicago, though its UTC date is the 12th.
    expect(dayGroupOf('2026-10-12T04:59:00+00:00', NOW, CHICAGO)).toBe('yesterday');
    expect(dayGroupOf('2026-10-12T05:01:00Z', NOW, CHICAGO)).toBe('today');
    expect(dayGroupOf('2026-10-06T12:00:00', NOW, CHICAGO)).toBe('week');
    expect(dayGroupOf('2026-10-05T12:00:00', NOW, CHICAGO)).toBe('older');
    expect(dayGroupOf(null, NOW, CHICAGO)).toBe('older');
  });

  it('puts pinned conversations first, then Today, Yesterday, This week, Older, each newest first', () => {
    const groups = groupRows([
      row(1, '2026-10-01T09:00:00'),
      row(2, '2026-10-12T00:05:00'),
      row(3, '2026-10-11T23:59:00', { pinned: true }),
      row(4, '2026-10-12T00:20:00'),
      row(5, '2026-10-09T08:00:00'),
      row(6, '2026-09-01T08:00:00', { pinned: true }),
      row(7, '2026-10-11T08:00:00'),
    ], NOW, CHICAGO);
    expect(groups.map(g => [g.id, g.rows.map(r => r.conversationId)])).toEqual([
      ['pinned', [3, 6]], ['today', [4, 2]], ['yesterday', [7]], ['week', [5]], ['older', [1]],
    ]);
  });

  it('says a row\'s time on a 24-hour clock, in the viewer\'s calendar', () => {
    expect(relativeTime('2026-10-12T00:29:40', NOW, CHICAGO)).toBe('now');
    expect(relativeTime('2026-10-12T00:05:00', NOW, CHICAGO)).toBe('25 min');
    expect(relativeTime('2026-10-11T23:10:00', NOW, CHICAGO)).toBe('Yesterday');
    expect(relativeTime('2026-10-11T13:10:00', new Date('2026-10-11T20:00:00Z'), CHICAGO)).toBe('13:10');
    expect(relativeTime('2026-10-08T13:10:00', NOW, CHICAGO)).toBe('Thu');
    expect(relativeTime('2026-09-03T13:10:00', NOW, CHICAGO)).toBe('3 Sep');
  });
});

describe('conversation list: a row\'s time under its day header', () => {
  it('says the time, not the day again: Yesterday 23:10, This week Thu 13:10; Today, Pinned and Older as before', () => {
    expect(rowTime('2026-10-11T23:10:00', 'yesterday', NOW, CHICAGO)).toBe('23:10');
    expect(rowTime('2026-10-11T09:05:00-05:00', 'yesterday', NOW, CHICAGO)).toBe('09:05');
    expect(rowTime('2026-10-08T13:10:00', 'week', NOW, CHICAGO)).toBe('Thu 13:10');
    expect(rowTime('2026-10-12T00:05:00', 'today', NOW, CHICAGO)).toBe('25 min');
    expect(rowTime('2026-10-11T23:10:00', 'pinned', NOW, CHICAGO)).toBe('Yesterday');
    expect(rowTime('2026-09-03T13:10:00', 'older', NOW, CHICAGO)).toBe('3 Sep');
    expect(rowTime(null, 'yesterday', NOW, CHICAGO)).toBe('');
  });
});

describe('conversation list: badges and chips', () => {
  it('says what each conversation came to, and links what can be opened', () => {
    expect(badgeOf(row(1, '', { outcome: 'pipeline_saved', taskDetailId: 77 }))).toEqual({ label: 'Pipeline created', tone: 'ok', link: ['/pipelines', 77, 'edit'] });
    expect(badgeOf(row(1, '', { outcome: 'pipeline_draft', pipelineErrors: 3 }))).toEqual({ label: 'Not saved · 3 errors', tone: 'crit', link: null });
    expect(badgeOf(row(1, '', { outcome: 'pipeline_draft', pipelineErrors: 1 }))!.label).toBe('Not saved · 1 error');
    expect(badgeOf(row(1, '', { outcome: 'pipeline_draft' }))).toEqual({ label: 'Not saved', tone: 'warn', link: null });
    expect(badgeOf(row(1, '', { outcome: 'run_completed', runJobId: 2905, runJobQueueId: 8238 })))
      .toEqual({ label: 'Run completed', tone: 'ok', link: ['/pipelines/schedules', 2905, 'runs', 8238] });
    expect(badgeOf(row(1, '', { outcome: 'run_failed', runJobId: 2905 }))!.link).toEqual(['/pipelines/schedules', 2905, 'executions']);
    expect(badgeOf(row(1, '', { outcome: 'answered' }))!.label).toBe('Answered');
    expect(badgeOf(row(1, '', { outcome: 'waiting' }))!.tone).toBe('warn');
    expect(badgeOf(row(1, '', { outcome: 'working' }))).toBeNull();
  });

  it('files a conversation under its kind, and an unsummarised one as a question', () => {
    expect(matchesChip(row(1, '', { kind: 'pipeline' }), 'pipeline')).toBe(true);
    expect(matchesChip(row(1, '', { kind: 'pipeline' }), 'run')).toBe(false);
    expect(matchesChip(row(1, '', {}), 'question')).toBe(true);
    expect(matchesChip(row(1, '', { kind: 'run' }), 'all')).toBe(true);
  });

  it('lays a newer copy over the list, but an older one never undoes a pin', () => {
    const list = [row(1, '2026-10-12T00:10:00', { pinned: true }), row(2, '2026-10-11T10:00:00')];
    const merged = mergeRecent(list, [
      { conversationId: 1, title: 'stale', dateUpdated: '2026-10-12T00:10:00', pinned: false } as ConversationRow,
      { conversationId: 2, title: 'answered since', dateUpdated: '2026-10-12T00:25:00', shortTitle: 'Fresh' } as ConversationRow,
      { conversationId: 3, title: 'new', dateUpdated: '2026-10-12T00:29:00' },
    ]);
    expect(merged.find(r => r.conversationId === 1)!.pinned).toBe(true);
    expect(merged.find(r => r.conversationId === 2)!.shortTitle).toBe('Fresh');
    expect(merged.map(r => r.conversationId)).toEqual([1, 2, 3]);
  });

  it('remembers the folded rail per viewer, and reads nothing as unfolded', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readRail(storage)).toBe(false);
    writeRail(storage, true);
    expect(readRail(storage)).toBe(true);
    expect(readRail(null)).toBe(false);
    expect(readRail({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});

describe('ConversationList (the component)', () => {
  useMemoryStorage();
  afterEach(() => vi.useRealTimers());

  function make() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ConversationList],
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ConversationList);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const list = () => http.expectOne(r => r.url.endsWith('/aiPrompt.json/assistant/conversationList'));
    return { fixture, http, list, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance };
  }

  const page = (rows: ConversationRow[], total = rows.length) => ({ status: 'SUCCESS', message: '', data: { rows, total } });

  it('shows the groups, the kind, the short title and the badge; Load more asks for the next page', () => {
    const { fixture, http, list, el } = make();
    const first = list();
    expect(first.request.params.get('limit')).toBe('50');
    expect(first.request.params.get('zone')).toBeTruthy();
    const rows = Array.from({ length: 50 }, (_, i) => row(100 + i, '2026-09-01T10:00:00', { kind: 'question', outcome: 'answered' }));
    rows[0] = row(100, new Date().toISOString(), { kind: 'pipeline', outcome: 'pipeline_draft', pipelineErrors: 2, pinned: true, shortTitle: 'Lab Results Validation' });
    first.flush(page(rows, 73));
    fixture.detectChanges();
    expect([...el.querySelectorAll('[data-group]')].map(g => g.getAttribute('data-group'))).toEqual(['pinned', 'older']);
    const top = el.querySelector('[data-conversation="100"]')!;
    expect(top.getAttribute('data-kind')).toBe('pipeline');
    expect(top.textContent).toContain('Lab Results Validation');
    expect(top.querySelector('[data-badge]')!.textContent!.trim()).toBe('Not saved · 2 errors');
    const more = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('more'))!;
    expect(more.textContent).toContain('Load 23 more');
    more.click();
    const next = list();
    expect(next.request.params.get('offset')).toBe('50');
    next.flush(page([row(200, '2026-09-01T09:00:00')], 73));
    fixture.detectChanges();
    expect(el.querySelector('[data-conversation="200"]')).toBeTruthy();
    http.verify();
  });

  it('asks the server for a chip\'s kind and for a search after typing stops', () => {
    vi.useFakeTimers();
    const { fixture, http, list, el } = make();
    list().flush(page([]));
    fixture.detectChanges();
    const runs = [...el.querySelectorAll('.seg-btn')].find(b => b.textContent!.trim() === 'Runs') as HTMLButtonElement;
    runs.click();
    expect(list().request.params.get('kind')).toBe('run');
    const box = el.querySelector('input[type="search"]') as HTMLInputElement;
    box.value = 'cardiology';
    box.dispatchEvent(new Event('input'));
    http.expectNone(r => r.url.endsWith('/conversationList'));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    const searched = list();
    expect(searched.request.params.get('q')).toBe('cardiology');
    expect(searched.request.params.get('kind')).toBe('run');
    searched.flush(page([]));
    fixture.detectChanges();
    expect(el.querySelector('[data-empty]')!.textContent).toContain('Nothing matches');
  });

  it('pins at once and asks the server; a refusal puts it back', () => {
    const { fixture, http, list, el, c } = make();
    list().flush(page([row(1, '2026-10-01T10:00:00'), row(2, '2026-09-01T10:00:00')]));
    fixture.detectChanges();
    c.togglePin(c.rows()[1]);
    fixture.detectChanges();
    expect(el.querySelector('[data-group="pinned"] [data-conversation="2"]')).toBeTruthy();
    const pin = http.expectOne(r => r.url.endsWith('/assistant/pin'));
    expect(pin.request.body).toEqual({ conversationId: 2, pinned: true });
    pin.flush({ status: 'ERROR', message: 'Conversation not found with 2.' });
    fixture.detectChanges();
    expect(el.querySelector('[data-group="pinned"]')).toBeNull();
  });

  it('folds to an icon rail and remembers it', () => {
    const { fixture, list, el, c } = make();
    list().flush(page([row(1, '2026-10-01T10:00:00', { kind: 'run' })]));
    fixture.detectChanges();
    c.toggleRail();
    fixture.detectChanges();
    expect(fixture.nativeElement.classList.contains('cl-rail')).toBe(true);
    expect(el.querySelector('[data-conversation="1"]')!.getAttribute('aria-label')).toBe('Title 1');
    expect(localStorage.getItem('ai.conversations.rail')).toBe('1');
  });

  it('prints the time under Yesterday, never "Yesterday" again, with the full date and time as its tooltip', () => {
    const { fixture, list, el, c } = make();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    list().flush(page([row(11, dayAgo, { outcome: 'answered' }), row(12, dayAgo, { outcome: 'answered' })]));
    c.now.set(now);
    fixture.detectChanges();
    expect(el.querySelector('[data-group="yesterday"] .cl-group')!.textContent!.trim()).toBe('Yesterday');
    const times = [...el.querySelectorAll('[data-group="yesterday"] .cl-time')];
    expect(times.length).toBe(2);
    for (const t of times) {
      expect(t.textContent!.trim()).toMatch(/^\d{2}:\d{2}$/);
      expect(t.getAttribute('title')).toMatch(/\d{2}:\d{2}/);
    }
  });

  it('marks only the open conversation (cl-active, aria-current); keyboard focus alone draws the ring', () => {
    const { fixture, list, el } = make();
    list().flush(page([row(7, '2026-10-01T10:00:00'), row(8, '2026-10-01T09:00:00')]));
    fixture.componentRef.setInput('activeId', 7);
    fixture.detectChanges();
    const open = el.querySelector('[data-conversation="7"]')!;
    const other = el.querySelector('[data-conversation="8"]')!;
    expect(open.classList.contains('cl-active')).toBe(true);
    expect(open.querySelector('.cl-open')!.getAttribute('aria-current')).toBe('true');
    expect(other.classList.contains('cl-active')).toBe(false);
    expect(other.querySelector('.cl-open')!.getAttribute('aria-current')).toBeNull();
    // The title stays on one line, its tooltip the whole title.
    expect(open.querySelector('.cl-open')!.getAttribute('title')).toContain('Title 7');

    // The states as styled: selected is a soft tint and a mark inside the row; the ring is :focus-visible only.
    const css = ((ConversationList as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles).join('\n')
      .replace(/%NS%/g, '').replace(/"/g, "'").replace(/\s+/g, ' ');
    expect(css).toContain('.cl-row.cl-active { background: var(--row-selected-bg); }');
    expect(css).toMatch(/\.cl-row::before \{ content: ''; position: absolute; left: 0\.25rem;/);
    expect(css).toContain('.cl-row.cl-active::before { background: var(--accent-mark-strong); }');
    expect(css).toContain('.cl-active .cl-time { color: var(--text-secondary); }');
    expect(css).toContain('.cl-open:focus { outline: none; }');
    expect(css).toContain('.cl-open:focus-visible::after { outline: 2px solid var(--focus-ring);');
    expect(css).not.toContain('focus-within');
    expect(css).not.toMatch(/inset 2px 0 0/);
  });

  it('opens a conversation and hands a delete to the page', () => {
    const { fixture, list, el, c } = make();
    list().flush(page([row(7, '2026-10-01T10:00:00')]));
    fixture.detectChanges();
    const opened: number[] = [];
    const removed: number[] = [];
    c.opened.subscribe(id => opened.push(id));
    c.remove.subscribe(x => removed.push(x.conversationId));
    (el.querySelector('[data-conversation="7"] .cl-open') as HTMLButtonElement).click();
    c.askRemove(c.rows()[0]);
    expect(opened).toEqual([7]);
    expect(removed).toEqual([7]);
  });
});
