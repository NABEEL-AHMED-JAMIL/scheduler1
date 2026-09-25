import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Tasks } from './tasks';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * The search box promised "topic" and matched only the service name, so typing the Kafka topic the
 * Topic column shows found nothing; the topic filter listed service names with no sign of a topic.
 */
function tasksScreen() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({}), post: () => of({}), put: () => of({}) } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
      { provide: AuthService, useValue: { user: () => null, canManageTasks: () => true } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Tasks());
}

const TASK = {
  taskDetailId: 7714, taskName: 'Hurricanes ETL', taskStatus: 'Active',
  sourceTaskType: { sourceTaskTypeId: 3, serviceName: 'service-1 reference worker',
                    queueTopicPartition: 'topic=etl.reference&partitions=[*]' },
};

describe('Tasks topic', () => {
  it('finds a task by the Kafka topic its Topic column shows', () => {
    const tasks = tasksScreen();
    tasks.tasks.set([TASK as any]);
    tasks.search.set('etl.reference');
    expect(tasks.filtered().length).toBe(1);
  });

  it('shows the Kafka topic beside each option in the topic filter', () => {
    const tasks = tasksScreen();
    tasks.tasks.set([TASK as any]);
    expect(tasks.topicComboOptions()).toEqual([{ value: '3', label: 'service-1 reference worker', hint: 'etl.reference' }]);
  });
});
