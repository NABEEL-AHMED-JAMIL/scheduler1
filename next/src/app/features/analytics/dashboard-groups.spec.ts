import { describe, it, expect } from 'vitest';
import { useMemoryStorage } from '../../shared/testing/memory-storage';
import { Dashboard } from './analytics.service';
import { groupDashboards, readFavourites, withoutBoardName } from './dashboard';

/** UX review B5 (SA1, B1): the Dashboards list in groups with favourites, and a tile's line without the board's name. */
const board = (id: number, name: string): Dashboard => ({ analyticsDashboardId: id, dashboardName: name });
const LIST = [board(1, 'E2E chart events — funnel'), board(2, 'Riverside — Patient 360'), board(3, 'Riverside — overview'),
  board(4, 'Riverside — Drug safety monitor')];

describe('groupDashboards', () => {
  it('is one unnamed group when nothing is starred and no pipeline is known', () => {
    expect(groupDashboards(LIST, new Set(), new Map())).toEqual([{ key: 'all', label: '', items: LIST }]);
  });

  it('puts the favourites first, then a group per feeding pipeline, then the boards no pipeline feeds', () => {
    const pipelines = new Map([[2, ['Patient 360 (daily)']], [3, ['Drug safety monitor (weekly)', 'Patient 360 (daily)']],
      [4, ['Drug safety monitor (weekly)']]]);
    const groups = groupDashboards(LIST, new Set([4]), pipelines);
    expect(groups.map(g => [g.label, g.items.map(i => i.analyticsDashboardId)])).toEqual([
      ['Favourites', [4]],
      ['Drug safety monitor (weekly)', [3]],
      ['Patient 360 (daily)', [2]],
      ['Not fed by a pipeline', [1]],
    ]);
  });
});

describe('favourites', () => {
  useMemoryStorage();

  it('reads a viewer\'s starred ids, and nothing from rubbish', () => {
    localStorage.setItem('k', '[1448, "x", 1456]');
    expect([...readFavourites('k')]).toEqual([1448, 1456]);
    localStorage.setItem('k', '{');
    expect(readFavourites('k').size).toBe(0);
    expect(readFavourites('none').size).toBe(0);
  });
});

describe('withoutBoardName', () => {
  it('drops the board\'s own name from the front of a saved work\'s name', () => {
    expect(withoutBoardName('Riverside — Patient 360 — Patients in the cohort', 'Riverside — Patient 360')).toBe('Patients in the cohort');
    expect(withoutBoardName('Risk level', 'Riverside — Patient 360')).toBe('Risk level');
    expect(withoutBoardName('Riverside — Patient 360', 'Riverside — Patient 360')).toBe('Riverside — Patient 360');
    expect(withoutBoardName('Sales', null)).toBe('Sales');
  });
});
