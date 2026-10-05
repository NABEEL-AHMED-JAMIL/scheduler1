import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { ModelConnection } from './ai-providers';

/** Whether the workspace has an active default model connection: the one a question is answered with. */
export function hasWorkspaceDefault(connections: ModelConnection[], tenantId: number | null | undefined): boolean {
  return connections.some(c => c.tenantId === tenantId && !!c.isDefault && (c.status ?? 'Active') === 'Active');
}

/**
 * P2 #50: the first-run hint for a page that needs a model (the AI Assistant, Ask your data). Before, a new
 * workspace typed its first question and only then heard there was no model to answer it. A workspace
 * administrator -- who can list the connections, and set one up -- is told up front and given the link.
 * Nobody else is asked: aiConnection.json is an administrator's, and their refusal already says to ask one.
 */
@Component({
  selector: 'app-model-setup-banner',
  imports: [Icon, RouterLink],
  template: `
    @if (missing()) {
      <div class="card p-4 flex items-start gap-3 model-setup-banner" role="note" data-model-setup>
        <app-icon name="server" class="icon-info mt-0.5 shrink-0" />
        <div class="min-w-0 text-sm">
          <p class="font-semibold">Connect a model first</p>
          <p class="mt-0.5 text-[color:var(--text-secondary)]">
            {{ what() }} needs a model to answer with, and this workspace has no default model connection yet.
            Add one, local or hosted, and it becomes the default.
          </p>
          <a class="btn btn-primary btn-sm mt-3" routerLink="/ai/connections"><app-icon name="plus" />Add a model connection</a>
        </div>
      </div>
    }
  `,
  styles: [`.model-setup-banner { border-left: 3px solid var(--accent-mark); }`],
  host: { '[style.display]': "missing() ? 'block' : 'none'" },
})
export class ModelSetupBanner implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** What needs the model, as the sentence names it: "Ask your data", "The assistant". */
  readonly what = input('This page');

  private readonly connections = signal<ModelConnection[] | null>(null);
  readonly missing = computed(() => {
    const list = this.connections();
    return list !== null && !hasWorkspaceDefault(list, this.auth.user()?.tenantId);
  });

  ngOnInit(): void {
    const user = this.auth.user();
    if (!user?.tenantId || !this.auth.isTenantAdmin()) return;
    this.http.get<ApiResponse<ModelConnection[]>>(`${API_BASE}/aiConnection.json/list`).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.connections.set(r.data ?? []); },
      error: () => {},
    });
  }
}
