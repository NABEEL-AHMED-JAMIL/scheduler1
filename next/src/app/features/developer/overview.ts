import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_SUCCESS, CUSTOMER_API_BASE } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { CopyButton } from '../../shared/ui/copy-button';
import { copyText } from '../../shared/ui/clipboard.util';
import { Icon } from '../../shared/ui/icon';
import { ApiClientsApi, SandboxInfo } from '../integration/api-clients/api-clients.api';
import { DOCS, DOWNLOADS, scrollToFragments } from './developer-docs';
import { GuideBody } from './guide-body';
import { PORTAL, parseGuide } from './guide-markdown';

/**
 * MIG-336: the developer portal's first page -- what the API is for (the contract's own description), its address, where
 * to start (the guides), the downloads, and the workspace's sandbox: a workspace administrator sees whether there is one
 * (Identity's apiClient.json/sandbox) and where its test keys are made; anyone else is told whom to ask.
 */
@Component({
  selector: 'app-developer-overview',
  imports: [RouterLink, Icon, CopyButton, GuideBody],
  styles: [`@media (min-width: 1536px) { .overview-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 26rem); } }`],
  template: `
    <div class="page" data-developer-overview>
      <div class="page-head">
        <div>
          <h1 class="page-title">Developer portal</h1>
          <p class="page-subtitle">{{ spec.info.summary || spec.info.title }}</p>
        </div>
      </div>

      <div class="overview-grid grid gap-4">
        <div class="flex flex-col gap-4 min-w-0">
          <section class="card p-4" data-api-purpose>
            <h2 class="section-title mb-2">What the API is for</h2>
            <div class="text-sm"><app-guide-body [blocks]="purpose" /></div>
          </section>

          <section data-start-here>
            <h2 class="section-title mb-2">Start here</h2>
            <div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              @for (g of guides; track g.slug) {
                <a class="card p-4 block hover:border-[color:var(--border-strong)]" [routerLink]="portal + '/guides/' + g.slug" [attr.data-guide-card]="g.slug">
                  <span class="font-medium">{{ g.title }}</span>
                  <span class="block text-sm text-[color:var(--text-secondary)] mt-1">{{ g.summary }}</span>
                </a>
              }
              <a class="card p-4 block hover:border-[color:var(--border-strong)]" [routerLink]="portal + '/reference'">
                <span class="font-medium">API reference</span>
                <span class="block text-sm text-[color:var(--text-secondary)] mt-1">Every call, its scopes, parameters, answers and errors, with a curl call to copy.</span>
              </a>
              <a class="card p-4 block hover:border-[color:var(--border-strong)]" [routerLink]="portal + '/changelog'">
                <span class="font-medium">Changelog</span>
                <span class="block text-sm text-[color:var(--text-secondary)] mt-1">What changed in the API, newest first.</span>
              </a>
            </div>
          </section>
        </div>

        <div class="flex flex-col gap-4 min-w-0">
          <section class="card p-4" data-base-url>
            <h2 class="section-title mb-2">Base URL</h2>
            <div class="flex items-center gap-2 min-w-0">
              <code class="md-inline-code break-all">{{ base }}</code>
              <app-copy-button [value]="base" [copied]="copied()" copiedLabel="Base URL copied" (copy)="copyBase()" />
            </div>
            <p class="text-sm text-[color:var(--text-secondary)] mt-2">
              Exchange an API client's id and secret for a 15-minute token at <code class="md-inline-code">POST {{ base }}/oauth/token</code>,
              then send it as <code class="md-inline-code">Authorization: Bearer</code>.
            </p>
          </section>

          <section class="card p-4" data-sandbox-card>
            <h2 class="section-title mb-2">Sandbox</h2>
            @if (!isAdmin) {
              <p class="text-sm text-[color:var(--text-secondary)]">Ask your workspace administrator for sandbox test keys.</p>
            } @else if (sandboxLoading()) {
              <p class="text-sm text-[color:var(--text-muted)]">Looking for your sandbox…</p>
            } @else if (sandboxError()) {
              <p class="text-sm text-[color:var(--warn-text)]" role="alert">{{ sandboxError() }}</p>
            } @else if (sandbox(); as s) {
              <p class="text-sm">Your sandbox: <span class="font-medium">{{ s.name }}</span> (workspace {{ s.tenantId }}).</p>
              <p class="text-sm text-[color:var(--text-secondary)] mt-1">
                Make test keys in <a class="md-link" routerLink="/integration/api-clients" fragment="sandbox">API Clients › Sandbox</a>: they
                work only there, and nothing there is billed.
              </p>
            } @else {
              <p class="text-sm text-[color:var(--text-secondary)]">No sandbox yet: ask your account team to create one.</p>
            }
          </section>

          <section id="downloads" class="card p-4 scroll-mt-20" data-downloads>
            <h2 class="section-title mb-2">Downloads</h2>
            <ul class="flex flex-col gap-2">
              @for (d of downloads; track d.href) {
                <li class="flex items-start gap-2">
                  <app-icon name="download" class="icon-muted mt-0.5 shrink-0" size="0.9em" />
                  <span><a class="md-link text-sm" [href]="d.href" download>{{ d.label }}</a>
                    <span class="block text-xs text-[color:var(--text-muted)]">{{ d.note }}</span></span>
                </li>
              }
            </ul>
          </section>
        </div>
      </div>
    </div>
  `,
})
export class DeveloperOverview {
  private readonly api = inject(ApiClientsApi);
  private readonly auth = inject(AuthService);

  readonly portal = PORTAL;
  readonly base = CUSTOMER_API_BASE;
  readonly spec = DOCS.spec;
  readonly purpose = parseGuide(DOCS.spec.info.description ?? '');
  readonly guides = DOCS.guides;
  readonly downloads = DOWNLOADS;
  readonly copied = signal(false);

  /** A workspace administrator (and up) sees the sandbox; Identity's sandbox call is theirs. */
  readonly isAdmin = this.auth.hasAtLeast('TENANT_ADMIN');
  readonly sandbox = signal<SandboxInfo | null>(null);
  readonly sandboxLoading = signal(false);
  readonly sandboxError = signal('');

  constructor() {
    scrollToFragments();
    if (this.isAdmin) this.loadSandbox();
  }

  private loadSandbox(): void {
    this.sandboxLoading.set(true);
    this.api.sandbox().subscribe({
      next: r => {
        this.sandboxLoading.set(false);
        if (r.status === API_SUCCESS) this.sandbox.set(r.data ?? null);
        else this.sandboxError.set(r.message || 'Your sandbox could not be read just now.');
      },
      error: err => {
        this.sandboxLoading.set(false);
        this.sandboxError.set(err?.error?.message || 'Your sandbox could not be read just now.');
      },
    });
  }

  copyBase(): void {
    copyText(this.base).then(done => {
      this.copied.set(done);
      if (done) setTimeout(() => this.copied.set(false), 1500);
    });
  }
}
