import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { executionsLanding } from './executions-landing';

function run(query: Record<string, string>, canQueue: boolean): boolean | UrlTree {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
    { provide: AuthService, useValue: { canOpen: (page: string) => page !== 'queue' || canQueue } }] });
  const route = { queryParamMap: convertToParamMap(query) } as ActivatedRouteSnapshot;
  return TestBed.runInInjectionContext(() => executionsLanding(route, {} as RouterStateSnapshot)) as boolean | UrlTree;
}

describe('UI review U8: Executions opened bare is not a dead end', () => {
  it('keeps the dashboard\'s hour drill', () => {
    expect(run({ targetDate: '2026-10-05', targetHr: '14' }, true)).toBe(true);
  });

  it('lands on the recent runs, or on the schedules to pick from without the Queue', () => {
    const router = () => TestBed.inject(Router);
    expect(router().serializeUrl(run({}, true) as UrlTree)).toBe('/pipelines/queue');
    expect(router().serializeUrl(run({}, false) as UrlTree)).toBe('/pipelines/schedules');
  });
});
