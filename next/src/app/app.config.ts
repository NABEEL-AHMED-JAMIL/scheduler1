import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { provideStaleBundleRecovery } from './core/stale-bundle';
import { provideTheme } from './core/theme.service';
import { PageTitleStrategy } from './core/page-title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // "Dashboard · ETL Console" on the tab, from each route's title.
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideHttpClient(withInterceptors([authInterceptor])),
    // Recovers a tab that was open across a deploy; see core/stale-bundle.ts.
    provideStaleBundleRecovery(),
    // Every route gets the chosen theme, including the ones outside the shell.
    provideTheme(),
  ],
};
