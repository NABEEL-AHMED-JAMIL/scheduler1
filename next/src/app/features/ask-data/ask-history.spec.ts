import { describe, it, expect, afterEach, vi } from 'vitest';
import { useMemoryStorage } from '../../shared/testing/memory-storage';
import { EXAMPLE_QUESTIONS, HISTORY_MAX, clearHistory, historyKey, readHistory, saveHistory, withPin, withQuestion } from './ask-history';

/** UX final AD1: Ask your data remembers a viewer's recent questions and pinned answers in this browser only. */
const KEY = 'etl.ask.history.2960.4641';
const AT = new Date('2026-10-13T08:00:00Z');

afterEach(() => vi.restoreAllMocks());

describe('Ask your data history', () => {
  useMemoryStorage();

  it('is kept per workspace and person, and not at all without both', () => {
    expect(historyKey(2960, 4641)).toBe(KEY);
    expect(historyKey(null, 4641)).toBeNull();
    expect(historyKey(2960, undefined)).toBeNull();
    saveHistory(null, withQuestion(readHistory(null), 'x'));
    expect(localStorage.length).toBe(0);
  });

  it('keeps the newest questions first, once each, at most six', () => {
    let h = readHistory(KEY);
    for (let i = 1; i <= 8; i++) h = withQuestion(h, `question ${i}`, AT);
    h = withQuestion(h, '  QUESTION   3 ', AT);
    expect(h.questions.map(q => q.question)).toEqual(['QUESTION 3', 'question 8', 'question 7', 'question 6', 'question 5', 'question 4']);
    expect(h.questions.length).toBe(HISTORY_MAX);
    saveHistory(KEY, h);
    expect(readHistory(KEY)).toEqual(h);
  });

  it('lists a pin once per tile, newest first', () => {
    const pin = { question: 'Readmissions by month?', title: 'Readmissions', dashboardId: 12, dashboardName: 'Quality', widgetId: 90 };
    let h = withPin(readHistory(KEY), pin, AT);
    h = withPin(h, { ...pin, title: 'Readmissions (again)' }, AT);
    h = withPin(h, { ...pin, widgetId: 91, title: 'No-shows' }, AT);
    expect(h.pins.map(p => p.title)).toEqual(['No-shows', 'Readmissions (again)']);
  });

  it('reads rubbish, a refused storage or a cleared one as nothing remembered', () => {
    localStorage.setItem(KEY, '{not json');
    expect(readHistory(KEY)).toEqual({ questions: [], pins: [] });
    localStorage.setItem(KEY, JSON.stringify({ questions: [{ question: '', at: 'x' }, { question: 'ok', at: 'x' }], pins: [{ title: 'no board' }] }));
    expect(readHistory(KEY)).toEqual({ questions: [{ question: 'ok', at: 'x' }], pins: [] });
    clearHistory(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readHistory(KEY)).toEqual({ questions: [], pins: [] });
    expect(() => saveHistory(KEY, withQuestion(readHistory(KEY), 'x'))).not.toThrow();
  });

  it('offers generic healthcare examples, no customer names', () => {
    expect(EXAMPLE_QUESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(EXAMPLE_QUESTIONS.join(' ')).toMatch(/readmission/i);
    expect(EXAMPLE_QUESTIONS.join(' ')).toMatch(/length of stay/i);
    expect(EXAMPLE_QUESTIONS.join(' ')).toMatch(/no-show/i);
  });
});
