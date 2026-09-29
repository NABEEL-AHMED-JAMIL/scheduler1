import { Component, inject, input } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from './icon';

/**
 * MIG-254: the notice a build screen shows in a MANAGED workspace -- our team builds it, so what the
 * screen would let an administrator change is read-only here. Renders nothing anywhere else (a SELF
 * workspace, a platform administrator, our staff's own managed-service session), so a screen can carry
 * it unconditionally.
 */
@Component({
  selector: 'app-managed-banner',
  imports: [Icon],
  template: `
    @if (auth.builderLocked()) {
      <div class="card px-4 py-2.5 flex items-start gap-2.5 managed-banner" role="note" data-managed-banner>
        <app-icon name="shield" class="icon-info mt-0.5 shrink-0" />
        <div class="min-w-0 text-sm">
          <p class="font-semibold">Managed by our team</p>
          <p class="mt-0.5 text-[color:var(--text-secondary)]">
            Our team builds and changes this workspace's {{ what() }}, so {{ they() }} read-only here.
            Contact your account team to request a change.
          </p>
        </div>
      </div>
    }
  `,
  styles: [`.managed-banner { border-left: 3px solid var(--accent-mark); }`],
})
export class ManagedBanner {
  readonly auth = inject(AuthService);
  /** What the screen builds, as the sentence names it: "pipelines", "schedules", "inbox settings". */
  readonly what = input('setup');
  /** "is" for a single thing ("setup"), "are" for the rest. */
  readonly they = () => (this.what() === 'setup' ? 'it is' : 'they are');
}
