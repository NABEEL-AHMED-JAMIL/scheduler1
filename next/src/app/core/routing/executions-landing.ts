import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * Pipelines › Executions without a schedule is the dashboard's drill into one hour across every schedule
 * (?targetDate=&targetHr=&jobStatus=). Opened bare -- from an old bookmark or a notification's link -- it was an
 * empty table saying "pick a job" with nothing to pick from (UI review U8). Bare, it now lands on the recent runs
 * of every schedule (the Queue), or on the schedule list to pick one from where the Queue is not this person's.
 */
export const executionsLanding: CanActivateFn = route => {
  const q = route.queryParamMap;
  if (q.has('targetDate') || q.has('targetHr') || q.has('jobStatus')) return true;
  const auth = inject(AuthService);
  return inject(Router).createUrlTree([auth.canOpen('queue') ? '/pipelines/queue' : '/pipelines/schedules']);
};
