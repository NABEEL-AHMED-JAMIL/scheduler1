import { describe, it, expect } from 'vitest';
import { historyLines } from './history';
import { HistoryEvent } from './workflows.api';

/** The inbox timeline's byline carries the person's id, so it can show their picture. */
describe('history byline', () => {
  const names = (id: number | null | undefined) => (id === 7 ? 'Ada Admin' : `user ${id}`);
  const event = (type: string, actor?: number): HistoryEvent =>
    ({ id: Math.random(), type, at: '2026-10-12T10:00:00Z', actor, stepKey: 's1', detail: '{}' } as unknown as HistoryEvent);

  it('names who acted, and their id', () => {
    const [line] = historyLines([event('Approved', 7)], names, () => 'Review');
    expect(line.actor).toBe('Ada Admin');
    expect(line.actorId).toBe(7);
  });

  it('has neither for the workflow\'s own events', () => {
    const [line] = historyLines([event('Reminded', 7)], names, () => 'Review');
    expect(line.actor).toBeUndefined();
    expect(line.actorId).toBeUndefined();
  });
});
