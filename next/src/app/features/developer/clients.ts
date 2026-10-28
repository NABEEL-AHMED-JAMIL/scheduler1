import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_SUCCESS, CUSTOMER_API_BASE } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/ui/page-header';
import { Icon } from '../../shared/ui/icon';
import { LoadError } from '../../shared/ui/load-error';
import { AppLoading, loadErrorText } from '../../shared/ui/loading';
import { ApiClientRow, ApiClientsApi, ScopeRow } from '../integration/api-clients/api-clients.api';
import { DOCS } from './developer-docs';
import { DevCode } from './code-block';
import { operationsOf } from './openapi';
import { methodClass } from './reference-model';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { contractScopes, coverageOf, quickStart } from './client-model';
import { PORTAL } from './guide-markdown';

/**
 * Owner #28 (2026-10-19): the portal from the workspace's own API clients -- pick one and see what it may call: every
 * operation of the contract its scopes allow, with a link into the reference, the ones it may not and the scope each
 * lacks, and a quick start (a token with its client id, then its first call). The scopes are Identity's live list
 * (apiClient.json/scopes); a scope the contract asks for that Identity does not offer, or one Identity offers that no
 * call asks for, is said here as a disagreement (and fails the console's developer-docs check and the portal e2e).
 * Workspace administrators (who manage the clients); anyone else with the portal's page sees how to ask for one. A
 * platform administrator picks the workspace in the header (the shared selector, opening on this session's last pick).
 */
@Component({
  selector: 'app-developer-clients',
  imports: [PageHeader, RouterLink, Icon, LoadError, AppLoading, DevCode, WorkspaceSelect],
  template: `
    <div class="page" data-developer-clients>
      <app-page-header title="Your API clients"
                       subtitle="What each of this workspace's API clients may call, and how it starts.">
        <app-workspace-select [value]="tenantId()" (valueChange)="pickWorkspace($event)" />
      </app-page-header>

      @if (!admin()) {
        <section class="card p-4 text-sm text-[color:var(--text-secondary)]">
          API clients are made by a workspace administrator under Developers › API Clients. Ask one for a client with the
          scopes your system needs; the reference names the scope each call asks for.
        </section>
      } @else if (needsWorkspace()) {
        <section class="card p-8 text-center text-sm text-[color:var(--text-muted)]" data-test="pick-workspace">
          Pick a workspace to see its API clients and what each may call.
        </section>
      } @else if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else {
        <div class="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <section class="card py-1" aria-label="API clients">
            @if (loading()) {
              <!-- Owner 2026-10-27: the shared loader, so a screen reader hears what is loading and a slow read says so. -->
              <app-loading shape="list" label="Loading API clients…" [count]="3" />
            } @else if (!clients().length) {
              <p class="text-sm text-[color:var(--text-muted)] p-3">No API client yet. <a class="link-inline" routerLink="/developers/api-clients">Make one</a>.</p>
            }
            <ul class="flex flex-col gap-0.5">
              @for (c of clients(); track c.clientId) {
                <li>
                  <button type="button" class="w-full text-left rounded-md px-3 py-2 hover:bg-[color:var(--surface-sunken)]"
                          [class.bg-sunken]="c.clientId === chosen()?.clientId" [attr.aria-pressed]="c.clientId === chosen()?.clientId"
                          [attr.data-client]="c.clientId" (click)="choose(c)">
                    <span class="block text-sm font-medium truncate">{{ c.name }}</span>
                    <span class="block mono text-xs text-[color:var(--text-muted)] truncate">{{ c.clientId }} · {{ c.status }}</span>
                  </button>
                </li>
              }
            </ul>
          </section>

          @if (chosen(); as c) {
            <div class="flex flex-col gap-4 min-w-0">
              <section class="card p-4" data-client-scopes>
                <h2 class="section-title mb-2">{{ c.name }}</h2>
                <div class="flex flex-wrap gap-1.5">
                  @for (s of c.scopes; track s) { <span class="pill pill-brand mono">{{ s }}</span> }
                  @if (!c.scopes.length) { <span class="text-sm text-[color:var(--text-muted)]">No scopes.</span> }
                </div>
                <p class="text-sm text-[color:var(--text-secondary)] mt-2">
                  {{ coverage().allowed.length }} of {{ operations.length }} calls allowed.
                  <a class="link-inline" routerLink="/developers/api-clients">Change its scopes</a>
                </p>
              </section>

              <section class="card p-4" data-quick-start>
                <h2 class="section-title mb-2">Quick start</h2>
                <app-dev-code label="Quick start (curl)" [snippets]="[{ key: 'curl', label: 'curl', code: start() }]" />
              </section>

              <section class="card overflow-hidden" data-client-allowed>
                <h2 class="section-title px-4 pt-4 pb-2">It may call</h2>
                <ul class="divide-y divide-[color:var(--border-subtle)]">
                  @for (op of coverage().allowed; track op.id) {
                    <li class="flex items-center gap-3 px-4 py-2 text-sm" [attr.data-allowed]="op.id">
                      <span [class]="methodOf(op.method)">{{ op.method.toUpperCase() }}</span>
                      <a class="mono text-xs link-inline min-w-0 truncate" [routerLink]="portal + '/reference'" [fragment]="'op-' + op.id">/v1{{ op.path }}</a>
                      <span class="text-[color:var(--text-secondary)] min-w-0 truncate ml-auto">{{ op.summary }}</span>
                    </li>
                  }
                </ul>
              </section>

              @if (coverage().denied.length) {
                <section class="card overflow-hidden" data-client-denied>
                  <h2 class="section-title px-4 pt-4 pb-2">Not with these scopes</h2>
                  <ul class="divide-y divide-[color:var(--border-subtle)]">
                    @for (d of coverage().denied; track d.op.id) {
                      <li class="flex items-center gap-3 px-4 py-2 text-sm text-[color:var(--text-muted)]" [attr.data-denied]="d.op.id">
                        <span class="pill pill-neutral mono">{{ d.op.method.toUpperCase() }}</span>
                        <span class="mono text-xs min-w-0 truncate">/v1{{ d.op.path }}</span>
                        <span class="ml-auto whitespace-nowrap">needs <span class="mono">{{ d.missing.join(', ') }}</span></span>
                      </li>
                    }
                  </ul>
                </section>
              }
            </div>
          }
        </div>

        @if (disagreement(); as d) {
          <section class="card p-4 text-sm text-warn-500 flex items-start gap-2" role="alert" data-scope-disagreement>
            <app-icon name="alert" class="shrink-0 mt-0.5" />
            <span>The reference and Identity's scopes disagree: {{ d }}</span>
          </section>
        }
      }
    </div>
  `,
})
export class DeveloperClients {
  private readonly api = inject(ApiClientsApi);
  private readonly auth = inject(AuthService);
  private readonly directory = inject(WorkspaceDirectory);

