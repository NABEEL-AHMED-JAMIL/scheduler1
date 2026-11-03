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

  it('says a managed-session decision is the platform team\'s, never "user 1000" (owner 2026-11-03)', () => {
    const managed = (actor: number): HistoryEvent =>
      ({ id: 1, type: 'Approved', at: '2026-11-02T21:37:15Z', actor, stepKey: 's1', detail: '{"managedService":true}' } as unknown as HistoryEvent);
    const [unknown] = historyLines([managed(1000)], names, () => 'Approve');
    expect(unknown.text).toBe('Approve: approved by Platform administrator (platform team)');
    expect(unknown.actor).toBe('Platform administrator (platform team)');
    const [named] = historyLines([managed(7)], names, () => 'Approve');
    expect(named.actor).toBe('Ada Admin (platform team)');
    const [mine] = historyLines([managed(9)], id => (id === 9 ? 'Pat Ops (you)' : `user ${id}`), () => 'Approve');
    expect(mine.actor).toBe('Pat Ops (you)');
  });
});

