import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';

interface SettingsArea {
  label: string;
  path: string;
  icon: string;
  blurb: string;
  platformOnly?: boolean;
}

@Component({
  selector: 'app-settings-hub',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Settings</h1>
          <p class="page-subtitle">
            Everything that shapes how jobs run, where they read and write, and who can reach them.
          </p>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        @for (area of areas(); track area.path) {
          <a [routerLink]="area.path"
             class="card p-4 flex items-start gap-3 transition-colors hover:border-brand-400
                    focus-visible:border-brand-500">
            <span class="settings-hub-glyph"><app-icon [name]="area.icon" size="1.15em" /></span>
            <span class="min-w-0">
              <span class="block text-sm font-semibold">{{ area.label }}</span>
              <span class="block text-xs text-[color:var(--text-muted)] mt-1 leading-snug">
                {{ area.blurb }}
              </span>
            </span>
            <app-icon name="chevronRight" size="0.9em" class="icon-muted ml-auto mt-0.5 shrink-0" />
          </a>
        }
      </div>
    </div>
  `,
})
export class SettingsHub {
  private readonly auth = inject(AuthService);

  private readonly all: SettingsArea[] = [
    { label: 'Users', path: '/admin/users', icon: 'users',
      blurb: 'Who can sign in, and what their role lets them reach.' },
    { label: 'Tenants', path: '/admin/tenants', icon: 'globe', platformOnly: true,
      blurb: 'Isolated workspaces. Jobs, buckets and users never cross between them.' },
    { label: 'Storage Connections', path: '/admin/storage', icon: 'cloud',
      blurb: 'S3, Azure, MinIO and FTP endpoints that jobs read from and write to.' },
    { label: 'Kafka Connections', path: '/settings/kafka', icon: 'server',
      blurb: 'Broker settings, security protocol and credentials for the pipeline.' },
    { label: 'Source Task Types', path: '/settings/task-types', icon: 'layers',
      blurb: 'The kinds of task a job can run, and the topic each one publishes to.' },
    { label: 'Task Forms', path: '/settings/forms', icon: 'template',
      blurb: 'Describe what a pipeline expects so tasks are filled in, not hand-written.' },
    { label: 'Dynamic Forms', path: '/settings/dynamic-forms', icon: 'inbox',
      blurb: 'Build a form, share its link, and collect the answers people send back.' },
    { label: 'Lookups', path: '/settings/lookup', icon: 'list',
      blurb: 'Shared key/value data the forms and pipelines read from.' },
    { label: 'Q-Message', path: '/queue', icon: 'clock',
      blurb: 'What has been queued, what ran, and what it returned.' },
  ];

  readonly areas = computed(() => {
    const isPlatform = this.auth.isPlatformAdmin();
    return this.all.filter(a => !a.platformOnly || isPlatform);
  });
}
