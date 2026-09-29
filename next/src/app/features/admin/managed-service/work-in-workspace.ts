import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthUser } from '../../../core/auth/auth.models';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { LoadError } from '../../../shared/ui/load-error';
import { ManagedGrant, ManagedServiceApi } from './managed-service.api';

/**
 * MIG-254: a staff member (a platform administrator with grants) picks a customer's workspace to work in. Opening
 * one asks identity-service for a managed-service session there (TENANT_ADMIN, marked msvc) and makes it the
 * active session; the platform session waits aside until the banner's Exit puts it back (AuthService).
 */
@Component({
  selector: 'app-work-in-workspace',
  imports: [Icon, ServerTimePipe, RouterLink, LoadError],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Work in a workspace</h1>
          <p class="page-subtitle">
            Open a managed session in a customer's workspace you hold a grant for. You work there as its administrator,
            and every change is audited. Exit returns you here.
          </p>
        </div>
        <button type="button" class="btn btn-default btn-sm" (click)="load()" [disabled]="loading()">
          <app-icon name="refresh" [class.spin]="loading()" />Refresh
        </button>
      </div>

      @if (openError()) {
        <div class="card px-4 py-2.5 flex items-center gap-2 border-crit-500" role="alert">
          <app-icon name="alert" class="icon-crit" /><p class="text-sm flex-1">{{ openError() }}</p>
        </div>
      }

      @if (loading() && !workspaces().length) {
        <div class="card p-8 text-center text-sm text-[color:var(--text-muted)]" role="status">Reading your workspaces…</div>
      } @else if (error()) {
        <div class="card p-0"><app-load-error [message]="error()" (retry)="load()" /></div>
      } @else if (!workspaces().length) {
        <div class="card p-8 flex flex-col items-center text-center gap-3">
          <span class="stat-glyph"><app-icon name="briefcase" /></span>
          <h2 class="text-base font-semibold">You have no managed workspaces.</h2>
          <p class="text-sm text-[color:var(--text-secondary)] max-w-xl">
            A platform administrator grants them in
            <a routerLink="/administration/managed-service" class="link-inline">Managed service</a>.
          </p>
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (w of workspaces(); track w.grantId) {
            <article class="card p-4 flex flex-col gap-3">
              <div class="flex items-start justify-between gap-3 min-w-0">
                <div class="min-w-0">
                  <h2 class="text-sm font-semibold truncate">{{ w.tenantName || ('Workspace ' + w.tenantId) }}</h2>
                  @if (w.grantedAt) {
                    <p class="mt-1 text-[11px] text-[color:var(--text-muted)]">granted {{ w.grantedAt | serverTime: 'date' }}</p>
                  }
                </div>
                <span class="pill shrink-0" [class]="w.managementMode === 'MANAGED' ? 'pill pill-brand shrink-0' : 'pill pill-neutral shrink-0'">
                  {{ w.managementMode === 'MANAGED' ? 'Managed' : 'Self-managed' }}
                </span>
              </div>
              <button type="button" class="btn btn-primary btn-sm self-start" [disabled]="opening() !== null"
                      [attr.aria-label]="'Work in ' + (w.tenantName || ('workspace ' + w.tenantId))" (click)="open(w)">
                <app-icon name="external" [busy]="opening() === w.tenantId" />Work here
              </button>
            </article>
          }
        </div>
      }
    </div>
  `,
})
export class WorkInWorkspace implements OnInit {
  private readonly api = inject(ManagedServiceApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly workspaces = signal<ManagedGrant[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly openError = signal('');
  /** The workspace a session is being opened in. */
  readonly opening = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.myWorkspaces().subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status === API_SUCCESS) this.workspaces.set(r.data ?? []);
        else this.error.set(r.message || 'Your workspaces could not be read.');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Your workspaces could not be read.');
      },
    });
  }

  open(workspace: ManagedGrant): void {
    if (this.opening() !== null) return;
    this.opening.set(workspace.tenantId);
    this.openError.set('');
    this.api.openSession(workspace.tenantId).subscribe({
      next: r => {
        this.opening.set(null);
        if (r.status !== API_SUCCESS || !r.data?.accessToken) {
          this.openError.set(r.message || 'The session could not be opened.');
          return;
        }
        // The answer is a sign-in's: the header's name and the workspace come from it, not from appUser.json/me,
        // which a staff member (of no workspace) cannot call in this session.
        this.auth.enterManagedSession({ tenantName: workspace.tenantName, ...r.data } as AuthUser);
        void this.router.navigate(['/dashboard']);
      },
      error: err => {
        this.opening.set(null);
        this.openError.set(err?.error?.message || 'The session could not be opened.');
      },
    });
  }
}
