import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { ApiClientRow, ApiClientWithSecret, ApiClientsApi, SandboxInfo, ScopeRow } from './api-clients.api';
import { ClientDialog, ClientDialogData, ClientDialogResult } from './client-dialog';
import { SecretDialog, SecretDialogData } from './secret-dialog';

/**
 * MIG-336: API Clients › Sandbox. Our team makes a workspace a sandbox on request -- a separate workspace with sample
 * pipelines and data, never billed -- and its test keys (client ids cl_test_...) work only there. With one, its test
 * keys are listed here with New test key, New secret and Revoke: the same dialogs and confirmations as the workspace's
 * own clients, each call carrying `sandbox: true`.
 */
@Component({
  selector: 'app-sandbox-panel',
  imports: [Icon, ServerTimePipe, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  template: `
    <section id="sandbox" class="scroll-mt-20 mt-6" data-sandbox>
      <div class="flex items-center justify-between gap-2 mb-2">
        <div>
          <h2 class="text-base font-semibold">Sandbox</h2>
          <p class="text-sm text-[color:var(--text-muted)]">Test keys for building against the API without touching your real pipelines or your bill.</p>
        </div>
        @if (sandbox()) {
          <button type="button" class="btn btn-default btn-sm whitespace-nowrap shrink-0" (click)="openNew()" [disabled]="!scopes().length" data-new-test-key>
            <app-icon name="plus" />New test key
          </button>
        }
      </div>

      @if (loading()) {
        <div class="card p-4 text-sm text-[color:var(--text-muted)]">Looking for your sandbox…</div>
      } @else if (error()) {
        <div class="card p-4 text-sm flex flex-wrap items-center gap-2" role="alert">
          <span class="text-[color:var(--warn-text)]">{{ error() }}</span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (sandbox(); as s) {
        <div class="card p-0">
          <div class="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-subtle text-sm">
            <span class="pill pill-info">Test</span>
            <span class="font-medium">{{ s.name }}</span>
            <span class="text-[color:var(--text-muted)]">workspace {{ s.tenantId }}</span>
            <span class="text-[color:var(--text-muted)] text-xs">Keys here work only in the sandbox; nothing there is billed.</span>
          </div>
          @if (!clients().length) {
            <p class="p-4 text-sm text-[color:var(--text-muted)]" data-no-test-keys>No test keys yet. Make one to try the API against the sandbox's sample pipelines.</p>
          } @else {
            <div class="overflow-x-auto scroll-table">
              <table class="table-modern" data-sandbox-clients>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Client id</th>
                    <th>Scopes</th>
                    <th>Last used</th>
                    <th class="text-right">State</th>
                    <th class="w-12"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of clients(); track c.clientId) {
                    <tr [class.opacity-70]="c.status !== 'Active'">
                      <td class="max-w-64"><div class="flex items-center gap-1.5 min-w-0"><span class="pill pill-info">Test</span><span class="font-medium truncate">{{ c.name }}</span></div></td>
                      <td class="mono text-xs text-[color:var(--text-secondary)]">{{ c.clientId }}</td>
                      <td class="max-w-80">
                        <div class="flex flex-wrap gap-1">
                          @for (sc of c.scopes; track sc) { <span class="pill pill-neutral mono">{{ sc }}</span> }
                        </div>
                      </td>
                      <td class="whitespace-nowrap text-[color:var(--text-secondary)]">{{ c.lastUsedAt ? (c.lastUsedAt | serverTime: 'dateTime') : 'Never' }}</td>
                      <td class="text-right"><span [class]="statusPill(c)">{{ c.status }}</span></td>
                      <td class="text-right">
                        @if (c.status !== 'Revoked') {
                          <button type="button" class="btn btn-ghost btn-icon btn-sm" [cdkMenuTriggerFor]="keyMenu"
                                  [attr.aria-label]="'Actions for ' + c.name" [disabled]="busy() === c.clientId">
                            <app-icon name="dots" size="1em" [busy]="busy() === c.clientId" />
                          </button>
                          <ng-template #keyMenu>
                            <div cdkMenu class="card shadow-xl py-1 min-w-48 text-sm">
                              <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="rotate(c)"><app-icon name="refresh" />New secret</button>
                              <button cdkMenuItem class="menu-item menu-item-danger" (cdkMenuItemTriggered)="revoke(c)">
                                <app-icon name="power" class="icon-crit" />Revoke
                              </button>
                            </div>
                          </ng-template>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <p class="px-4 py-2.5 border-t border-subtle text-sm text-[color:var(--text-secondary)]">
            New to the API? Start with the <a class="md-link" routerLink="/integration/developer/guides/quickstart">quickstart</a>
            in the <a class="md-link" routerLink="/integration/developer">Developer portal</a>.
          </p>
        </div>
      } @else {
        <div class="card p-4 text-sm text-[color:var(--text-secondary)]" data-no-sandbox>
          No sandbox yet. Our team makes one for your workspace on request: a separate workspace with sample pipelines and data,
          never billed, whose test keys (cl_test_...) work only there.
        </div>
      }
    </section>
  `,
})
export class SandboxPanel implements OnInit {
  private readonly api = inject(ApiClientsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  /** The scopes a key may hold, as the page read them. */
  readonly scopes = input<ScopeRow[]>([]);

  readonly sandbox = signal<SandboxInfo | null>(null);
  readonly clients = signal<ApiClientRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  /** The Developer portal links here as #sandbox; the page is drawn only once the panel has read it. */
  private settled(): void {
    this.loading.set(false);
    if (this.route.snapshot.fragment !== 'sandbox') return;
    setTimeout(() => {
      const el = document.getElementById('sandbox');
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.sandbox().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) {
          this.error.set(r.message || 'Your sandbox could not be read.');
          this.settled();
          return;
        }
        this.sandbox.set(r.data ?? null);
        if (r.data) this.loadClients();
        else this.settled();
      },
      error: err => {
        this.error.set(err?.error?.message || 'Your sandbox could not be read.');
        this.settled();
      },
    });
  }

  private loadClients(): void {
    this.api.sandboxList().subscribe({
      next: r => {
        if (r.status === API_SUCCESS) this.clients.set(r.data ?? []);
        else this.error.set(r.message || 'The sandbox\'s test keys could not be read.');
        this.settled();
      },
      error: err => {
        this.error.set(err?.error?.message || 'The sandbox\'s test keys could not be read.');
        this.settled();
      },
    });
  }

  statusPill(client: ApiClientRow): string {
    return client.status === 'Active' ? 'pill pill-ok' : client.status === 'Expired' ? 'pill pill-warn' : 'pill pill-neutral';
  }

  openNew(): void {
    const data: ClientDialogData = { scopes: this.scopes(), client: null, bounds: null, canSetLimits: false, sandbox: true };
    this.dialog.open<ClientDialogResult>(ClientDialog, { data, hasBackdrop: true }).closed.subscribe(result => {
      if (!result) return;
      this.load();
      if ('made' in result) this.showSecret(result.made, false);
    });
  }

  private showSecret(client: ApiClientWithSecret, rotated: boolean): void {
    const data: SecretDialogData = { name: client.name, clientId: client.clientId, clientSecret: client.clientSecret, rotated };
    this.dialog.open(SecretDialog, { data, hasBackdrop: true, disableClose: true });
  }

  async rotate(client: ApiClientRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `New secret for ${client.name}?`,
      body: 'The current secret stops working now, and so does every token the test key holds.',
      confirmLabel: 'Make a new secret',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(client.clientId);
    this.api.rotateSecret(client.clientId, true).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS && r.data) {
          this.load();
          this.showSecret(r.data, true);
        } else {
          this.toast.error(r.message || 'The secret could not be changed.');
        }
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'The secret could not be changed.'); },
    });
  }

  async revoke(client: ApiClientRow): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Revoke ${client.name}?`,
      body: 'The test key and every token it holds stop working now, for good.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(client.clientId);
    this.api.revoke(client.clientId, true).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'Test key revoked.');
          this.load();
        } else {
          this.toast.error(r.message || 'The test key could not be revoked.');
        }
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'The test key could not be revoked.'); },
    });
  }
}
