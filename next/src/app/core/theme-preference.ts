import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from './api/api.config';
import { AuthService } from './auth/auth.service';
import { ThemeChoice, ThemeService, isThemeChoice } from './theme.service';

/**
 * A theme chosen in the console: on screen at once, and kept on the person's account (Identity, PUT
 * appUser.json/theme) so their next sign-in on any device opens in it. null is "no choice of my own": the workspace's
 * default applies, else System.
 *
 * Answers whether the account kept it. A refusal (a staff member's managed-service session, the server unreachable)
 * still leaves the theme on screen and on this device.
 */
@Injectable({ providedIn: 'root' })
export class ThemePreference {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly themes = inject(ThemeService);

  /** The workspace's default, as the sign-in (or the profile) reported it. */
  workspaceDefault(): ThemeChoice | null {
    const value = this.auth.user()?.workspaceTheme;
    return isThemeChoice(value) ? value : null;
  }

  /** The person's own choice on their account, null when they have none. */
  own(): ThemeChoice | null {
    const value = this.auth.user()?.theme;
    return isThemeChoice(value) ? value : null;
  }

  choose(choice: ThemeChoice | null): Observable<boolean> {
    this.themes.pick(choice ?? this.workspaceDefault() ?? 'system');
    if (!this.auth.user()) return of(false);
    return this.http.put<ApiResponse<{ theme: string | null }>>(`${API_BASE}/appUser.json/theme`, { theme: choice }).pipe(
      map(response => response.status === API_SUCCESS),
      tap(kept => { if (kept) this.auth.patchUser({ theme: choice }); }),
      catchError(() => of(false)),
    );
  }
}
