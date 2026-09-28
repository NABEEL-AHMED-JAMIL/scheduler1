import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { JobHistory } from './job-history';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { JobEventsService } from '../../../core/socket/job-events.service';

/**
 * UI review jobs#10 and jobs#11 (MIG-295). The drill-down heading read "on 2026-09-24 at 10p", and
 * a run's length was written three ways on one screen: "25.3 s" in the table, "25s" on the tiles
 * and a bare "25" over its bar.
 */
function history() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: {} }) } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: AuthService, useValue: { canManageTasks: () => true } },
    { provide: JobEventsService, useValue: { events: new Subject(), connected: signal(false) } },
  ] });
  return TestBed.runInInjectionContext(() => new JobHistory());
}

const run = (id: number, start: string, end: string) =>
  ({ jobQueueId: id, jobId: 2838, jobStatus: 'Completed', startTime: start, endTime: end }) as any;

describe('Run history on the console clock', () => {
  it('heads an hour drill-down with a 24-hour range and a written day', () => {
    const h = history();
    expect(h.hourRange('22')).toBe('22:00–23:00');
    expect(h.hourRange('0')).toBe('00:00–01:00');
    expect(h.dayLabel('2026-09-24')).toBe('24 Sep 2026');
  });

  it('writes a run\'s length the same way in the table, the tiles and the bars', () => {
    const h = history();
    h.runs.set([
      run(1, '2026-09-24T10:00:00', '2026-09-24T10:00:25.300'),
      run(2, '2026-09-24T11:00:00', '2026-09-24T11:01:59.600'),
      run(3, '2026-09-24T12:00:00', '2026-09-24T12:00:00.420'),
    ]);
    expect(h.runs().map(r => h.duration(r))).toEqual(['25.3s', '2m', '420ms']);
    expect(h.durationTiles().map(t => t.value)).toEqual(['420ms', '25.3s', '2m']);
    expect(h.durationTrend().map(b => h.durationBarLabel(b.value))).toEqual(['25s', '2m', '<1s']);
    expect(h.durationTrend().map(b => b.name)).toEqual(['24 Sep', '24 Sep', '24 Sep']);
  });

  it('says nothing about the length of a run still going', () => {
    const h = history();
    expect(h.duration(run(4, '2026-09-24T10:00:00', ''))).toBeNull();
  });
});
