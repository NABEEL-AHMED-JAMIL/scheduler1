import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { PageHeader } from '../../../shared/ui/page-header';
import { AlertRules } from './alert-rules';

/**
 * MIG-355: Settings › Alerts, a workspace administrator's -- the workspace's alerts and the rules that raise them: a run
 * failed (or N in X minutes), a schedule missed its slot, a run slower than usual, a review left waiting; told by the bell,
 * mail or the workspace's webhooks, to roles and groups, with quiet hours for mail.
 */
@Component({
  selector: 'app-alerts',
  imports: [PageHeader, AlertRules],
  template: `
    <div class="page" data-test="alerts-page">
      <app-page-header title="Alerts">
        <p subtitle class="page-subtitle">Be told when runs fail, schedules miss their slot, runs drag or reviews wait — by the bell, mail or your webhooks.</p>
      </app-page-header>
      <app-alert-rules [scope]="scope()" />
    </div>
  `,
})
export class Alerts {
  private readonly auth = inject(AuthService);
  /**
   * ZT-A12 follow-up (owner 2026-10-21, "Managed session only"): the platform administrator's own sign-in has no
   * workspace; the rules Core answers it are the platform's own, edited as the platform's (no schedule or access-profile
   * picker, which would read a workspace's schedules and groups).
   */
  readonly scope = computed(() => (isOwnPlatformSignIn(this.auth) ? 'platform' as const : 'workspace' as const));
}
