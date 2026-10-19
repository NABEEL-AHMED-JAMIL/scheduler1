import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';

interface TenantOption { tenantId: number; tenantName: string; }

/**
 * Which workspace the billing screens are looking at -- since owner #5 (2026-10-19) the platform-wide choice of the one
 * workspace selector (shared/ui/workspace-select.ts, WorkspaceDirectory), so the workspace picked on Users or Cost &amp;
 * usage is the one Invoices opens with. A workspace admin has no choice and the value stays empty, which the server reads
 * as "your own". A platform administrator's choice is EMPTY until they make one, which Invoices and Documents read as every
 * workspace ("All workspaces") and Cost &amp; usage, which needs one, reads as the first (`effective`). A deep link to
 * another workspace's invoice is never replaced by the choice.
 */
@Injectable({ providedIn: 'root' })
export class WorkspacePicker {
  private readonly auth = inject(AuthService);
  private readonly directory = inject(WorkspaceDirectory);

  readonly tenants = computed<TenantOption[]>(() => this.directory.workspaces().map(w => ({ tenantId: w.tenantId, tenantName: w.tenantName })));
  /** The choice as the billing calls send it (a string id), or null; `set` is a pick, kept for the session. */
  readonly tenantId = Object.assign(computed(() => {
    const chosen = this.directory.chosen();
    return chosen === null ? null : String(chosen);
  }), {
    set: (id: string | null) => {
      const n = Number(id);
      this.directory.choose(id && Number.isFinite(n) && n > 0 ? n : null);
    },
  });
  /** How each workspace is named in the pickers: two that share a name carry their ids, or they read as one. */
  readonly labels = this.directory.names;
  readonly options = computed(() => this.tenants().map(t => ({ value: String(t.tenantId), label: this.labels().get(t.tenantId) ?? t.tenantName })));
  readonly isPlatformAdmin = this.auth.isPlatformAdmin;
  readonly name = computed(() => this.options().find(o => o.value === this.tenantId())?.label ?? '');
  /** The choice, or the first workspace when none was made: for the screens that must look at one. */
  readonly effective = computed(() => this.tenantId() ?? (this.tenants().length ? String(this.tenants()[0].tenantId) : null));
  /** The choice as a number (the shared selector's value), or null for none / every workspace. */
  readonly chosenId = computed(() => this.directory.chosen());
  /** The effective one as a number, for the shared selector on a page that needs one. */
  readonly effectiveId = computed(() => { const e = this.effective(); return e === null ? null : Number(e); });

  /** Runs `then` once a workspace is known: at once for a tenant administrator, after the list for a platform administrator. */
  ready(then: () => void): void {
    if (!this.isPlatformAdmin()) { then(); return; }
    this.directory.load().subscribe({ next: () => then(), error: () => then() });
  }
}
