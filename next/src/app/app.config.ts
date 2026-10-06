import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { Routes, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { provideStaleBundleRecovery } from './core/stale-bundle';
import { provideTheme } from './core/theme.service';
import { PageTitleStrategy } from './core/page-title.strategy';

declare const ngDevMode: unknown;

/**
 * Routes that exist only in a development build (MIG-257).
 *
 * `ngDevMode` is defined as false by the production build, so this whole array -- and the
 * dynamic import inside it -- is removed from the production bundle: there is no gallery chunk and
 * no /dev address in production, and no menu has ever linked to it. Kept out of app.routes.ts so
 * the pinned route inventory (characterisation/routes) describes exactly what production serves.
 */
export const DEV_ROUTES: Routes = typeof ngDevMode === 'undefined' || ngDevMode
  ? [{
      path: 'dev/gallery',
      title: 'Component gallery',
      loadComponent: () => import('./features/dev/gallery').then(m => m.Gallery),
    }]
  : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter([...DEV_ROUTES, ...routes], withComponentInputBinding()),
    // "Dashboard · ETL Console" on the tab, from each route's title.
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideHttpClient(withInterceptors([authInterceptor])),
    // Recovers a tab that was open across a deploy; see core/stale-bundle.ts.
    provideStaleBundleRecovery(),
    // Every route gets the chosen theme, including the ones outside the shell.
    provideTheme(),
  ],
};
