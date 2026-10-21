import { inject } from '@angular/core';
import { CanMatchFn, Route, Routes } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * ZT-A12 follow-up (owner 2026-10-21, "Managed session only"): a platform administrator's OWN sign-in -- a platform
 * administrator with no workspace, not a managed session -- never reads or decides a workspace's data. A workspace's
 * pipelines, runs, files, reports, forms, prompts and connections open only in "Work in this workspace" (a managed
 * session, where the person is that workspace's administrator and every change and data read is recorded). The services
 * answer the own sign-in 403 on them; the console does not ask.
 *
 * Read defensively: a screen's unit test often stands in a plain object for AuthService.
 */
export function isOwnPlatformSignIn(auth: Partial<Pick<AuthService, 'isPlatformAdmin' | 'user'>> | null | undefined): boolean {
  if (!auth || typeof auth.isPlatformAdmin !== 'function') return false;
  return !!auth.isPlatformAdmin() && !(typeof auth.user === 'function' && auth.user()?.tenantId);
}

/**
 * What a route that is a workspace's page says to the own sign-in instead of opening (`data.workspaceData`), in
 * NeedsWorkspace's words: "{what} a workspace's, and this sign-in has none." / "... to {todo}."
 */
export interface WorkspaceDataCard {
  what: string;
  todo: string;
  icon?: string;
}

/** Matches only for the own sign-in: the card route in front of each workspace page (see withWorkspaceCards). */
export const ownSignInOnly: CanMatchFn = () => isOwnPlatformSignIn(inject(AuthService));

/**
 * The one mechanism for every workspace page (ZT-A12 follow-up): each route whose data carries `workspaceData` gets a
 * twin in front of it, on the same address, that matches only for the own sign-in and shows WorkspaceDataPage -- the
 * page's title, its hub's tabs and the needs-workspace card -- in place of the page. The address and the menu stay as
 * they are; the page itself is never created, so it makes no call. A managed session (and everyone else) skips the twin
 * and opens the page as before. canMatch is asked on every navigation, so a sign-in that changes (opening or leaving
 * "Work in this workspace") is followed on the next move.
 */
export function withWorkspaceCards(routes: Routes): Routes {
  return routes.flatMap(route => {
    const card = route.data?.['workspaceData'] as WorkspaceDataCard | undefined;
    if (!card) return [route];
    const twin: Route = {
      path: route.path,
      ...(route.pathMatch ? { pathMatch: route.pathMatch } : {}),
      ...(route.title !== undefined ? { title: route.title } : {}),
      data: route.data,
      canMatch: [ownSignInOnly],
      // The page's own guards too: the twin is the same page to whoever may not open it.
      ...(route.canActivate ? { canActivate: route.canActivate } : {}),
      loadComponent: () => import('../../shared/ui/workspace-data-page').then(m => m.WorkspaceDataPage),
      // A page with pages under it (its own children or a lazily loaded set): every address under it is the card too.
      ...(route.children || route.loadChildren ? { children: [{ path: '**', children: [] }] } : {}),
    };
    return [twin, route];
  });
}
