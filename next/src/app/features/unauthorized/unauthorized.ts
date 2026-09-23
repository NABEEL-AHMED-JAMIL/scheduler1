import { Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { roleLabel as labelOf } from '../../core/auth/auth.models';
import { PAGE_LABELS, PageKey, isPageKey } from '../../core/auth/page-keys';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';

/**
 * Two reasons land here and they read differently. A ROLE that cannot reach a page is a fact
 * about the account: nothing to ask for, an administrator changes the role or not. A PAGE the
 * person's access profile does not open is a choice their workspace admin made and can unmake,
 * so that version names the page and offers to ask -- the request lands in the admins' bell.
 */
@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink, Icon],
  template: `
    <div class="page">
      <div class="card p-10 text-center max-w-lg mx-auto mt-8">
        <app-icon name="shield" size="2.25rem" class="icon-warn block mx-auto mb-4" />
        @if (page(); as page) {
          <h1 class="text-xl font-semibold">{{ pageLabel() }} isn't part of your access</h1>
          <p class="text-sm text-[color:var(--text-secondary)] mt-2 leading-relaxed">
            Your workspace admin decides which pages each person can open, and this one is not
            in your access profile{{ profileName() ? ' (' + profileName() + ')' : '' }}. If you
            need it for your work, ask — the request goes straight to their notifications.
          </p>
          <div class="flex items-center justify-center gap-2 mt-6">
            <button type="button" class="btn btn-primary btn-sm" [disabled]="asking() || asked()"
                    (click)="requestAccess(page)">
              <app-icon name="bell" />{{ asked() ? 'Asked' : 'Request access' }}
            </button>
            <a routerLink="/" class="btn btn-default btn-sm">
              <app-icon name="chart" />Dashboard
            </a>
          </div>
        } @else {
          <h1 class="text-xl font-semibold">You do not have access to that page</h1>
          <p class="text-sm text-[color:var(--text-secondary)] mt-2 leading-relaxed">
            Your role is <strong>{{ roleLabel() }}</strong>, which cannot reach it. Roles are
            enforced on the server, so this is not something the page can work around — an
            administrator has to grant it.
          </p>
          <div class="flex items-center justify-center gap-2 mt-6">
            <button type="button" class="btn btn-default btn-sm" (click)="back()">
              <app-icon name="arrowLeft" />Go back
            </button>
            <a routerLink="/" class="btn btn-primary btn-sm">
              <app-icon name="chart" />Dashboard
            </a>
          </div>
        }
      </div>
    </div>
  `,
})
export class Unauthorized {
  private readonly auth = inject(AuthService);
  private readonly location = inject(Location);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  /** The page the guard named, or null when this was a role refusal. */
  readonly page = toSignal(this.route.queryParamMap.pipe(
    map(params => {
      const raw = params.get('page');
      return isPageKey(raw) ? raw : null;
    })), { initialValue: null as PageKey | null });

  readonly pageLabel = computed(() => {
    const page = this.page();
    return page ? PAGE_LABELS[page] : '';
  });

  readonly profileName = computed(() => this.auth.user()?.pageAccessProfileName ?? null);

  readonly asking = signal(false);
  readonly asked = signal(false);

  /** Mid-sentence, so lowercase: "Your role is tenant user". */
  roleLabel(): string {
    return labelOf(this.auth.role()).toLowerCase();
  }

  back(): void {
    this.location.back();
  }

  requestAccess(page: PageKey): void {
    this.asking.set(true);
    this.http.post<ApiResponse>(`${API_BASE}/pageAccess.json/requestAccess`, null, { params: { pageKey: page } })
      .subscribe({
        next: response => {
          this.asking.set(false);
          if (response.status === API_SUCCESS) {
            this.asked.set(true);
            this.toast.success(response.message || 'Asked your workspace admin.');
          } else {
            this.toast.error(response.message);
          }
        },
        error: err => {
          this.asking.set(false);
          this.toast.error(err?.error?.message || 'The request could not be sent.');
        },
      });
  }
}
