import { EnvironmentProviders, provideEnvironmentInitializer, inject } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';

/**
 * How a browser recovers when the deployment changes underneath it.
 *
 * Every route on this app is lazy: app.routes.ts loads each screen with a dynamic import of a
 * content-hashed chunk. A deploy replaces those hashes, so a tab that was opened BEFORE the
 * deploy still holds the old main bundle, and the first navigation afterwards asks for a chunk
 * filename that no longer exists on the server. The request 404s, the dynamic import rejects,
 * and the router simply stops -- the nav bar goes dead with nothing on screen to say why, and
 * the user's only recourse is to guess that a hard refresh will fix it.
 *
 * This is not a rare edge: it happens to every open tab on every deploy.
 *
 * The recovery is the only one available, since the code needed to continue is genuinely gone:
 * reload the page so the browser fetches the new index.html and the new bundle. The router's
 * NavigationError carries the URL the user was trying to reach, so they land where they meant
 * to go rather than back at the start.
 */

/** What a failed chunk import looks like across the engines this app runs in. */
const CHUNK_LOAD_FAILURE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|ChunkLoadError|Importing a module script failed/i;

/**
 * Guards against a reload loop. If the reload does NOT fix it -- a genuinely missing chunk on
 * the server, an offline browser -- reloading again would spin for ever, so a second failure
 * for the same URL is left alone to surface as an ordinary error.
 */
const ATTEMPT_KEY = 'etl:stale-bundle-reload';

/**
 * Whether this error is a lazy chunk that is no longer on the server.
 *
 * Exported and pure so the decision can be tested without standing up a router: the interesting
 * part is which messages count, and that is a property of the string, not of Angular.
 */
export function isStaleChunkError(error: unknown): boolean {
  const message = String(
    (error as { message?: unknown })?.message ?? error ?? '');
  return CHUNK_LOAD_FAILURE.test(message);
}

/**
 * Records the attempt and says whether a reload should happen. One reload per URL, released
 * again by clearStaleBundleMarker() once a navigation succeeds.
 */
export function shouldReloadFor(url: string): boolean {
  if (alreadyTried(url)) return false;
  remember(url);
  return true;
}

function alreadyTried(url: string): boolean {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY) === url;
  } catch {
    // Private mode, or storage disabled. Better to reload once too often than never.
    return false;
  }
}

function remember(url: string): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, url);
  } catch { /* nothing to do; the reload still happens */ }
}

export function clearStaleBundleMarker(): void {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch { /* ignore */ }
}

export function provideStaleBundleRecovery(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const router = inject(Router);
    router.events.subscribe(event => {
      // A navigation that succeeded means this URL is healthy again, so the one-shot guard is
      // released. Without this the marker would outlive the problem and block recovery from a
      // LATER deploy for the rest of the session.
      if (event instanceof NavigationEnd) { clearStaleBundleMarker(); return; }
      if (!(event instanceof NavigationError)) return;
      if (!isStaleChunkError(event.error)) return;

      const url = event.url || '/';
      if (!shouldReloadFor(url)) return;
      // replace(), not assign(): the failed navigation should not become a history entry the
      // user can go "back" into and fail on again.
      location.replace(url);
    });
  });
}
