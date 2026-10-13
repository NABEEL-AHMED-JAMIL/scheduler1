import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { RedirectFunction, Router, UrlTree } from '@angular/router';
import { API_BASE, ApiResponse } from '../api/api.config';
import { AuthService } from '../auth/auth.service';
import { NavGate, NavHub, NavTab, NavViewer, entryVisible, hubByPath, passes, visibleTabs } from './nav-tree';

/**
 * The reader as the menu and the tab hubs see them: role, access-profile pages, and whether our team's activity is
 * worth offering. One answer for the menu (shell.ts), a hub's tab strip (shared/ui/tab-hub.ts) and a hub's address
 * (`toFirstTab`), so the three never disagree about what someone may open.
 */
@Injectable({ providedIn: 'root' })
export class NavAccess {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  /** MIG-254: our team has acted in this SELF workspace (asked once, when the menu is first opened). */
  private readonly teamActivitySeen = signal(false);
  private teamActivityAsked = false;
  readonly showTeamActivity = computed(() => this.auth.managementMode() === 'MANAGED' || this.teamActivitySeen());

  /** Recomputes when the session changes: a token refresh can bring a changed profile. */
  readonly viewer = computed<NavViewer>(() => {
    this.auth.pageKeys();
    const isAdmin = this.auth.isTenantAdmin();
    const isPlatform = this.auth.isPlatformAdmin();
    const showTeam = this.showTeamActivity();
    return { canOpen: key => this.auth.canOpen(key), isAdmin, isPlatform, showTeam };
  });

  passes(gate: NavGate): boolean { return passes(gate, this.viewer()); }
  visible(entry: NavGate & { tabs?: NavTab[]; crumbOnly?: boolean }): boolean { return entryVisible(entry, this.viewer()); }
  tabsOf(hub: { tabs?: NavTab[] }): NavTab[] { return visibleTabs(hub, this.viewer()); }

  /**
   * Whether a SELF workspace has any of our team's changes, asked when a menu first opens (or a hub that offers the
   * Activity tab is shown) rather than on every page: one small read, and only for the one person it can change the
   * menu for.
   */
  checkTeamActivity(): void {
    if (this.teamActivityAsked || !this.auth.isTenantAdmin() || this.auth.isPlatformAdmin() || this.showTeamActivity()) return;
    this.teamActivityAsked = true;
    this.http.get<ApiResponse<unknown[]>>(`${API_BASE}/managedService.json/actions`, { params: { limit: 1 } }).subscribe({
      next: r => this.teamActivitySeen.set(!!r.data?.length),
      error: () => { /* the menu stays as it is */ },
    });
  }
}

/**
 * A hub's own address ("/connections", the menu entry's link) opens its first tab the reader may open. With none, the
 * reader gets the console's 403 page -- naming the first tab's page when it has one, so they can ask for it -- never an
 * empty hub. The tab it lands on is guarded like any other route, so this redirect grants nothing.
 */
export const toFirstTab: RedirectFunction = redirect => {
  const router = inject(Router);
  const hub: NavHub | undefined = hubByPath('/' + (redirect.routeConfig?.path ?? ''));
  const tab = hub ? inject(NavAccess).tabsOf(hub)[0] : undefined;
  if (tab) return router.createUrlTree([tab.path], { queryParams: redirect.queryParams, fragment: redirect.fragment ?? undefined });
  return refusal(router, hub);
};

function refusal(router: Router, hub: NavHub | undefined): UrlTree {
  const page = hub?.tabs.find(t => t.pageKey)?.pageKey;
  return router.createUrlTree(['/unauthorized'], { queryParams: page ? { page, title: hub!.label } : {} });
}
