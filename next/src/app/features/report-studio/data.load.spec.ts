import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ToastService } from '../../shared/ui/toast.service';
import { StorageService } from '../objects/storage.service';
import { GeneratedService } from '../documents/generated/generated.service';
import { ReportStudioApi } from './report-studio.api';
import { RsTabCounts } from './rs-tab-counts';
import { InspectResult } from './report-studio.model';
import { ReportData } from './data';

/**
 * Owner 2026-10-27: Reports › Data said "0 schedules", "None yet", "Nothing uploaded yet" and "No template's required
 * fields are all here yet" before anything had answered, and the same when a read failed. Each read now has its own state;
 * the picked source's schema and sample rows sort.
 */
const failed = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));

const inspected: InspectResult = {
  records: 3, shape: 'list', warnings: [], sampleRecords: 3, inspected: 3, label: 'visits.csv', connector: 'UPLOAD', format: 'CSV', bytes: 90,
  sha256: 'abc', rootPath: '$', tree: { path: '$', type: 'list' },
  schema: [{ path: 'site', type: 'string', nullable: false }, { path: 'area', type: 'number', nullable: true }, { path: 'when', type: 'date', nullable: false }],
  sample: [{ site: 'Ward 9', area: 12, when: '2026-10-02' }, { site: 'Ward 10', area: 3.5, when: '2026-10-01' }, { site: 'Ward 2', area: null, when: '2026-10-03' }],
};

interface Answers {
  sources?: () => Observable<unknown>; contracts?: () => Observable<unknown>; buckets?: () => Observable<unknown>; schedules?: () => Observable<unknown>;
}

function screen(a: Answers = {}) {
  const api = {
    sources: vi.fn(a.sources ?? (() => of([]))), contracts: vi.fn(a.contracts ?? (() => of([]))), inspect: vi.fn(() => of(inspected)),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
    { provide: ReportStudioApi, useValue: api },
    { provide: StorageService, useValue: { buckets: vi.fn(a.buckets ?? (() => of({ status: 'SUCCESS', message: '', data: [] }))) } },
    { provide: GeneratedService, useValue: { schedules: vi.fn(a.schedules ?? (() => of([]))) } },
    { provide: AuthService, useValue: { isPlatformAdmin: () => false, role: () => 'TENANT_ADMIN', canOpen: () => true, user: signal({ tenantName: 'Riverside' }) } },
    { provide: RsTabCounts, useValue: { refresh: vi.fn() } },
    { provide: Dialog, useValue: { open: vi.fn() } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    { provide: WorkspaceDirectory, useValue: { remembered: () => null, nameOf: () => 'Riverside' } }] });
  // The component's logic only: its page (the source picker, the workspace picker) is not what this checks.
  TestBed.overrideComponent(ReportData, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(ReportData);
  fixture.detectChanges();
  return { d: fixture.componentInstance, api };
}

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('Reports › Data -- loading, empty, error (owner 2026-10-27)', () => {
  it('is loading -- not 0 or "None yet" -- until each read answers', () => {
    const { d } = screen({ sources: () => NEVER, contracts: () => NEVER, buckets: () => NEVER, schedules: () => NEVER });
    expect(d.sourcesState.pending()).toBe(true);
    expect(d.bucketsState.pending()).toBe(true);
    expect(d.schedulesState.pending()).toBe(true);
    expect(d.contractsState.pending()).toBe(true);
    expect(d.error()).toBe('');
  });

  it('is empty once the empty answers come', () => {
    const { d } = screen();
    expect(d.sourcesState.loaded()).toBe(true);
    expect(d.loading()).toBe(false);
    expect(d.uploads()).toEqual([]);
    expect(d.buckets()).toEqual([]);
    expect(d.schedules()).toBe(0);
  });

  it('says what could not be read, in plain words, instead of reading as none', () => {
    const { d } = screen({ sources: failed, buckets: failed, schedules: failed, contracts: failed });
    expect(d.loading()).toBe(false);
    expect(d.error()).toBe('The sources could not be read.');
    expect(d.bucketsState.error()).toBe('The buckets could not be read.');
    expect(d.schedulesState.error()).toBe('The schedules could not be read.');
    expect(d.contractsState.error()).toBe('Which templates can read it could not be checked.');
  });

  it('a bucket answer that is not a success is a failure too, not "None yet"', () => {
    const { d } = screen({ buckets: () => of({ status: 'ERROR', message: 'Storage is not reachable just now.' }) });
    expect(d.bucketsState.error()).toBe('Storage is not reachable just now.');
  });
});

describe('Reports › Data -- the schema and the sample rows sort (owner 2026-10-27)', () => {
  it('keeps the inspect\'s order, then sorts the schema by field both ways', () => {
    const { d } = screen();
    d.inspectSaved({ sourceId: 'S1', connector: 'UPLOAD', name: 'visits.csv' } as never);
    expect(d.sortedSchema().map(f => f.path)).toEqual(['site', 'area', 'when']);
    d.schemaSort.toggle('field');
    expect(d.sortedSchema().map(f => f.path)).toEqual(['area', 'site', 'when']);
    d.schemaSort.toggle('field');
    expect(d.sortedSchema().map(f => f.path)).toEqual(['when', 'site', 'area']);
  });

  it('sorts a sample column by its raw values: numbers as numbers, nothing last', () => {
    const { d } = screen();
    d.inspectSaved({ sourceId: 'S1', connector: 'UPLOAD', name: 'visits.csv' } as never);
    expect(d.sortedSample().map(r => r.cells[0])).toEqual(['Ward 9', 'Ward 10', 'Ward 2']);
    d.sampleSort.toggle('area');
    expect(d.sortedSample().map(r => r.raw[1])).toEqual([3.5, 12, null]);
    d.sampleSort.toggle('area');
    expect(d.sortedSample().map(r => r.raw[1])).toEqual([12, 3.5, null]);
    d.sampleSort.toggle('site');
    expect(d.sortedSample().map(r => r.cells[0])).toEqual(['Ward 2', 'Ward 9', 'Ward 10']);
  });

  it('a failed inspect says why and can be tried again', () => {
    const { d, api } = screen();
    api.inspect.mockImplementationOnce(failed);
    d.inspectSaved({ sourceId: 'S1', connector: 'UPLOAD', name: 'visits.csv' } as never);
    expect(d.busy()).toBe(false);
    expect(d.inspectError()).toBe('The data could not be read.');
    d.retryInspect();
    expect(d.inspectError()).toBe('');
    expect(d.result()?.label).toBe('visits.csv');
  });
});
