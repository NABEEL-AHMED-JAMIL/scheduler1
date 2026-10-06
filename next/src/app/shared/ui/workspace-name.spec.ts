import { describe, it, expect } from 'vitest';
import { matchesWorkspace, workspaceName, workspaceOptions } from './workspace-name';

/**
 * MIG-296: a platform administrator's Jobs, Tasks and hour drill-down hold every workspace's rows, and
 * the server tags each with its tenantId and, when identity could be asked, its name.
 */
describe('workspaceName', () => {
  it('uses the name the server sent', () => {
    expect(workspaceName({ tenantId: 4, tenantName: 'Acme Ops' })).toBe('Acme Ops');
  });

  it('falls back to "Workspace #id" when the name is missing or blank', () => {
    expect(workspaceName({ tenantId: 2924 })).toBe('Workspace #2924');
    expect(workspaceName({ tenantId: 2924, tenantName: null })).toBe('Workspace #2924');
    expect(workspaceName({ tenantId: 2924, tenantName: '  ' })).toBe('Workspace #2924');
  });

  it('says nothing for a row with no workspace at all', () => {
    expect(workspaceName({})).toBe('');
  });
});

describe('workspaceOptions', () => {
  it('lists each workspace in the rows once, by name, with its id as the hint', () => {
    const options = workspaceOptions([
      { tenantId: 2, tenantName: 'Zeta' },
      { tenantId: 1, tenantName: 'Alpha' },
      { tenantId: 2, tenantName: 'Zeta' },
      { tenantId: 9 },
      {},
    ]);
    expect(options).toEqual([
      { value: '1', label: 'Alpha', hint: '#1' },
      { value: '9', label: 'Workspace #9', hint: '#9' },
      { value: '2', label: 'Zeta', hint: '#2' },
    ]);
  });
});

describe('matchesWorkspace', () => {
  it('keeps every row when no workspace is picked, and only that workspace\'s rows when one is', () => {
    expect(matchesWorkspace({ tenantId: 3 }, '')).toBe(true);
    expect(matchesWorkspace({ tenantId: 3 }, '3')).toBe(true);
    expect(matchesWorkspace({ tenantId: 4 }, '3')).toBe(false);
    expect(matchesWorkspace({}, '3')).toBe(false);
  });
});
