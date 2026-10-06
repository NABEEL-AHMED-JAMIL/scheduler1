import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { EMPTY, of } from 'rxjs';
import { ToastService } from '../shared/ui/toast.service';
import { AuthService } from '../core/auth/auth.service';
import { JobEventsService } from '../core/socket/job-events.service';
import { StorageConnections } from './admin/storage/storage-connections';
import { KafkaConnections } from './settings/kafka/kafka-connections';
import { Jobs } from './jobs/jobs';
import { Tasks } from './tasks/tasks';

/**
 * "Only mine" is a filter like any other. On four list screens Clear ignored it: with only that
 * toggle on, Kafka showed "Clear filters" and the button did nothing; Storage, Jobs and Tasks did
 * not offer Clear at all, and "No connections match the filters" sat there with no way out.
 */
function build<T>(type: new () => T): T {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: [] }), post: () => of({ status: 'SUCCESS', data: [] }) } },
    { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) }, queryParamMap: of(convertToParamMap({})) } },
    { provide: AuthService, useValue: { user: signal({ appUserId: 7 }), isPlatformAdmin: () => false } },
    { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
  ] });
  return TestBed.runInInjectionContext(() => new type());
}

const screens: [string, () => { onlyMine: any; hasFilters: () => boolean; clearFilters: () => void }][] = [
  ['Storage connections', () => build(StorageConnections) as any],
  ['Kafka profiles', () => build(KafkaConnections) as any],
  ['Jobs', () => build(Jobs) as any],
  ['Tasks', () => build(Tasks) as any],
];

describe('Clear, when Only mine is the one filter on', () => {
  for (const [name, open] of screens) {
    it(`${name}: offers Clear, and Clear turns it off`, () => {
      const screen = open();
      screen.onlyMine.set(true);
      expect(screen.hasFilters()).toBe(true);

      screen.clearFilters();

      expect(screen.onlyMine()).toBe(false);
      expect(screen.hasFilters()).toBe(false);
    });
  }
});
