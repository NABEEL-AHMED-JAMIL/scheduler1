import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { API_SUCCESS } from '../../core/api/api.config';
import { GetStarted, startSteps } from './get-started';

/**
 * MIG-324: the dashboard of a brand-new workspace said nothing about what to do first. The guide lists the way to a
 * first run, ticks what the workspace already has, and goes once a run has completed.
 */
type Answers = Record<string, unknown>;
const EMPTY: Answers = {
  '/storageConnection.json/fetchAllConnections': [],
  '/storage.json/inbox': { configured: false },
  '/setting.json/topics?q=&limit=1': [],
  '/pipeline.json/list?page=1&limit=1': { summary: { total: 0 }, rows: [] },
  '/sourceTask.json/listSourceTask?page=1&limit=1': [],
  '/sourceJob.json/listSourceJob?page=1&limit=50': [],
};

function guide(answers: Answers = EMPTY, who: { build?: boolean; platform?: boolean } = {}, failing: string[] = []) {
  const reply = (url: string) => {
    const path = url.replace(/^.*\/api\/v1/, '');
    if (failing.includes(path)) return throwError(() => new Error('refused'));
    return of({ status: API_SUCCESS, data: answers[path] });
  };
  const get = vi.fn(reply);
  const post = vi.fn(reply);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get, post } },
    { provide: AuthService, useValue: {
      canBuild: () => who.build ?? true, isPlatformAdmin: () => who.platform ?? false, user: signal({ tenantId: 2945 }),
    } },
  ] });
  const component = TestBed.runInInjectionContext(() => new GetStarted());
  component.ngOnInit();
  return { component, get, post };
}

describe('GetStarted (MIG-324)', () => {
  // This browser's own store, as a Map: the test runner's localStorage is not one that keeps anything.
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear(),
    } });
  });

  it('lists the seven steps for an empty workspace, none done', () => {
    const { component } = guide();
    expect(component.visible()).toBe(true);
    expect(component.steps().map(s => s.key)).toEqual(['storage', 'inbox', 'topic', 'registry', 'pipeline', 'schedule', 'run']);
    expect(component.doneCount()).toBe(0);
    expect(component.steps().every(s => s.link.startsWith('/'))).toBe(true);
  });

  it('ticks what the workspace already has', () => {
    const { component } = guide({ ...EMPTY,
      '/storageConnection.json/fetchAllConnections': [{ storageConnectionId: 1 }],
      '/storage.json/inbox': { configured: true },
      '/setting.json/topics?q=&limit=1': [{ sourceTaskTypeId: 1 }],
      '/pipeline.json/list?page=1&limit=1': { rows: [{ pipelineKey: 1 }] },
      '/sourceJob.json/listSourceJob?page=1&limit=50': [{ jobId: 1, jobRunningStatus: 'Start' }],
    });
    expect(component.steps().filter(s => s.done).map(s => s.key)).toEqual(['storage', 'inbox', 'topic', 'registry', 'schedule']);
    expect(component.visible()).toBe(true);
  });

  it('goes away once a run has completed', () => {
    const { component } = guide({ ...EMPTY, '/sourceJob.json/listSourceJob?page=1&limit=50': [{ jobId: 1, jobRunningStatus: 'Completed' }] });
    expect(component.visible()).toBe(false);
  });

  it('counts a read that failed as not yet done, and still shows', () => {
    const { component } = guide(EMPTY, {}, ['/storage.json/inbox']);
    expect(component.visible()).toBe(true);
    expect(component.steps().find(s => s.key === 'inbox')!.done).toBe(false);
  });

  it('stays hidden once hidden, in this workspace', () => {
    guide().component.hide();
    const { component, get } = guide();
    expect(component.visible()).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('is not shown, nor read, for someone who cannot build here or for a platform administrator', () => {
    for (const who of [{ build: false }, { platform: true }]) {
      const { component, get } = guide(EMPTY, who);
      expect(component.visible()).toBe(false);
      expect(get).not.toHaveBeenCalled();
    }
  });

  it('marks the inbox optional and nothing else', () => {
    const none = { storage: false, inbox: false, topic: false, registry: false, pipeline: false, schedule: false, run: false };
    expect(startSteps(none).filter(s => s.optional).map(s => s.key)).toEqual(['inbox']);
  });
});
