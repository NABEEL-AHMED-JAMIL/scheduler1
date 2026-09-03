import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { StorageConnections } from './storage-connections';

const rows = [
  { storageConnectionId: 1, connectionName: 'alpha', alias: 'alpha', provider: 'S3',
    status: 'Active',   connectionStatus: 'SUCCESS' },
  { storageConnectionId: 2, connectionName: 'beta',  alias: 'beta',  provider: 'S3',
    status: 'Active',   connectionStatus: 'FAILED' },
  { storageConnectionId: 3, connectionName: 'gamma', alias: 'gamma', provider: 'FTP',
    status: 'Inactive', connectionStatus: 'UNTESTED' },
  { storageConnectionId: 4, connectionName: 'delta', alias: 'delta', provider: 'MINIO',
    status: 'Active' },
  { storageConnectionId: 5, connectionName: 'epsilon', alias: 'epsilon', provider: 'AZURE',
    status: 'Inactive', connectionStatus: 'SUCCESS' },
];

/**
 * The component builds nothing in its template that these tests need, so it is constructed in an
 * injection context rather than rendered. `served` is what a reload answers with; `posted` records
 * the id of every test the component asked the server to run.
 */
function componentWith(served: unknown[] = rows) {
  const posted: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: HttpClient,
        useValue: {
          get: () => of({ status: 'SUCCESS', message: '', data: served }),
          post: (_url: string, _body: unknown, options?: { params?: Record<string, string> }) => {
            posted.push(options?.params?.['storageConnectionId'] ?? '');
            return of({ status: 'SUCCESS', message: 'Reached its bucket.' });
          },
        },
      },
      { provide: Dialog, useValue: {} },
      { provide: AuthService, useValue: { user: () => ({ appUserId: 1 }) } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new StorageConnections());
  component.connections.set(rows);
  component.loading.set(false);
  return { component, posted };
}

describe('StorageConnections summary', () => {
  it('leads with what is in service, and counts the estate rather than the filtered view', () => {
    const { component } = componentWith();
    component.search.set('alpha');
    expect(component.filtered()).toHaveLength(1);
    expect(component.summary().active).toBe(3);
    expect(component.summary().total).toBe(5);
  });

  it('splits every connection across exactly one test state', () => {
    const { component } = componentWith();
    const summary = component.summary();
    expect(summary.ok).toBe(2);
    expect(summary.failing).toBe(1);
    // A missing connectionStatus counts as untested alongside the explicit "UNTESTED".
    expect(summary.untested).toBe(2);
    expect(summary.ok + summary.failing + summary.untested).toBe(summary.total);
  });
});

describe('StorageConnections bulk test', () => {
  it('tests everything ticked, including rows the filter has taken off screen', async () => {
    const { component, posted } = componentWith();
    component.toggleSelected(1);
    component.toggleSelected(3);
    // Narrowing the view after ticking used to silently drop row 3 from the run while the bar
    // above went on saying two were selected.
    component.search.set('alpha');
    expect(component.filtered()).toHaveLength(1);

    await component.testSelected();

    expect(posted).toEqual(['1', '3']);
    expect(component.selected().size).toBe(0);
  });

  it('asks for a tick rather than testing nothing', async () => {
    const { component, posted } = componentWith();
    await component.testSelected();
    expect(posted).toEqual([]);
  });

  // The bulk run trusts the selection set, so a reload has to be what keeps it honest: an id
  // left behind by a deleted row would otherwise be tested on the next run.
  it('drops ticks for rows that are no longer served', () => {
    const { component } = componentWith([rows[0]]);
    component.toggleSelected(1);
    component.toggleSelected(2);
    component.load();
    expect([...component.selected()]).toEqual([1]);
  });
});
