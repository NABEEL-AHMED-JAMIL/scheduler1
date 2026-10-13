import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';

/**
 * UX review B7 (I1): one Connections page. Connectors (databases, SaaS apps, files -- page connector-hub) and Storage
 * (the S3, Azure, MinIO and FTP connections pipelines read and write -- workspace administrators) are its two tabs.
 * Each tab keeps its own address and its own gate, so the page keys and every old link still work; a tab the reader
 * cannot open is not offered.
 */
@Component({
  selector: 'app-connections-tabs',
  imports: [RouterLink, Icon],
  template: `
    @if (tabs().length > 1) {
      <nav class="tabs" aria-label="Connections" data-test="connections-tabs">
        @for (t of tabs(); track t.id) {
          <a class="tab" [class.tab-active]="active() === t.id" [routerLink]="t.link" [attr.aria-current]="active() === t.id ? 'page' : null"
             [attr.data-tab]="t.id"><app-icon [name]="t.icon" size="0.95em" />{{ t.label }}</a>
        }
      </nav>
    }
  `,
})
export class ConnectionsTabs {
  private readonly auth = inject(AuthService);
  readonly active = input.required<'connectors' | 'storage'>();
  readonly tabs = computed(() => {
    const can = (key: Parameters<AuthService['canOpen']>[0]) => typeof this.auth.canOpen === 'function' && this.auth.canOpen(key);
    const admin = typeof this.auth.isTenantAdmin === 'function' && this.auth.isTenantAdmin();
    return [
      ...(can('connector-hub') ? [{ id: 'connectors' as const, label: 'Connectors', icon: 'plug', link: '/integration/connectors' }] : []),
      ...(admin ? [{ id: 'storage' as const, label: 'Storage', icon: 'cloud', link: '/integration/connectors/storage' }] : []),
    ];
  });
}
