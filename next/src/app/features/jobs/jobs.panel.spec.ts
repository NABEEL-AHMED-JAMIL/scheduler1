import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { EMPTY, of } from 'rxjs';
import { Jobs, SourceJob } from './jobs';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { JobEventsService } from '../../core/socket/job-events.service';

/**
 * The expanded row labelled two different things "Topic" -- the task type's service name and the
 * Kafka topic -- and printed the partition wildcard raw, "partitions *".
 */
function jobs() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: [] }) } },
    { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: AuthService, useValue: { user: signal(null) } },
    { provide: JobEventsService, useValue: { events: EMPTY, connected: signal(false) } },
  ] });
  return TestBed.runInInjectionContext(() => new Jobs());
}

const withTopic = (queueTopicPartition: string) =>
  ({ jobId: 1, jobName: 'j', jobStatus: 'Active', jobRunningStatus: '',
     taskDetail: { sourceTaskType: { serviceName: 'service-1', queueTopicPartition } } }) as SourceJob;

describe('Jobs row panel topic', () => {
  it('says "all partitions" rather than printing the wildcard', () => {
    expect(jobs().topicOf(withTopic('topic=etl.reference&partitions=[*]'))).toBe('etl.reference (all partitions)');
  });

  it('names a single partition', () => {
    expect(jobs().topicOf(withTopic('topic=etl.reference&partitions=[0]'))).toBe('etl.reference (partition 0)');
  });

  it('labels the service name Type, as Tasks and Run history do, leaving Topic to the topic', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/jobs/jobs.html`, 'utf8');
    expect(html).toMatch(/label: 'Type',\s+value: job\.taskDetail\?\.sourceTaskType\?\.serviceName/);
    expect(html).not.toMatch(/label: 'Topic',\s+value: job\.taskDetail\?\.sourceTaskType\?\.serviceName/);
  });
});