  readonly portal = PORTAL;
  readonly operations = operationsOf(DOCS.spec);
  /** The workspace a platform administrator picked; null for anyone else (their own). */
  readonly tenantId = signal<number | null>(this.directory.remembered());
  readonly needsWorkspace = computed(() => this.directory.picks() && this.tenantId() === null);
  readonly admin = computed(() => this.auth.isTenantAdmin());
  readonly clients = signal<ApiClientRow[]>([]);
  readonly scopes = signal<ScopeRow[] | null>(null);
  readonly chosen = signal<ApiClientRow | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly coverage = computed(() => coverageOf(this.operations, this.chosen()?.scopes ?? []));
  readonly start = computed(() => quickStart(DOCS.spec, this.operations, this.coverage(), this.chosen()?.clientId ?? '$CLIENT_ID',
    CUSTOMER_API_BASE));

  /** A scope one side has and the other does not, in words; empty when they agree. */
  readonly disagreement = computed(() => {
    const offered = this.scopes();
    if (!offered) return '';
    const contract = contractScopes(this.operations);
    const identity = offered.map(s => s.scope);
    const missing = contract.filter(s => !identity.includes(s));
    const extra = identity.filter(s => !contract.includes(s));
    return [missing.length ? `no client can be given ${missing.join(', ')}` : '',
      extra.length ? `${extra.join(', ')} is offered but no call asks for it` : ''].filter(Boolean).join('; ');
  });

  constructor() {
    if (this.admin() && !this.needsWorkspace()) this.load();
  }

  pickWorkspace(id: number | null): void {
    this.tenantId.set(id);
    this.clients.set([]);
    this.chosen.set(null);
    this.error.set('');
    if (id !== null) this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const asked = this.tenantId();
    this.api.list(asked).subscribe({
      next: r => {
        if (asked !== this.tenantId()) return;
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(loadErrorText(r, 'The API clients could not be read.')); return; }
        const active = (r.data ?? []).filter(c => c.status === 'Active');
        this.clients.set(active);
        if (!this.chosen() && active.length) this.chosen.set(active[0]);
      },
      error: err => {
        if (asked !== this.tenantId()) return;
        this.loading.set(false);
        this.error.set(loadErrorText(err, 'The API clients could not be read.'));
      },
    });
    this.api.scopes().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.scopes.set(r.data ?? []); },
      error: () => { /* the disagreement check needs them; without them it says nothing */ },
    });
  }

  choose(client: ApiClientRow): void {
    this.chosen.set(client);
  }

  methodOf(method: string): string {
    return methodClass(method);
  }
}
