import { Injectable, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthUser } from '../../../core/auth/auth.models';
import { confirmWith } from '../../../shared/ui/confirm';
import { ToastService } from '../../../shared/ui/toast.service';
import { ManagedServiceApi } from './managed-service.api';

/**
 * Owner #20 (2026-10-19): "Work in this workspace" -- on Platform › Workspaces' row menu and beside the workspace selector --
 * replaces the separate Work in a workspace page. It opens a managed-service session there (identity-service: TENANT_ADMIN,
 * marked msvc, every change audited) and makes it the active session; the banner's Exit puts the platform session back on
 * Platform › Workspaces.
 *
 * A staff member needs a managed-service grant for the workspace. Without one, they are asked first and may grant it to
 * themselves -- the grant is recorded in Managed service (and revoked there), exactly as one given by another administrator.
 */
@Injectable({ providedIn: 'root' })
export class ManagedSession {
  private readonly api = inject(ManagedServiceApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  /** The workspace a session is being opened in, or null. */
  readonly opening = signal<number | null>(null);

  /** Whether this reader may open one: a platform administrator in their own session. */
  available(): boolean {
    return this.auth.isPlatformAdmin() && !this.auth.isManagedSession();
  }

  /** The workspaces this staff member holds an open grant for. */
  async granted(): Promise<Set<number>> {
    const r = await firstValueFrom(this.api.myWorkspaces());
    return new Set(r?.status === API_SUCCESS ? (r.data ?? []).filter(g => !g.revokedAt).map(g => g.tenantId) : []);
  }

  /** Opens a managed session in the workspace (asking to grant one first when there is none); false when it did not. */
  async workIn(tenantId: number, tenantName: string): Promise<boolean> {
    if (!this.available() || this.opening() !== null) return false;
    this.opening.set(tenantId);
    try {
      let mine: Set<number>;
      try {
        mine = await this.granted();
      } catch (err) {
        this.toast.error((err as { error?: { message?: string } })?.error?.message || 'Your managed workspaces could not be read.');
        return false;
      }
      if (!mine.has(tenantId)) {
        const me = this.auth.user()?.appUserId;
        const ok = await confirmWith(this.dialog, {
          title: `Work in ${tenantName}?`,
          body: `You hold no managed-service grant for ${tenantName}. Grant yourself one to open it: the grant is listed in `
            + 'Managed service, where it can be revoked, and every change you make in the workspace is audited.',
          confirmLabel: 'Grant and open',
        });
        if (!ok || me == null) return false;
        const granted = await firstValueFrom(this.api.grant(tenantId, me));
        if (granted?.status !== API_SUCCESS) {
          this.toast.error(granted?.message || 'The grant could not be made.');
          return false;
        }
      }
      const r = await firstValueFrom(this.api.openSession(tenantId));
      if (r?.status !== API_SUCCESS || !r.data?.accessToken) {
        this.toast.error(r?.message || 'The session could not be opened.');
        return false;
      }
      // The answer is a sign-in's: the header's name and the workspace come from it, not from appUser.json/me, which a
      // staff member (of no workspace) cannot call in this session.
      this.auth.enterManagedSession({ tenantName, ...r.data } as AuthUser);
      await this.router.navigate(['/dashboard']);
      return true;
    } catch (err) {
      this.toast.error((err as { error?: { message?: string } })?.error?.message || 'The session could not be opened.');
      return false;
    } finally {
      this.opening.set(null);
    }
  }
}
