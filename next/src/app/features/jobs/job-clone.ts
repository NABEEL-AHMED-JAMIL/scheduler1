/**
 * The job a "Duplicate" posts, built from the source job read back in full.
 *
 * There is no clone endpoint: the copy is the source job posted as a new one, under a name that
 * tells them apart. Every setting a person chose in the editor must survive the copy -- the job
 * editor's own payload (edit/job-edit.ts) is the list to keep this in step with.
 *
 * @author Nabeel Ahmed
 */
export function clonePayload(source: any): any {
  const payload: any = {
    jobName: `${source.jobName} (copy)`,
    taskDetail: { taskDetailId: source.taskDetail?.taskDetailId },
    execution: source.execution,
    priority: source.priority,
    maxAttempts: source.maxAttempts,
    retryBackoffSeconds: source.retryBackoffSeconds,
    // A copy starts inactive: cloning a live schedule should not silently double the runs.
    jobStatus: 'Inactive',
    completeJob: source.completeJob,
    failJob: source.failJob,
    skipJob: source.skipJob,
  };
  if (source.scheduler) {
    payload.schedulers = [{
      startDate: source.scheduler.startDate,
      endDate: source.scheduler.endDate,
      startTime: source.scheduler.startTime,
      frequency: source.scheduler.frequency,
      intervalValue: source.scheduler.intervalValue,
      daysOfWeek: source.scheduler.daysOfWeek,
      dayOfMonth: source.scheduler.dayOfMonth,
    }];
  }
  return payload;
}
